from datetime import date, time
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.modules.admins.audit import record_audit
from app.modules.admins.permissions import Permission
from app.modules.admins.reporting_dates import business_zone
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.customers.credentials import utc_now
from app.modules.technicians.models import BookingAssignment, Technician, TechnicianAvailability, TechnicianLeave
from app.modules.technicians.repository import get_technician
from app.modules.technicians.schemas import AvailabilityInput, AvailabilityPage, AvailabilityRecord, DateQuery, EffectiveAvailability
from app.modules.technicians.status import ACTIVE_ASSIGNMENTS, AvailabilityStatus, EmploymentStatus


def effective_availability(
    db: Session, technicians: list[Technician], day: date, timezone: str,
    *, local_time: time | None = None,
) -> dict:
    if not technicians:
        return {}
    ids = [row.id for row in technicians]
    schedule = db.scalars(select(TechnicianAvailability).where(
        TechnicianAvailability.technician_id.in_(ids),
        or_(TechnicianAvailability.availability_date == day, TechnicianAvailability.day_of_week == day.weekday()),
    ))
    entries = {(row.technician_id, row.availability_date is not None): row for row in schedule}
    on_leave = set(db.scalars(select(TechnicianLeave.technician_id).where(
        TechnicianLeave.technician_id.in_(ids), TechnicianLeave.is_approved.is_(True),
        TechnicianLeave.start_date <= day, TechnicianLeave.end_date >= day,
    )))
    busy = set(db.scalars(select(BookingAssignment.technician_id).where(
        BookingAssignment.technician_id.in_(ids), BookingAssignment.service_date == day,
        BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
    )))

    results = {}
    for technician in technicians:
        def eligible(entry):
            return entry is not None and (
                technician.availability_reset_at is None or entry.updated_at >= technician.availability_reset_at
            )

        override, weekly = entries.get((technician.id, True)), entries.get((technician.id, False))
        entry = override if eligible(override) else weekly if eligible(weekly) else None
        values = {"date": day, "timezone": timezone, "available": False}
        if not technician.is_active or technician.employment_status != EmploymentStatus.ACTIVE:
            status = AvailabilityStatus.ON_LEAVE if technician.employment_status == EmploymentStatus.ON_LEAVE else AvailabilityStatus.UNAVAILABLE
            result = EffectiveAvailability(**values, status=status, source="employment")
        elif technician.id in on_leave:
            result = EffectiveAvailability(**values, status=AvailabilityStatus.ON_LEAVE, source="approved_leave")
        elif entry is None:
            result = EffectiveAvailability(**values, status=AvailabilityStatus.UNAVAILABLE, source="unconfigured")
        elif entry.availability_status == AvailabilityStatus.AVAILABLE and technician.id in busy:
            result = EffectiveAvailability(**values, status=AvailabilityStatus.TEMPORARILY_UNAVAILABLE, source="assignment")
        elif (
            entry.availability_status == AvailabilityStatus.AVAILABLE and local_time is not None
            and entry.start_time is not None and entry.end_time is not None
            and not entry.start_time <= local_time < entry.end_time
        ):
            result = EffectiveAvailability(
                **values, status=AvailabilityStatus.UNAVAILABLE, source="outside_hours",
                start_time=entry.start_time, end_time=entry.end_time,
            )
        else:
            values["available"] = entry.availability_status == AvailabilityStatus.AVAILABLE
            result = EffectiveAvailability(
                **values, status=entry.availability_status,
                source="date" if entry.availability_date is not None else "weekly",
                start_time=entry.start_time, end_time=entry.end_time,
            )
        results[technician.id] = result
    return results


def list_availability(db: Session, technician_id: UUID, query: DateQuery) -> AvailabilityPage:
    get_technician(db, technician_id)
    model = TechnicianAvailability
    dated = [model.availability_date.is_not(None)]
    if query.date_from is not None:
        dated.append(model.availability_date >= query.date_from)
    if query.date_to is not None:
        dated.append(model.availability_date <= query.date_to)
    filters = (model.technician_id == technician_id, or_(model.day_of_week.is_not(None), and_(*dated)))
    total = db.scalar(select(func.count()).select_from(model).where(*filters)) or 0
    rows = db.scalars(
        select(model).where(*filters).order_by(model.availability_date.desc().nulls_last(), model.day_of_week, model.id)
        .offset(query.offset).limit(query.page_size)
    )
    return AvailabilityPage(
        timezone=business_zone(db).key, items=[AvailabilityRecord.model_validate(row) for row in rows],
        page=query.page, page_size=query.page_size, total=total,
    )


def put_availability(db: Session, context: AdminContext, technician_id: UUID, data: AvailabilityInput) -> AvailabilityRecord:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.TECHNICIAN_AVAILABILITY_MANAGE)
        get_technician(db, technician_id, lock=True)
        model = TechnicianAvailability
        key = model.availability_date == data.availability_date if data.availability_date is not None else model.day_of_week == data.day_of_week
        row = db.scalar(select(model).where(model.technician_id == technician_id, key))
        if row is None:
            row = model(technician_id=technician_id, **data.model_dump())
            db.add(row)
        else:
            for name, value in data.model_dump().items():
                setattr(row, name, value)
        row.updated_at = utc_now()
        db.flush()
        record_audit(db, "technician_availability_changed", actor_id=actor.id, resource_id=row.id, resource_type="technician_availability")
        return AvailabilityRecord.model_validate(row)
