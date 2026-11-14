from uuid import uuid4

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import aliased
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.admins.models import AdminUser
from app.modules.admins.permissions import AdminRole
from app.modules.bookings.models import Booking
from app.modules.bookings.service import create_booking_for_locked_customer
from app.modules.crm.models import FollowUp, Lead, LeadEvent, LeadSource
from app.modules.crm.schemas import ConversionInput, FollowUpInput, LeadInput
from app.modules.customers.credentials import utc_now
from app.modules.customers.models import Customer

CORE_FIELDS = {"name", "phone", "location", "district", "installation_date", "source", "priority"}
NO_CONTACT = "do_not_contact"


def access(actor):
    return Lead.assigned_to == actor.id if actor.role == AdminRole.STAFF else True


def get_lead(db, actor, lead_id, *, lock=False):
    query = select(Lead).where(Lead.id == lead_id, access(actor))
    lead = db.scalar(query.with_for_update() if lock else query)
    if lead is None:
        raise AppError(404, "lead_not_found", "Lead not found.")
    return lead


def event(db, lead, actor, kind, note=None, **details):
    db.add(LeadEvent(lead_id=lead.id, actor_id=actor.id, kind=kind, note=note, details=details))


def suppressed_phone():
    other = aliased(Lead)
    return select(other.id).where(other.phone == Lead.phone, other.status == NO_CONTACT).correlate(Lead).exists()


def require_contactable(db, lead):
    if lead.archived_at or lead.status == NO_CONTACT or db.scalar(
        select(suppressed_phone()).select_from(Lead).where(Lead.id == lead.id)
    ):
        raise AppError(409, "lead_contact_blocked", "This lead is archived or marked Do Not Contact.")


def duplicates(db, phone, lead_id=None):
    if phone is None:
        return False
    query = select(Lead.id).where(Lead.phone == phone)
    if lead_id is not None:
        query = query.where(Lead.id != lead_id)
    return db.scalar(select(query.exists()))


def lock_phones(db, phones):
    if phones:
        # Use the same lock as single-lead writes and a stable order across imports.
        db.execute(text("""
            SELECT pg_advisory_xact_lock(hashtextextended('crm:' || phone, 0))
            FROM (SELECT phone FROM unnest(CAST(:phones AS text[])) AS phone ORDER BY phone COLLATE "C") AS ordered_phones
        """), {"phones": sorted(phones)})


def new_lead(db, actor, data, *, allow_duplicate=False):
    lead = Lead(id=uuid4(), status="new", created_by=actor.id,
                assigned_to=actor.id if actor.role == AdminRole.STAFF else None)
    apply_fields(lead, data)
    db.add(lead)
    event(db, lead, actor, "created", duplicate_confirmed=allow_duplicate)
    return lead


def apply_fields(lead, data):
    for field in CORE_FIELDS:
        setattr(lead, field, getattr(data, field))
    lead.details = data.model_dump(mode="json", exclude=CORE_FIELDS | {"allow_duplicate"})


def save(db: Session, actor, data: LeadInput, *, lead=None, allow_duplicate=False):
    if db.get(LeadSource, data.source) is None:
        raise AppError(422, "unknown_lead_source", "Choose an existing lead source.")
    if data.phone and (lead is None or data.phone != lead.phone):
        lock_phones(db, {data.phone})
        if duplicates(db, data.phone, lead.id if lead else None) and not allow_duplicate:
            raise AppError(409, "duplicate_lead", "This phone number is already in CRM. Confirm before creating a separate record.")
        if db.scalar(select(select(Lead.id).where(Lead.phone == data.phone, Lead.status == NO_CONTACT).exists())):
            raise AppError(409, "lead_contact_blocked", "This phone number is marked Do Not Contact.")
    if lead is None:
        lead = new_lead(db, actor, data, allow_duplicate=allow_duplicate)
    else:
        apply_fields(lead, data)
        event(db, lead, actor, "edited", duplicate_confirmed=allow_duplicate)
    db.flush()
    return lead


def close_followups(db, lead):
    db.execute(update(FollowUp).where(FollowUp.lead_id == lead.id, FollowUp.status == "open")
               .values(status="cancelled"))


