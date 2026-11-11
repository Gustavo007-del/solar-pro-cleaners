from datetime import date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.permissions import AdminRole, Permission, enforce_permission
from app.modules.admins.reporting_dates import business_zone
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.bookings.models import Booking
from app.modules.bookings.repository import lock_booking, not_found
from app.modules.bookings.status import BookingStatus
from app.modules.bookings.transitions import transition_locked_booking
from app.modules.customers.credentials import utc_now
from app.modules.technicians.availability import effective_availability, eligible_technicians
from app.modules.technicians.models import BookingAssignment, Technician
from app.modules.technicians.repository import assignment_record, lock_technicians
from app.modules.technicians.schemas import (
    AssignInput, AssignmentRecord, EligibleTechnicianQuery, EligibleTechniciansPage, ReassignInput, UnassignInput,
)
from app.modules.technicians.status import ACTIVE_ASSIGNMENTS, AssignmentStatus


def current_assignment(db: Session, booking_id: UUID) -> BookingAssignment | None:
    return db.scalar(select(BookingAssignment).where(
        BookingAssignment.booking_id == booking_id,
        BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
    ))


def _latest_assignment(db: Session, booking_id: UUID) -> BookingAssignment | None:
    return db.scalar(
        select(BookingAssignment).where(BookingAssignment.booking_id == booking_id)
        .order_by(BookingAssignment.assigned_at.desc(), BookingAssignment.id.desc()).limit(1)
    )


def _assignment_now(db: Session, service_date: date) -> datetime:
    now = utc_now().astimezone(business_zone(db))
    if service_date < now.date():
        raise AppError(409, "assignment_date_past", "The requested service date is in the past.")
    return now


def _require_eligible(db: Session, technician: Technician, service_date: date) -> None:
    now = _assignment_now(db, service_date)
    available = effective_availability(db, [technician], service_date, now.tzinfo.key)[technician.id]
    if not available.available:
        reasons = {
            "employment": "The technician is not active for assignments.",
            "approved_leave": "The technician is on approved leave for this date.",
            "unconfigured": "Configure availability for this technician before assigning.",
            "assignment": "The technician already has an active assignment for this date.",
        }
        raise AppError(
            409, "technician_unavailable", reasons.get(available.source, "The technician is unavailable for this date."),
        )
    if service_date == now.date() and available.end_time is not None and available.end_time <= now.time():
        raise AppError(409, "technician_unavailable", "The technician's scheduled hours have ended for this date.")


def _record_assignment(
    db: Session, booking: Booking, technician: Technician, admin_id: UUID, note: str | None,
    *, previous: BookingAssignment | None = None, reason: str | None = None,
) -> AssignmentRecord:
    now = utc_now()
    row = BookingAssignment(
        booking_id=booking.id, technician_id=technician.id, service_date=booking.service_date,
        assigned_by_admin_id=admin_id, replaces_assignment_id=previous.id if previous else None,
        assignment_status=AssignmentStatus.ASSIGNED, assigned_at=now, administrative_note=note,
        reassignment_reason=reason,
    )
    db.add(row)
    db.flush()
    if booking.status != BookingStatus.ASSIGNED:
        transition_locked_booking(
            db, booking, BookingStatus.ASSIGNED, now, actor_type="admin", actor_id=admin_id,
            reason=reason, assignment_workflow=True,
        )
    else:
        booking.updated_at = now
    record_audit(
        db, "booking_reassigned" if previous else "booking_assigned",
        actor_id=admin_id, resource_id=row.id, resource_type="booking_assignment",
    )
    return assignment_record(row, booking.booking_reference, technician.full_name)


def _assignment_actor(db: Session, context: AdminContext, permission: Permission):
    actor = lock_authorized_admin(db, context, permission)
    enforce_permission(AdminRole(actor.role), Permission.TECHNICIAN_ASSIGNMENTS_MANAGE)
    return actor


def assign_booking(db: Session, context: AdminContext, booking_id: UUID, data: AssignInput) -> AssignmentRecord:
    with db.begin():
        actor = _assignment_actor(db, context, Permission.BOOKINGS_ASSIGN)
        booking = lock_booking(db, booking_id, customer_id=None)
        _require_assignable(booking, current_assignment(db, booking.id))
        technician = lock_technicians(db, data.technician_id)[data.technician_id]
        _require_eligible(db, technician, booking.service_date)
        previous = _latest_assignment(db, booking.id)
        return _record_assignment(db, booking, technician, actor.id, data.note, previous=previous)


def _require_assignable(booking: Booking, active: BookingAssignment | None) -> None:
    if booking.status != BookingStatus.CONFIRMED or active is not None:
        raise AppError(409, "booking_not_assignable", "Only confirmed bookings without a current assignment can be assigned.")


