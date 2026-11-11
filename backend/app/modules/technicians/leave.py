from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.permissions import Permission
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.technicians.models import BookingAssignment, TechnicianLeave
from app.modules.technicians.repository import get_technician
from app.modules.technicians.schemas import DateQuery, LeaveInput, LeaveRecord, LeaveUpdate
from app.modules.technicians.status import ACTIVE_ASSIGNMENTS
from app.schemas.common import AdminPage


def list_leave(db: Session, technician_id: UUID, query: DateQuery) -> AdminPage[LeaveRecord]:
    get_technician(db, technician_id)
    model = TechnicianLeave
    filters = [model.technician_id == technician_id]
    if query.date_from is not None:
        filters.append(model.end_date >= query.date_from)
    if query.date_to is not None:
        filters.append(model.start_date <= query.date_to)
    total = db.scalar(select(func.count()).select_from(model).where(*filters)) or 0
    rows = db.scalars(
        select(model).where(*filters).order_by(model.start_date.desc(), model.id.desc())
        .offset(query.offset).limit(query.page_size)
    )
    return AdminPage[LeaveRecord](
        items=[LeaveRecord.model_validate(row) for row in rows],
        page=query.page, page_size=query.page_size, total=total,
    )


def _owned_leave(db: Session, technician_id: UUID, leave_id: UUID) -> TechnicianLeave:
    row = db.scalar(select(TechnicianLeave).where(
        TechnicianLeave.id == leave_id, TechnicianLeave.technician_id == technician_id,
    ))
    if row is None:
        raise AppError(404, "technician_leave_not_found", "The requested leave record was not found.")
    return row


def _check_conflicts(db: Session, technician_id: UUID, data: LeaveInput, exclude: UUID | None = None) -> None:
    filters = [
        TechnicianLeave.technician_id == technician_id,
        TechnicianLeave.start_date <= data.end_date, TechnicianLeave.end_date >= data.start_date,
    ]
    if exclude is not None:
        filters.append(TechnicianLeave.id != exclude)
    if db.scalar(select(TechnicianLeave.id).where(*filters).limit(1)) is not None:
        raise AppError(409, "technician_leave_overlap", "The leave dates overlap another leave record.")
    if data.is_approved and db.scalar(select(BookingAssignment.id).where(
        BookingAssignment.technician_id == technician_id, BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
        BookingAssignment.service_date.between(data.start_date, data.end_date),
    ).limit(1)) is not None:
        raise AppError(409, "technician_active_assignments", "Resolve active assignments before approving leave for these dates.")


def save_leave(
    db: Session, context: AdminContext, technician_id: UUID, data: LeaveInput | LeaveUpdate, *, leave_id: UUID | None = None,
) -> LeaveRecord:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.TECHNICIAN_LEAVE_MANAGE)
        get_technician(db, technician_id, lock=True)
        row = _owned_leave(db, technician_id, leave_id) if leave_id is not None else None
        if row is not None:
            values = {name: getattr(row, name) for name in LeaveInput.model_fields}
            values.update(data.model_dump(exclude_unset=True))
            if values["start_date"] > values["end_date"]:
                raise AppError(422, "invalid_leave_dates", "The start date must be on or before the end date.")
            fields = LeaveInput.model_validate(values)
        else:
            fields = data
        _check_conflicts(db, technician_id, fields, exclude=leave_id)
        if row is None:
            row = TechnicianLeave(technician_id=technician_id, **fields.model_dump())
            db.add(row)
        else:
            for name, value in fields.model_dump().items():
                setattr(row, name, value)
        db.flush()
        record_audit(
            db, "technician_leave_updated" if leave_id else "technician_leave_created",
            actor_id=actor.id, resource_id=row.id, resource_type="technician_leave",
        )
        return LeaveRecord.model_validate(row)


def delete_leave(db: Session, context: AdminContext, technician_id: UUID, leave_id: UUID) -> None:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.TECHNICIAN_LEAVE_MANAGE)
        get_technician(db, technician_id, lock=True)
        row = _owned_leave(db, technician_id, leave_id)
        record_audit(db, "technician_leave_deleted", actor_id=actor.id, resource_id=row.id, resource_type="technician_leave")
        db.delete(row)