def change_status(db, actor, lead, status, reason=None):
    if lead.archived_at:
        raise AppError(409, "lead_archived", "Restore the lead before changing its status.")
    if lead.status == status:
        return
    if status == "converted" or lead.status == "converted" and status != NO_CONTACT:
        raise AppError(409, "conversion_required", "Use the conversion workflow for this lead.")
    if lead.status == NO_CONTACT and (actor.role == AdminRole.STAFF or not reason):
        raise AppError(403, "lead_contact_blocked", "An administrator must record a reason to remove Do Not Contact.")
    if status == NO_CONTACT:
        close_followups(db, lead)
    event(db, lead, actor, "status", reason, previous=lead.status, status=status)
    lead.status = status


def schedule(db, actor, lead, data: FollowUpInput, previous=None):
    require_contactable(db, lead)
    if data.due_at <= utc_now():
        raise AppError(422, "follow_up_in_past", "Choose a future follow-up time.")
    current = db.scalar(select(FollowUp).where(FollowUp.lead_id == lead.id, FollowUp.status == "open"))
    if current is not None:
        if previous is None or current.id != previous.id:
            raise AppError(409, "follow_up_exists", "Reschedule the existing follow-up first.")
        current.status = "rescheduled"
        db.flush()
    record = FollowUp(lead_id=lead.id, due_at=data.due_at, reason=data.reason, notes=data.notes, status="open")
    db.add(record)
    db.flush()
    event(db, lead, actor, "follow_up_rescheduled" if previous else "follow_up_scheduled",
          follow_up_id=str(record.id), previous_id=str(previous.id) if previous else None)
    if lead.status != "converted":
        change_status(db, actor, lead, "callback_scheduled")
    return record


def assign(db, actor, lead, assigned_to):
    if assigned_to is not None:
        user = db.get(AdminUser, assigned_to)
        if user is None or not user.is_active:
            raise AppError(422, "invalid_assignee", "Choose an active staff member.")
    event(db, lead, actor, "assigned", previous=str(lead.assigned_to) if lead.assigned_to else None,
          assigned_to=str(assigned_to) if assigned_to else None)
    lead.assigned_to = assigned_to


def customer_matches(db, lead):
    return list(db.scalars(select(Customer).where(
        Customer.is_active.is_(True), Customer.phone_number.in_(
            [phone for phone in (lead.phone, lead.details.get("alternate_phone"), lead.details.get("whatsapp")) if phone]
        ),
    ).order_by(Customer.id).limit(30)))


def convert(db, actor, lead, data: ConversionInput):
    require_contactable(db, lead)
    if lead.customer_id and lead.customer_id != data.customer_id:
        raise AppError(409, "lead_already_converted", "This lead already has a conversion link.")
    if lead.booking_id:
        if data.booking_id and lead.booking_id != data.booking_id:
            raise AppError(409, "lead_already_converted", "This lead already has a booking.")
        return
    if not any(customer.id == data.customer_id for customer in customer_matches(db, lead)):
        raise AppError(422, "customer_phone_mismatch", "Select an active customer with a matching phone number.")
    customer = db.scalar(select(Customer).where(Customer.id == data.customer_id, Customer.is_active.is_(True)).with_for_update())
    if customer is None:
        raise AppError(409, "customer_inactive", "This customer is no longer active.")
    booking_id = data.booking_id
    if data.booking:
        booking_id = create_booking_for_locked_customer(db, customer, data.booking, admin_id=actor.id).id
    elif booking_id:
        booking = db.get(Booking, booking_id)
        if booking is None or booking.customer_id != data.customer_id:
            raise AppError(422, "booking_customer_mismatch", "The booking must belong to the linked customer.")
    if lead.status != "converted":
        event(db, lead, actor, "status", previous=lead.status, status="converted")
        lead.converted_at = utc_now()
    lead.status = "converted"
    lead.customer_id, lead.booking_id = data.customer_id, booking_id
    event(db, lead, actor, "converted", customer_id=str(data.customer_id),
          booking_id=str(booking_id) if booking_id else None)
