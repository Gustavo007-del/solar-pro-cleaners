from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.permissions import AdminRole, Permission, enforce_permission
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.bookings.models import Booking
from app.modules.customers.credentials import utc_now
from app.modules.customers.models import Customer
from app.modules.notifications.models import NotificationCampaign, NotificationDelivery, NotificationExecution
from app.modules.notifications.scheduling import next_occurrence, validate_schedule
from app.modules.notifications.schemas import CampaignContent, CampaignCreate, CampaignResponse, Schedule


def campaign_record(db: Session, campaign_id: UUID, lock: bool = False) -> NotificationCampaign:
    query = select(NotificationCampaign).where(NotificationCampaign.id == campaign_id)
    record = db.scalar(query.with_for_update() if lock else query)
    if record is None:
        raise AppError(404, "notification_campaign_not_found", "Campaign not found.")
    return record


def validate_audience(db: Session, data: CampaignContent) -> None:
    if data.customer_ids:
        existing = set(db.scalars(select(Customer.id).where(Customer.id.in_(data.customer_ids))))
        if existing != set(data.customer_ids):
            raise AppError(422, "notification_invalid_audience", "One or more selected customers no longer exist.")
    if data.booking_id:
        owner = db.scalar(select(Booking.customer_id).where(Booking.id == data.booking_id))
        if owner is None or data.customer_ids != [owner]:
            raise AppError(422, "notification_invalid_destination", "Select only the customer who owns this booking.")


def save_campaign(
    db: Session, admin: AdminContext, settings: Settings, data: CampaignContent, campaign_id: UUID | None = None,
) -> CampaignResponse:
    validate_schedule(data.schedule, settings.notification_min_interval_minutes)
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.NOTIFICATIONS_MANAGE)
        validate_audience(db, data)
        if campaign_id is None:
            assert isinstance(data, CampaignCreate)
            record = db.scalar(select(NotificationCampaign).where(
                NotificationCampaign.created_by_admin_id == actor.id, NotificationCampaign.request_id == data.request_id,
            ))
            if record is not None:
                requested = data.model_dump(mode="json", exclude={"request_id"})
                saved = CampaignContent.model_validate(record, from_attributes=True).model_dump(mode="json")
                if requested != saved:
                    raise AppError(409, "notification_request_conflict", "This request ID already belongs to another draft.")
                return CampaignResponse.model_validate(record)
            record = NotificationCampaign(created_by_admin_id=actor.id, request_id=data.request_id, status="draft")
            db.add(record)
        else:
            record = campaign_record(db, campaign_id, lock=True)
            if record.status != "draft" and not (record.status == "scheduled" and record.occurrence_count == 0):
                raise AppError(409, "notification_already_started", "Only campaigns that have not started can be edited.")
            # A changed schedule or audience must be queued again with explicit confirmation.
            record.status = "draft"
            record.next_run_at = None
        values = data.model_dump(mode="json", exclude={"request_id", "booking_id"})
        for key, value in values.items():
            setattr(record, key, value)
        record.booking_id = data.booking_id
        db.flush()
        record_audit(db, "notification_created" if campaign_id is None else "notification_updated",
                     actor_id=actor.id, resource_id=record.id, resource_type="notification_campaign")
        return CampaignResponse.model_validate(record)


def change_campaign(
    db: Session, admin: AdminContext, settings: Settings, campaign_id: UUID, action: str, confirmed: bool,
) -> CampaignResponse:
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.NOTIFICATIONS_MANAGE)
        record = campaign_record(db, campaign_id, lock=True)
        schedule = Schedule.model_validate(record.schedule)
        now = utc_now()
        if action in ("send", "schedule", "resume"):
            if record.recipient_type == "all_customers":
                if not confirmed:
                    raise AppError(422, "notification_confirmation_required", "Confirm sending to all registered devices.")
                enforce_permission(AdminRole(actor.role), Permission.NOTIFICATIONS_BROADCAST)
            validate_schedule(schedule, settings.notification_min_interval_minutes)
        if action == "send" and record.status == "draft" and schedule.mode == "now":
            record.status, record.next_run_at = "scheduled", now
        elif action == "schedule" and record.status == "draft" and schedule.mode != "now":
            first = next_occurrence(schedule)
            if first is None or first <= now:
                raise AppError(422, "notification_start_invalid", "Choose a future time within the schedule.")
            record.status, record.next_run_at = "scheduled", first
        elif action == "pause" and schedule.mode == "repeat" and record.status in ("scheduled", "active"):
            record.status = "paused"
        elif action == "resume" and record.status == "paused":
            processing = db.scalar(select(NotificationExecution.id).where(
                NotificationExecution.campaign_id == record.id, NotificationExecution.completed_at.is_(None),
            ))
            record.status = "active" if processing else "scheduled" if record.next_run_at else "completed"
        elif action == "cancel" and record.status in ("draft", "scheduled", "active", "paused"):
            record.status, record.next_run_at = "cancelled", None
            db.execute(update(NotificationDelivery).where(
                NotificationDelivery.execution_id.in_(select(NotificationExecution.id).where(
                    NotificationExecution.campaign_id == record.id,
                )), NotificationDelivery.status == "queued",
            ).values(status="cancelled", error_code="campaign_cancelled"))
        else:
            raise AppError(409, "notification_action_unavailable", "This action is unavailable for the campaign.")
        db.flush()
        record_audit(db, "notification_" + action, actor_id=actor.id, resource_id=record.id,
                     resource_type="notification_campaign")
        return CampaignResponse.model_validate(record)
