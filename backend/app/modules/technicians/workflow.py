"""Internal operations. Future callers must authenticate a technician before supplying technician_id."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import AppError
from app.modules.bookings.models import Booking
from app.modules.bookings.repository import lock_booking
from app.modules.bookings.schemas import BookingAddressResponse
from app.modules.bookings.status import BookingStatus
from app.modules.bookings.transitions import transition_locked_booking
from app.modules.customers.credentials import utc_now
from app.modules.technicians.models import BookingAssignment
from app.modules.technicians.repository import get_technician
from app.modules.technicians.schemas import TechnicianJob
from app.modules.technicians.status import ACTIVE_ASSIGNMENTS, AssignmentStatus, EmploymentStatus
from app.schemas.common import AdminPage, PaginationParams

WORKFLOW_TRANSITIONS = {
    AssignmentStatus.ASSIGNED: frozenset({AssignmentStatus.ACCEPTED, AssignmentStatus.REJECTED, AssignmentStatus.REASSIGNMENT_REQUIRED}),
    AssignmentStatus.ACCEPTED: frozenset({AssignmentStatus.IN_PROGRESS, AssignmentStatus.REJECTED, AssignmentStatus.REASSIGNMENT_REQUIRED}),
    AssignmentStatus.IN_PROGRESS: frozenset({AssignmentStatus.COMPLETED, AssignmentStatus.REASSIGNMENT_REQUIRED}),
}


def _not_found() -> AppError:
    return AppError(404, "assignment_not_found", "The requested assignment was not found.")


def _job(row: BookingAssignment, booking: Booking) -> TechnicianJob:
    address = BookingAddressResponse.model_validate(booking.address).model_copy(
        update={"recipient_name": None, "recipient_phone": None},
    )
    return TechnicianJob(
        id=row.id, booking_id=booking.id, booking_reference=booking.booking_reference,
        service_date=booking.service_date, service_name=booking.service_name_snapshot,
        assignment_status=row.assignment_status, customer_name=booking.customer_name_snapshot,
        customer_phone=booking.customer_phone_snapshot, address=address,
        customer_instructions=booking.customer_instructions,
    )


def read_technician_job(db: Session, technician_id: UUID, assignment_id: UUID) -> TechnicianJob:
    row = db.execute(
        select(BookingAssignment, Booking).select_from(BookingAssignment)
        .join(Booking, Booking.id == BookingAssignment.booking_id)
        .options(joinedload(Booking.address))
        .where(
            BookingAssignment.id == assignment_id, BookingAssignment.technician_id == technician_id,
            BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
        )
    ).one_or_none()
    if row is None:
        raise _not_found()
    return _job(row[0], row[1])


def list_technician_jobs(db: Session, technician_id: UUID, query: PaginationParams) -> AdminPage[TechnicianJob]:
    filters = (
        BookingAssignment.technician_id == technician_id, BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
    )
    total = db.scalar(select(func.count()).select_from(BookingAssignment).where(*filters)) or 0
    rows = db.execute(
        select(BookingAssignment, Booking).select_from(BookingAssignment)
        .join(Booking, Booking.id == BookingAssignment.booking_id).options(joinedload(Booking.address))
        .where(*filters).order_by(BookingAssignment.service_date, BookingAssignment.id)
        .offset(query.offset).limit(query.page_size)
    )
    return AdminPage[TechnicianJob](
        items=[_job(row, booking) for row, booking in rows], total=total, page=query.page, page_size=query.page_size,
    )


def _lock_job(db: Session, technician_id: UUID, assignment_id: UUID):
    filters = (BookingAssignment.id == assignment_id, BookingAssignment.technician_id == technician_id)
    booking_id = db.scalar(select(BookingAssignment.booking_id).where(*filters))
    if booking_id is None:
        raise _not_found()
    booking = lock_booking(db, booking_id, customer_id=None)
    technician = get_technician(db, technician_id, lock=True)
    row = db.scalar(select(BookingAssignment).where(*filters))
    if row is None or row.assignment_status not in ACTIVE_ASSIGNMENTS:
        raise _not_found()
    expected = BookingStatus.IN_PROGRESS if row.assignment_status == AssignmentStatus.IN_PROGRESS else BookingStatus.ASSIGNED
    if booking.status != expected:
        raise AppError(409, "assignment_state_conflict", "The booking and assignment are out of sync.")
    return booking, technician, row


def _validate_note(note: str) -> str:
    normalized = note.strip()
    if not normalized or len(normalized) > 2000:
        raise AppError(422, "invalid_operational_note", "Operational notes must have 1 to 2,000 characters.")
    return normalized


def save_technician_job_note(db: Session, technician_id: UUID, assignment_id: UUID, note: str) -> None:
    with db.begin():
        _, _, row = _lock_job(db, technician_id, assignment_id)
        row.operational_note = _validate_note(note)


def transition_technician_assignment(
    db: Session, technician_id: UUID, assignment_id: UUID, target: AssignmentStatus, *, note: str | None = None,
) -> AssignmentStatus:
    with db.begin():
        booking, technician, row = _lock_job(db, technician_id, assignment_id)
        if target not in WORKFLOW_TRANSITIONS.get(row.assignment_status, ()):
            raise AppError(409, "invalid_assignment_transition", "This assignment status change is unavailable.")
        if target in (AssignmentStatus.ACCEPTED, AssignmentStatus.IN_PROGRESS) and (
            not technician.is_active or technician.employment_status != EmploymentStatus.ACTIVE
        ):
            raise AppError(409, "technician_inactive", "The technician is not active for this workflow.")
        if note is not None:
            note = _validate_note(note)
            row.operational_note = note
        if target == AssignmentStatus.REASSIGNMENT_REQUIRED and not note:
            raise AppError(422, "operational_note_required", "Explain why the assignment cannot be completed.")

        now = utc_now()
        row.assignment_status = target
        booking_target = None
        if target == AssignmentStatus.ACCEPTED:
            row.accepted_at = now
            booking.updated_at = now
        elif target == AssignmentStatus.IN_PROGRESS:
            row.started_at = now
            booking_target = BookingStatus.IN_PROGRESS
        elif target == AssignmentStatus.COMPLETED:
            row.completed_at = row.ended_at = now
            booking_target = BookingStatus.COMPLETED
        else:
            row.ended_at = now
            booking_target = BookingStatus.CONFIRMED

        if booking_target is not None:
            transition_locked_booking(
                db, booking, booking_target, now, actor_type="technician", actor_id=technician_id,
                assignment_workflow=True,
            )
        return target
