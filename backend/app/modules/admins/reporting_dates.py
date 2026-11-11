from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.modules.business.schemas import DEFAULT_TIMEZONE
from app.modules.business.service import find_active_business


def business_zone(db: Session) -> ZoneInfo:
    business = find_active_business(db)
    return ZoneInfo(business.timezone if business else db.info.get("business_timezone", DEFAULT_TIMEZONE))


def utc_day_start(day: date, zone: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=zone).astimezone(UTC)


def date_filters(column, start: date | None, end: date | None, zone: ZoneInfo) -> list:
    filters = []
    if start is not None and start > date.min:
        filters.append(column >= utc_day_start(start, zone))
    if end is not None and end < date.max:
        filters.append(column < utc_day_start(end + timedelta(days=1), zone))
    return filters
