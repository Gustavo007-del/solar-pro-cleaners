from datetime import date, time
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.modules.admins.audit import record_audit
from app.modules.admins.permissions import Permission
from app.modules.admins.reporting_dates import business_zone
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.customers.credentials import utc_now
from app.modules.technicians.models import BookingAssignment, Technician, TechnicianAvailability, TechnicianLeave
from app.modules.technicians.repository import get_technician
from app.modules.technicians.schemas import (
    AvailabilityInput, AvailabilityPage, AvailabilityRecord, DateQuery, EffectiveAvailability,
    EligibleTechnician, EligibleTechnicianQuery,
)
from app.schemas.common import Page
from app.modules.technicians.status import ACTIVE_ASSIGNMENTS, AvailabilityStatus, EmploymentStatus


def _availability_inputs(day: date):
    dated = aliased(TechnicianAvailability)
    weekly = aliased(TechnicianAvailability)
    has_override = dated.id.is_not(None)

    def applies(entry):
        return and_(
            entry.technician_id == Technician.id,
            or_(Technician.availability_reset_at.is_(None), entry.updated_at >= Technician.availability_reset_at),
        )

    on_leave = select(TechnicianLeave.id).where(
        TechnicianLeave.technician_id == Technician.id,
        TechnicianLeave.is_approved.is_(True),
        TechnicianLeave.start_date <= day,
        TechnicianLeave.end_date >= day,
    ).exists()
    busy = select(BookingAssignment.id).where(
        BookingAssignment.technician_id == Technician.id,
        BookingAssignment.service_date == day,
        BookingAssignment.assignment_status.in_(ACTIVE_ASSIGNMENTS),
    ).exists()
    return (
        select(
            Technician.id, Technician.full_name, Technician.city, Technician.employment_status,
            and_(Technician.is_active, Technician.employment_status == EmploymentStatus.ACTIVE).label("employed"),
            has_override.label("has_override"),
            on_leave.label("on_leave"),
            busy.label("busy"),
            case((has_override, dated.availability_status), else_=weekly.availability_status).label("status"),
            case((has_override, dated.start_time), else_=weekly.start_time).label("start_time"),
            case((has_override, dated.end_time), else_=weekly.end_time).label("end_time"),
        )
        .outerjoin(dated, and_(applies(dated), dated.availability_date == day))
        .outerjoin(weekly, and_(applies(weekly), weekly.day_of_week == day.weekday()))
    )


def _availability_source(row) -> str:
    if not row.employed:
        return "employment"
    if row.on_leave:
        return "approved_leave"
    if row.status is None:
        return "unconfigured"
    if row.status == AvailabilityStatus.AVAILABLE and row.busy:
        return "assignment"
    return "date" if row.has_override else "weekly"


def effective_availability(
    db: Session, technicians: list[Technician], day: date, timezone: str,
    *, local_time: time | None = None,
) -> dict[UUID, EffectiveAvailability]:
    if not technicians:
        return {}
    results = {}
    for row in db.execute(_availability_inputs(day).where(Technician.id.in_([tech.id for tech in technicians]))):
        source = _availability_source(row)
        values = {"date": day, "timezone": timezone, "available": False}
        if source == "employment":
            status = AvailabilityStatus.ON_LEAVE if row.employment_status == EmploymentStatus.ON_LEAVE else AvailabilityStatus.UNAVAILABLE
        elif source == "approved_leave":
            status = AvailabilityStatus.ON_LEAVE
        elif source == "unconfigured":
            status = AvailabilityStatus.UNAVAILABLE
        elif source == "assignment":
            status = AvailabilityStatus.TEMPORARILY_UNAVAILABLE
        else:
            status = row.status
            values.update(start_time=row.start_time, end_time=row.end_time)
            if status == AvailabilityStatus.AVAILABLE:
                if local_time is not None and row.start_time is not None and row.end_time is not None:
                    if not row.start_time <= local_time < row.end_time:
                        status, source = AvailabilityStatus.UNAVAILABLE, "outside_hours"
                values["available"] = status == AvailabilityStatus.AVAILABLE
        results[row.id] = EffectiveAvailability(**values, status=status, source=source)
    return results


def eligible_technicians(
    db: Session, day: date, cutoff: time | None, query: EligibleTechnicianQuery,
    *, exclude_id: UUID | None,
) -> Page[EligibleTechnician]:
    statement = _availability_inputs(day)
    if query.search is not None:
        statement = statement.where(Technician.full_name.icontains(query.search, autoescape=True))
    if exclude_id is not None:
        statement = statement.where(Technician.id != exclude_id)
    candidates = statement.subquery().c
    filters = [
        candidates.employed, ~candidates.on_leave, ~candidates.busy,
        candidates.status == AvailabilityStatus.AVAILABLE,
    ]
    if cutoff is not None:
        filters.append(or_(candidates.end_time.is_(None), candidates.end_time > cutoff))
    total = db.scalar(select(func.count()).where(*filters)) or 0
    rows = db.execute(
        select(candidates.id, candidates.full_name, candidates.city, candidates.start_time, candidates.end_time)
        .where(*filters).order_by(func.lower(candidates.full_name), candidates.id)
        .offset(query.offset).limit(query.page_size)
    )
    return Page[EligibleTechnician](
        items=[EligibleTechnician.model_validate(row) for row in rows],
        page=query.page, page_size=query.page_size, total=total,
    )


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
