from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.bookings.models import Booking
from app.modules.technicians.models import BookingAssignment, Technician
from app.modules.technicians.schemas import AssignmentQuery, AssignmentRecord, TechnicianQuery, WorkloadCounts
from app.modules.technicians.status import ACTIVE_ASSIGNMENTS, AssignmentStatus
from app.schemas.common import AdminPage


def get_technician(db: Session, technician_id: UUID, *, lock: bool = False) -> Technician:
    statement = select(Technician).where(Technician.id == technician_id)
    row = db.scalar(statement.with_for_update() if lock else statement)
    if row is None:
        raise AppError(404, "technician_not_found", "The requested technician was not found.")
    return row


def lock_technicians(db: Session, *technician_ids: UUID) -> dict[UUID, Technician]:
    # Reassignments can touch two technicians. Take their locks in a stable order.
    return {item: get_technician(db, item, lock=True) for item in sorted(set(technician_ids))}


def technician_page(db: Session, query: TechnicianQuery) -> tuple[list[Technician], int]:
    filters = []
    if query.employment_status is not None:
        filters.append(Technician.employment_status == query.employment_status)
    if query.is_active is not None:
        filters.append(Technician.is_active == query.is_active)
    if query.city:
        filters.append(func.lower(Technician.city) == func.lower(query.city))
    if query.district:
        filters.append(func.lower(Technician.district) == func.lower(query.district))
    if query.search:
        filters.append(or_(
            Technician.full_name.icontains(query.search, autoescape=True),
            Technician.primary_phone.contains(query.search, autoescape=True),
            Technician.alternate_phone.contains(query.search, autoescape=True),
        ))
    order = {
        "newest": (Technician.created_at.desc(), Technician.id.desc()),
        "name": (func.lower(Technician.full_name), Technician.id),
        "joining_date": (Technician.joining_date.desc().nulls_last(), Technician.id),
    }[query.sort]
    total = db.scalar(select(func.count()).select_from(Technician).where(*filters)) or 0
    items = list(db.scalars(select(Technician).where(*filters).order_by(*order).offset(query.offset).limit(query.page_size)))
    return items, total


def workload_counts(
    db: Session, technician_ids: list[UUID], date_from: date | None = None, date_to: date | None = None,
) -> dict[UUID, WorkloadCounts]:
    filters = [BookingAssignment.technician_id.in_(technician_ids)]
    if date_from is not None:
        filters.append(BookingAssignment.service_date >= date_from)
    if date_to is not None:
        filters.append(BookingAssignment.service_date <= date_to)
    status = BookingAssignment.assignment_status
    if not technician_ids:
        return {}
    rows = db.execute(select(
        BookingAssignment.technician_id,
        func.count().filter(status.in_(ACTIVE_ASSIGNMENTS)),
        func.count().filter(status == AssignmentStatus.COMPLETED),
        func.count().filter(status == AssignmentStatus.REJECTED),
        func.count().filter(status == AssignmentStatus.CANCELLED),
    ).where(*filters).group_by(BookingAssignment.technician_id))
    return {
        tech_id: WorkloadCounts(
            active_assignments=active, completed_assignments=completed, rejected_assignments=rejected,
            cancelled_assignments=cancelled,
        )
        for tech_id, active, completed, rejected, cancelled in rows
    }


def active_assignments(db: Session, technician_id: UUID) -> int:
    return db.scalar(select(func.count()).select_from(BookingAssignment).where(
        BookingAssignment.technician_id == technician_id, BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
    )) or 0


def assignment_record(row: BookingAssignment, booking_reference: str, technician_name: str) -> AssignmentRecord:
    values = {
        name: getattr(row, name) for name in AssignmentRecord.model_fields
        if name not in {"booking_reference", "technician_name"}
    }
    return AssignmentRecord(**values, booking_reference=booking_reference, technician_name=technician_name)


def assignment_page(
    db: Session, query: AssignmentQuery, *, booking_id: UUID | None = None,
    technician_id: UUID | None = None, active_only: bool = False,
) -> AdminPage[AssignmentRecord]:
    if booking_id is None and technician_id is None:
        raise ValueError("Assignment history requires a booking or technician scope.")
    filters = []
    if booking_id is not None:
        filters.append(BookingAssignment.booking_id == booking_id)
    if technician_id is not None:
        filters.append(BookingAssignment.technician_id == technician_id)
    if active_only:
        filters.append(BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS))
    if query.assignment_status is not None:
        filters.append(BookingAssignment.assignment_status == query.assignment_status)
    if query.date_from is not None:
        filters.append(BookingAssignment.service_date >= query.date_from)
    if query.date_to is not None:
        filters.append(BookingAssignment.service_date <= query.date_to)
    order = {
        "newest": (BookingAssignment.assigned_at.desc(), BookingAssignment.id.desc()),
        "oldest": (BookingAssignment.assigned_at, BookingAssignment.id),
        "completed": (BookingAssignment.completed_at.desc().nulls_last(), BookingAssignment.id.desc()),
    }[query.sort]
    total = db.scalar(select(func.count()).select_from(BookingAssignment).where(*filters)) or 0
    rows = db.execute(
        select(BookingAssignment, Booking.booking_reference, Technician.full_name).select_from(BookingAssignment)
        .join(Booking, Booking.id == BookingAssignment.booking_id)
        .join(Technician, Technician.id == BookingAssignment.technician_id)
        .where(*filters).order_by(*order).offset(query.offset).limit(query.page_size)
    )
    return AdminPage[AssignmentRecord](
        items=[assignment_record(row, reference, name) for row, reference, name in rows],
        page=query.page, page_size=query.page_size, total=total,
    )
