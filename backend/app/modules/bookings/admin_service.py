"""Permission-checked booking operations for administrative callers."""

from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, contains_eager, joinedload

from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.models import AdminUser
from app.modules.admins.permissions import AdminRole, Permission, ROLE_PERMISSIONS, enforce_permission
from app.modules.admins.reporting_dates import business_zone, date_filters
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.bookings.admin_schemas import AdminBookingCard, AdminBookingDetails, AdminBookingFollowUp, AdminBookingHistory
from app.modules.bookings.admin_schemas import AdminBookingQuery, CurrentTechnician
from app.modules.bookings.models import Booking, BookingAddress
from app.modules.bookings.repository import booking_filters, lock_booking, not_found
from app.modules.bookings.schemas import AdminBookingLocation, BookingAddressResponse
from app.modules.bookings.serialization import booking_card, booking_details
from app.modules.bookings.service import address_snapshot, validate_booking_details
from app.modules.bookings.status import BookingStatus, STATUS_LABELS
from app.modules.bookings.transitions import transition_locked_booking
from app.modules.customers.credentials import utc_now
from app.modules.services.models import Service
from app.modules.technicians.models import BookingAssignment, Technician
from app.modules.technicians.status import ACTIVE_ASSIGNMENTS
from app.schemas.common import AdminPage


def _with_current_technician(statement):
    return statement.outerjoin(BookingAssignment, and_(
        BookingAssignment.booking_id == Booking.id,
        BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
    )).outerjoin(Technician, Technician.id == BookingAssignment.technician_id)


def _current_technician(row: BookingAssignment | None, name: str | None) -> CurrentTechnician | None:
    if row is None or name is None:
        return None
    return CurrentTechnician(
        assignment_id=row.id, technician_id=row.technician_id,
        technician_name=name, assignment_status=row.assignment_status,
    )


def _admin_card(booking: Booking, assignment: CurrentTechnician | None = None) -> AdminBookingCard:
    card = booking_card(booking)
    address = booking.address
    fields = (
        address.address_line, address.address_line_2, address.locality, address.city,
        address.district, address.state, address.postal_code, address.landmark,
    ) if address else ()
    summary = ", ".join(dict.fromkeys(field for field in fields if field)) or card.address_summary
    return AdminBookingCard(
        **card.model_dump(exclude={"address_summary"}),
        address_summary=summary, customer_id=booking.customer_id,
        customer_name=booking.customer_name_snapshot, customer_phone=booking.customer_phone_snapshot,
        updated_at=booking.updated_at,
        current_assignment=assignment,
    )


def list_admin_bookings(db: Session, query: AdminBookingQuery) -> AdminPage[AdminBookingCard]:
    filters = booking_filters(query, customer_id=None, service_id=query.service_id, search=query.search)
    if query.technician_id is not None:
        filters.append(select(BookingAssignment.id).where(
            BookingAssignment.booking_id == Booking.id,
            BookingAssignment.technician_id == query.technician_id,
            BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
        ).correlate(Booking).exists())
    if query.customer_name:
        filters.append(Booking.customer_name_snapshot.icontains(query.customer_name, autoescape=True))
    if query.customer_phone:
        phone = query.customer_phone.translate(str.maketrans(" ()-", "    ")).replace(" ", "")
        filters.append(Booking.customer_phone_snapshot.contains(phone or query.customer_phone, autoescape=True))
    if query.created_from or query.created_to:
        filters.extend(date_filters(Booking.created_at, query.created_from, query.created_to, business_zone(db)))
    if query.city:
        filters.append(func.lower(BookingAddress.city) == func.lower(query.city))
    if query.district:
        filters.append(func.lower(BookingAddress.district) == func.lower(query.district))
    if query.postal_code:
        filters.append(BookingAddress.postal_code == query.postal_code)

    order = {
        "newest": (Booking.created_at.desc(), Booking.id.desc()),
        "oldest": (Booking.created_at, Booking.id),
        "service_date": (Booking.service_date, Booking.id),
        "updated": (Booking.updated_at.desc(), Booking.id.desc()),
    }[query.sort]
    count = select(func.count()).select_from(Booking)
    if query.city or query.district or query.postal_code:
        count = count.join(Booking.address)
    total = db.scalar(count.where(*filters)) or 0
    rows = db.execute(
        _with_current_technician(select(Booking, BookingAssignment, Technician.full_name).select_from(Booking))
        .outerjoin(Booking.address).where(*filters)
        .options(contains_eager(Booking.address), joinedload(Booking.pricing))
        .order_by(*order).offset(query.offset).limit(query.page_size)
    )
    return AdminPage[AdminBookingCard](
        items=[_admin_card(booking, _current_technician(assignment, name)) for booking, assignment, name in rows],
        page=query.page, page_size=query.page_size, total=total,
    )


