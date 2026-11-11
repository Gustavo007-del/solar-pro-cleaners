from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.bookings.models import Booking, BookingStatusHistory
from app.modules.bookings.status import BookingStatus, TRANSITIONS
from app.modules.technicians.models import BookingAssignment

STATUS_TIMESTAMPS = {
    BookingStatus.CONFIRMED: "confirmed_at",
    BookingStatus.ASSIGNED: "assigned_at",
    BookingStatus.IN_PROGRESS: "started_at",
    BookingStatus.COMPLETED: "completed_at",
    BookingStatus.CANCELLED: "cancelled_at",
}


def transition_locked_booking(
    db: Session, booking: Booking, target: BookingStatus, now: datetime, *,
    actor_type: Literal["customer", "admin", "system", "technician"], actor_id: UUID | None,
    reason: str | None = None, public_cancellation_reason: str | None = None,
    assignment_workflow: bool = False,
) -> None:
    previous = booking.status
    if target not in TRANSITIONS[previous]:
        raise AppError(409, "invalid_booking_transition", "This booking status change is unavailable.")
    if not assignment_workflow and (
        target in (BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS)
        or (target == BookingStatus.CONFIRMED and previous != BookingStatus.PENDING)
        or (target == BookingStatus.COMPLETED and db.scalar(
            select(BookingAssignment.id).where(BookingAssignment.booking_id == booking.id).limit(1)
        ) is not None)
    ):
        raise AppError(409, "assignment_workflow_required", "This status change requires the assignment workflow.")
    booking.status = target
    booking.status_version += 1
    booking.updated_at = now
    milestone = STATUS_TIMESTAMPS[target]
    if getattr(booking, milestone) is None:
        setattr(booking, milestone, now)
    if target == BookingStatus.CANCELLED:
        booking.cancellation_reason = public_cancellation_reason
    db.add(BookingStatusHistory(
        booking_id=booking.id, sequence=booking.status_version, old_status=previous, new_status=target,
        changed_by_type=actor_type, changed_by_id=actor_id, reason=reason, created_at=now,
    ))
