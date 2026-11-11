from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.business.models import BusinessClosure, BusinessOperatingHour
from app.modules.business.schemas import ClosurePage, OperatingHoursResponse, PublicClosure, PublicOperatingHour
from app.modules.business.service import require_active_business
from app.schemas.common import PaginationParams


def business_today(timezone: str) -> date:
    return datetime.now(ZoneInfo(timezone)).date()


def list_operating_hours(db: Session) -> OperatingHoursResponse:
    business = require_active_business(db)
    hours = db.scalars(
        select(BusinessOperatingHour)
        .where(BusinessOperatingHour.business_profile_id == business.id)
        .order_by(BusinessOperatingHour.day_of_week)
    )
    return OperatingHoursResponse(
        timezone=business.timezone, days=[PublicOperatingHour.model_validate(day) for day in hours],
    )


def list_closures(db: Session, query: PaginationParams) -> ClosurePage:
    business = require_active_business(db)
    filters = (
        BusinessClosure.business_profile_id == business.id,
        BusinessClosure.is_active.is_(True),
        BusinessClosure.closure_date >= business_today(business.timezone),
    )
    total = db.scalar(select(func.count()).select_from(BusinessClosure).where(*filters)) or 0
    closures = db.scalars(
        select(BusinessClosure).where(*filters).order_by(BusinessClosure.closure_date)
        .offset(query.offset).limit(query.page_size)
    )
    return ClosurePage(
        timezone=business.timezone, items=[PublicClosure.model_validate(row) for row in closures],
        page=query.page, page_size=query.page_size, total=total,
    )


def schedule_on_date(db: Session, business_id: UUID, requested_date: date) -> tuple[bool | None, bool]:
    closed = db.scalar(select(BusinessClosure.id).where(
        BusinessClosure.business_profile_id == business_id,
        BusinessClosure.closure_date == requested_date,
        BusinessClosure.is_active.is_(True),
    )) is not None
    if closed:
        return False, True
    is_open = db.scalar(select(BusinessOperatingHour.is_open).where(
        BusinessOperatingHour.business_profile_id == business_id,
        BusinessOperatingHour.day_of_week == requested_date.weekday(),
    ))
    return is_open, False