def _replacement_target(db: Session, booking: Booking, active: BookingAssignment | None) -> BookingAssignment:
    previous = active if active is not None else _latest_assignment(db, booking.id)
    if previous is None or booking.status not in (BookingStatus.CONFIRMED, BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS):
        raise AppError(409, "booking_not_reassignable", "The booking has no eligible assignment to replace.")
    if active is None and booking.status != BookingStatus.CONFIRMED:
        raise AppError(409, "assignment_state_conflict", "The booking has no current assignment.")
    if active is not None and booking.status == BookingStatus.CONFIRMED:
        raise AppError(409, "assignment_state_conflict", "The booking and assignment are out of sync.")
    return previous


def _work_started(booking: Booking, assignment: BookingAssignment) -> bool:
    return booking.status == BookingStatus.IN_PROGRESS or assignment.assignment_status == AssignmentStatus.IN_PROGRESS


def assignment_candidates(
    db: Session, context: AdminContext, booking_id: UUID, query: EligibleTechnicianQuery,
) -> EligibleTechniciansPage:
    permission = Permission.BOOKINGS_ASSIGN if query.mode == "assign" else Permission.BOOKINGS_REASSIGN
    enforce_permission(context.profile.role, permission)
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise not_found()
    active = current_assignment(db, booking.id)
    excluded = None
    if query.mode == "assign":
        _require_assignable(booking, active)
    else:
        excluded = _replacement_target(db, booking, active).technician_id

    now = _assignment_now(db, booking.service_date)
    page = eligible_technicians(
        db, booking.service_date, now.time() if booking.service_date == now.date() else None,
        query, exclude_id=excluded,
    )
    return EligibleTechniciansPage(
        items=page.items, total=page.total, page=page.page, page_size=page.page_size,
        service_date=booking.service_date, timezone=now.tzinfo.key,
        requires_in_progress_override=active is not None and _work_started(booking, active),
    )


def _require_explicit_work_override(
    booking: Booking, assignment: BookingAssignment, allow_in_progress: bool, reason: str | None,
) -> None:
    if _work_started(booking, assignment) and (not allow_in_progress or not reason):
        raise AppError(409, "assignment_in_progress", "Work has started. Explicitly allow the change and supply a reason.")


def reassign_booking(db: Session, context: AdminContext, booking_id: UUID, data: ReassignInput) -> AssignmentRecord:
    with db.begin():
        actor = _assignment_actor(db, context, Permission.BOOKINGS_REASSIGN)
        booking = lock_booking(db, booking_id, customer_id=None)
        active = current_assignment(db, booking.id)
        previous = _replacement_target(db, booking, active)
        if previous.technician_id == data.new_technician_id:
            raise AppError(409, "same_technician", "Choose a different technician for reassignment.")
        if active is not None:
            _require_explicit_work_override(booking, active, data.allow_in_progress, data.reassignment_reason)

        technicians = lock_technicians(db, previous.technician_id, data.new_technician_id)
        technician = technicians[data.new_technician_id]
        _require_eligible(db, technician, booking.service_date)
        if active is not None:
            active.assignment_status = AssignmentStatus.REASSIGNMENT_REQUIRED
            active.ended_at = utc_now()
            active.ended_by_admin_id = actor.id
            active.cancellation_reason = data.reassignment_reason
            db.flush()
        return _record_assignment(
            db, booking, technician, actor.id, data.administrative_note, previous=previous, reason=data.reassignment_reason,
        )


def unassign_booking(db: Session, context: AdminContext, booking_id: UUID, data: UnassignInput) -> AssignmentRecord:
    with db.begin():
        actor = _assignment_actor(db, context, Permission.BOOKINGS_UNASSIGN)
        booking = lock_booking(db, booking_id, customer_id=None)
        row = current_assignment(db, booking.id)
        if row is None or booking.status not in (BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS):
            raise AppError(409, "assignment_unavailable", "The booking has no current assignment to remove.")
        _require_explicit_work_override(booking, row, data.allow_in_progress, data.reason)
        technician = lock_technicians(db, row.technician_id)[row.technician_id]
        now = utc_now()
        row.assignment_status = AssignmentStatus.CANCELLED
        row.ended_at = row.cancelled_at = now
        row.ended_by_admin_id = actor.id
        row.cancellation_reason = data.reason
        transition_locked_booking(
            db, booking, BookingStatus.CONFIRMED, now, actor_type="admin", actor_id=actor.id,
            reason=data.reason, assignment_workflow=True,
        )
        record_audit(db, "booking_unassigned", actor_id=actor.id, resource_id=row.id, resource_type="booking_assignment")
        db.flush()
        return assignment_record(row, booking.booking_reference, technician.full_name)