def read_admin_booking(db: Session, booking_id: UUID, *, show_private_notes: bool) -> AdminBookingDetails:
    row = db.execute(
        _with_current_technician(select(Booking, Service.description, BookingAssignment, Technician.full_name).select_from(Booking))
        .join(Service, Service.id == Booking.service_id)
        .where(Booking.id == booking_id)
        .options(joinedload(Booking.address), joinedload(Booking.pricing), joinedload(Booking.history))
        .execution_options(populate_existing=True)
    ).unique().one_or_none()
    if row is None:
        raise not_found()
    booking, description, assignment, technician_name = row
    admin_ids = {
        item.changed_by_id for item in booking.history
        if item.changed_by_type == "admin" and item.changed_by_id is not None
    }
    names = dict(db.execute(
        select(AdminUser.id, AdminUser.full_name).where(AdminUser.id.in_(admin_ids))
    ).tuples().all()) if admin_ids else {}
    technician_ids = {
        item.changed_by_id for item in booking.history
        if item.changed_by_type == "technician" and item.changed_by_id is not None
    }
    technician_names = dict(db.execute(
        select(Technician.id, Technician.full_name).where(Technician.id.in_(technician_ids))
    ).tuples().all()) if technician_ids else {}
    details = booking_details(booking)
    return AdminBookingDetails(
        **details.model_dump(exclude={"history", "address_summary"}),
        address_summary=_admin_card(booking).address_summary, customer_id=booking.customer_id,
        service_current_description=description,
        legacy_admin_notes=booking.admin_notes if show_private_notes else None,
        current_assignment=_current_technician(assignment, technician_name),
        history=[
            AdminBookingHistory(
                old_status=item.old_status, new_status=item.new_status, status_label=STATUS_LABELS[item.new_status],
                created_at=item.created_at, changed_by_type=item.changed_by_type, changed_by_id=item.changed_by_id,
                changed_by_name=names.get(item.changed_by_id) if item.changed_by_type == "admin"
                else technician_names.get(item.changed_by_id) if item.changed_by_type == "technician"
                else booking.customer_name_snapshot if item.changed_by_type == "customer" else None,
                reason=item.reason if show_private_notes else None,
            )
            for item in booking.history
        ],
    )


def change_booking_status(
    db: Session, context: AdminContext, booking_id: UUID, target: BookingStatus, *,
    reason: str | None = None,
) -> AdminBookingDetails:
    permission = Permission.BOOKINGS_CANCEL if target == BookingStatus.CANCELLED else Permission.BOOKINGS_UPDATE
    with db.begin():
        actor = lock_authorized_admin(db, context, permission)
        role = AdminRole(actor.role)
        enforce_permission(role, Permission.BOOKINGS_READ)
        booking = lock_booking(db, booking_id, customer_id=None)
        if target == BookingStatus.CONFIRMED and (
            booking.service_date is None or db.scalar(select(BookingAddress.id).where(BookingAddress.booking_id == booking.id)) is None
        ):
            raise AppError(409, "booking_details_required", "Add the service date and location before confirming the booking.")
        previous = booking.status
        transition_locked_booking(
            db, booking, target, utc_now(), actor_type="admin", actor_id=actor.id, reason=reason,
            public_cancellation_reason=reason if target == BookingStatus.CANCELLED else None,
        )
        record_audit(
            db, "booking_cancelled" if target == BookingStatus.CANCELLED else "booking_status_changed",
            actor_id=actor.id, resource_id=booking.id, resource_type="booking", previous_status=previous, new_status=target,
        )
        db.flush()
        return read_admin_booking(db, booking.id, show_private_notes=Permission.BOOKINGS_NOTES_READ in ROLE_PERMISSIONS[role])


def record_booking_follow_up(
    db: Session, context: AdminContext, booking_id: UUID, data: AdminBookingFollowUp,
) -> AdminBookingDetails:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.BOOKINGS_UPDATE)
        role = AdminRole(actor.role)
        enforce_permission(role, Permission.BOOKINGS_READ)
        booking = lock_booking(db, booking_id, customer_id=None)
        if booking.status != BookingStatus.PENDING:
            raise AppError(409, "booking_follow_up_unavailable", "Only pending bookings can receive missing details.")
        if data.service_date is not None and booking.service_date is not None:
            raise AppError(409, "booking_date_already_set", "A date is already recorded. Refresh the booking.")
        if data.address is not None and db.scalar(select(BookingAddress.id).where(BookingAddress.booking_id == booking.id)) is not None:
            raise AppError(409, "booking_location_already_set", "A location is already recorded. Refresh the booking.")

        coverage = validate_booking_details(db, data.service_date, data.address)
        if data.service_date is not None:
            booking.service_date = data.service_date
        if data.address is not None:
            booking.coverage_matched = coverage
            db.add(address_snapshot(booking.id, data.address))
        booking.updated_at = utc_now()
        record_audit(db, "booking_follow_up_recorded", actor_id=actor.id, resource_id=booking.id, resource_type="booking")
        db.flush()
        return read_admin_booking(db, booking.id, show_private_notes=Permission.BOOKINGS_NOTES_READ in ROLE_PERMISSIONS[role])


def read_admin_booking_location(db: Session, booking_id: UUID) -> AdminBookingLocation:
    booking = db.scalar(select(Booking).where(Booking.id == booking_id).options(joinedload(Booking.address)))
    if booking is None:
        raise not_found()
    return AdminBookingLocation(
        booking_id=booking.id, booking_reference=booking.booking_reference,
        coverage_matched=booking.coverage_matched,
        address=BookingAddressResponse.model_validate(booking.address) if booking.address else None,
    )
