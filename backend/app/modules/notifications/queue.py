"""PostgreSQL outbox and lease transitions. No network calls hold a database lock."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, func, insert, literal, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.modules.notifications.devices import eligible_devices
from app.modules.notifications.models import (
    CustomerDevice as Device, NotificationCampaign as Campaign, NotificationDelivery as Delivery,
    NotificationExecution as Execution,
)
from app.modules.notifications.scheduling import next_occurrence
from app.modules.notifications.schemas import Schedule

PENDING = ("queued", "sending")
PROVIDER_ERRORS = frozenset({
    "DeviceNotRegistered", "MessageTooBig", "MessageRateExceeded", "MismatchSenderId",
    "InvalidCredentials", "InvalidProviderToken", "InvalidPushToken",
})


@dataclass(frozen=True)
class SendJob:
    id: UUID
    attempt: int
    message: dict


@dataclass(frozen=True)
class ReceiptJob:
    id: UUID
    attempt: int
    ticket: str


def claim_campaigns(db: Session, now: datetime, limit: int) -> int:
    with db.begin():
        campaigns = db.scalars(select(Campaign).where(
            Campaign.status == "scheduled", Campaign.next_run_at <= now,
        ).order_by(Campaign.next_run_at, Campaign.id).limit(limit).with_for_update(skip_locked=True)).all()
        for campaign in campaigns:
            data = {"destination": campaign.destination, "type": campaign.notification_type, "custom": campaign.custom_data}
            if campaign.booking_id:
                data["bookingId"] = str(campaign.booking_id)
            execution = Execution(
                campaign_id=campaign.id, scheduled_execution_at=campaign.next_run_at, started_at=now,
                execution_status="processing", payload={"title": campaign.title, "body": campaign.message, "data": data},
            )
            db.add(execution)
            db.flush()
            recipients = select(
                func.gen_random_uuid(), literal(execution.id), Device.customer_id, Device.id,
                Device.revision, Device.platform, literal("queued"), literal(now),
            ).where(*eligible_devices())
            if campaign.recipient_type == "selected_customers":
                recipients = recipients.where(Device.customer_id.in_([UUID(x) for x in campaign.customer_ids]))
            result = db.execute(insert(Delivery.__table__).from_select(
                ["id", "execution_id", "customer_id", "device_id", "device_revision", "platform", "status", "available_at"],
                recipients, include_defaults=False,
            ))
            execution.recipients_count = result.rowcount
            campaign.status = "active"
            campaign.occurrence_count += 1
        return len(campaigns)


def claim_sends(db: Session, now: datetime, limit: int) -> list[SendJob]:
    with db.begin():
        # At most one batch per second across replicas, independent of HTTP round trip time.
        if not db.scalar(select(func.pg_try_advisory_xact_lock(41001302))) or db.scalar(
            select(select(Delivery.id).where(Delivery.attempted_at > now - timedelta(seconds=1)).exists())
        ):
            return []
        rows = db.execute(select(
            Delivery, Device.expo_push_token, Execution.payload, Campaign.status,
            and_(Device.revision == Delivery.device_revision, *eligible_devices()).label("eligible"),
        ).join(Device, Device.id == Delivery.device_id).join(Execution, Execution.id == Delivery.execution_id)
            .join(Campaign, Campaign.id == Execution.campaign_id)
            .where(Delivery.status == "queued", Delivery.available_at <= now)
            .order_by(Delivery.available_at, Delivery.id).limit(limit)
            .with_for_update(of=Delivery, skip_locked=True)).all()
        jobs = []
        for delivery, token, payload, campaign_status, eligible in rows:
            if campaign_status == "cancelled":
                delivery.status, delivery.error_code = "cancelled", "campaign_cancelled"
            elif not eligible:
                delivery.status, delivery.error_code = "skipped", "device_ineligible"
            else:
                delivery.status, delivery.attempted_at = "sending", now
                delivery.attempts += 1
                jobs.append(SendJob(delivery.id, delivery.attempts, {
                    **payload, "to": token, "sound": "default", "channelId": "general",
                    "data": {**payload["data"], "executionId": str(delivery.execution_id)},
                }))
        return jobs


def _backoff(attempt: int) -> timedelta:
    return timedelta(seconds=min(3600, 15 * 2 ** max(0, attempt - 1)))


def _provider_error(result) -> str | None:
    details = result.get("details") if isinstance(result, dict) else None
    code = details.get("error") if isinstance(details, dict) else None
    return code if isinstance(code, str) and code in PROVIDER_ERRORS else None


def _invalidate(db: Session, delivery: Delivery) -> None:
    db.execute(update(Device).where(
        Device.id == delivery.device_id, Device.revision == delivery.device_revision,
    ).values(is_active=False, expo_push_token=None, revision=Device.revision + 1))


def store_sends(db: Session, settings: Settings, now: datetime, jobs: list[SendJob],
                results: list | None, failure=None) -> None:
    with db.begin():
        claimed = {row.id: row for row in db.scalars(select(Delivery).where(
            Delivery.id.in_([job.id for job in jobs]), Delivery.status == "sending",
        ).order_by(Delivery.id).with_for_update())}
        for index, job in enumerate(jobs):
            row = claimed.get(job.id)
            if row is None or row.attempts != job.attempt:
                continue
            result = results[index] if results is not None else None
            ticket = result.get("id") if isinstance(result, dict) and result.get("status") == "ok" else None
            if isinstance(ticket, str) and 0 < len(ticket) <= 100:
                row.status, row.expo_ticket_id, row.sent_at = "submitted", ticket, now
                row.error_code, row.submission_accepted = None, True
                row.available_at = now + timedelta(seconds=settings.notification_receipt_delay_seconds)
                continue
            code = failure.code if failure else _provider_error(result)
            if (failure and failure.retryable or code == "MessageRateExceeded") and row.attempts < settings.notification_retry_limit:
                retry_after = timedelta(seconds=failure.retry_after if failure else 0)
                row.status, row.available_at = "queued", now + max(_backoff(row.attempts), retry_after)
            elif code == "DeviceNotRegistered":
                _invalidate(db, row)
                row.status = "invalid_device"
            else:
                row.status = "failed"
            row.error_code = code or ("expo_ticket_rejected" if isinstance(result, dict) and result.get("status") == "error"
                                      else "submission_unknown")


def claim_receipts(db: Session, settings: Settings, now: datetime) -> list[ReceiptJob]:
    with db.begin():
        rows = db.scalars(select(Delivery).where(
            Delivery.status == "submitted", Delivery.available_at <= now,
        ).order_by(Delivery.available_at, Delivery.id).limit(settings.notification_batch_size)
            .with_for_update(skip_locked=True)).all()
        jobs = []
        for row in rows:
            if row.receipt_attempts >= settings.notification_receipt_retry_limit or not row.expo_ticket_id:
                row.status, row.error_code = "failed", "receipt_unavailable"
            else:
                row.receipt_attempts += 1
                row.available_at = now + max(_backoff(row.receipt_attempts), timedelta(
                    seconds=settings.notification_http_timeout_seconds * 2 + 5,
                ))
                jobs.append(ReceiptJob(row.id, row.receipt_attempts, row.expo_ticket_id))
        return jobs


def store_receipts(db: Session, settings: Settings, now: datetime, jobs: list[ReceiptJob], results: dict) -> None:
    with db.begin():
        claimed = {row.id: row for row in db.scalars(select(Delivery).where(
            Delivery.id.in_([job.id for job in jobs]), Delivery.status == "submitted",
        ).order_by(Delivery.id).with_for_update())}
        for job in jobs:
            row = claimed.get(job.id)
            if row is None or row.receipt_attempts != job.attempt:
                continue
            result = results.get(job.ticket)
            row.receipt_checked_at = now
            if isinstance(result, dict) and result.get("status") == "ok":
                row.status, row.error_code = "provider_accepted", None
            elif isinstance(result, dict) and result.get("status") == "error":
                code = _provider_error(result)
                if code == "DeviceNotRegistered":
                    _invalidate(db, row)
                row.status = "invalid_device" if code == "DeviceNotRegistered" else "failed"
                row.error_code = code or "expo_receipt_rejected"
            elif row.receipt_attempts >= settings.notification_receipt_retry_limit:
                row.status, row.error_code = "failed", "receipt_unavailable"


def recover_and_finalize(db: Session, settings: Settings, now: datetime) -> int:
    with db.begin():
        # Unknown submit outcomes cannot be safely replayed. The execution stays auditable.
        db.execute(update(Delivery).where(
            Delivery.status == "sending",
            Delivery.attempted_at < now - timedelta(seconds=settings.notification_http_timeout_seconds * 3 + 30),
        ).values(status="failed", error_code="submission_unknown"))
    with db.begin():
        pending_delivery = select(Delivery.id).where(Delivery.execution_id == Execution.id,
                                                    Delivery.status.in_(PENDING)).exists()
        rows = db.execute(select(Campaign, Execution).join(Execution, Execution.campaign_id == Campaign.id).where(
            Execution.completed_at.is_(None), ~pending_delivery,
        ).order_by(Execution.started_at, Execution.id).limit(settings.notification_claim_limit)
            .with_for_update(of=(Campaign, Execution), skip_locked=True)).all()
        for campaign, execution in rows:
            accepted = db.scalar(select(func.count()).select_from(Delivery).where(
                Delivery.execution_id == execution.id, Delivery.submission_accepted.is_(True),
            ))
            execution.successful_submissions = accepted
            execution.failed_submissions = execution.recipients_count - accepted
            execution.completed_at = now
            execution.execution_status = (
                "cancelled" if campaign.status == "cancelled" else
                "empty" if not execution.recipients_count else "failed" if not accepted else
                "partial" if execution.failed_submissions else "completed"
            )
            if campaign.status == "cancelled":
                continue
            schedule = Schedule.model_validate(campaign.schedule)
            following = None
            if schedule.mode == "repeat" and (
                schedule.max_occurrences is None or campaign.occurrence_count < schedule.max_occurrences
            ):
                following = next_occurrence(schedule, max(now, execution.scheduled_execution_at))
            campaign.next_run_at = following
            if campaign.status != "paused" or following is None:
                campaign.status = "scheduled" if following else (
                    "failed" if execution.execution_status == "failed" else "completed"
                )
        return len(rows)
