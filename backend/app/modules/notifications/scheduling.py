from calendar import monthrange
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.exceptions import AppError
from app.modules.notifications.schemas import Schedule


def utc_time(value: datetime, zone: ZoneInfo) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(UTC)
    result = value.replace(tzinfo=zone, fold=0).astimezone(UTC)
    if result.astimezone(zone).replace(tzinfo=None) != value:
        raise AppError(422, "invalid_schedule_time", "This local time does not exist. Choose another time.")
    return result


def calendar_time(day: date, anchor: datetime, zone: ZoneInfo) -> datetime:
    # A daylight-saving gap moves the occurrence forward by the size of the gap.
    return datetime.combine(day, anchor.time(), tzinfo=zone).astimezone(UTC)


def next_occurrence(schedule: Schedule, after: datetime | None = None) -> datetime | None:
    if schedule.start_at is None:
        return None
    zone = ZoneInfo(schedule.timezone)
    start = utc_time(schedule.start_at, zone)
    if schedule.mode == "once":
        return start if after is None or start > after else None

    cutoff = max(start - timedelta(microseconds=1), after or start - timedelta(microseconds=1))
    anchor = start.astimezone(zone)
    local_day = cutoff.astimezone(zone).date()
    interval = schedule.interval
    if schedule.frequency in ("minutes", "hours"):
        step = timedelta(minutes=interval * (60 if schedule.frequency == "hours" else 1))
        result = start + step * max(0, (cutoff - start) // step + 1)
    elif schedule.frequency == "daily":
        day = anchor.date()
        offset = max(0, (local_day - day).days // interval)
        result = calendar_time(day + timedelta(days=offset * interval), anchor, zone)
        if result <= cutoff:
            result = calendar_time(day + timedelta(days=(offset + 1) * interval), anchor, zone)
    elif schedule.frequency == "weekly":
        week = anchor.date() - timedelta(days=anchor.weekday())
        offset = max(0, (local_day - week).days // (7 * interval))
        days = sorted(set(schedule.weekdays or [anchor.weekday()]))
        result = next(
            candidate for slot in (offset, offset + 1) for weekday in days
            if (candidate := calendar_time(week + timedelta(weeks=slot * interval, days=weekday), anchor, zone)) > cutoff
        )
    else:
        month = anchor.year * 12 + anchor.month - 1
        offset = max(0, (local_day.year * 12 + local_day.month - 1 - month) // interval)
        day = schedule.month_day or anchor.day
        def in_month(slot: int) -> datetime:
            year, index = divmod(month + slot * interval, 12)
            return calendar_time(date(year, index + 1, min(day, monthrange(year, index + 1)[1])), anchor, zone)
        result = in_month(offset)
        if result <= cutoff:
            result = in_month(offset + 1)
    if schedule.end_at is not None and result > utc_time(schedule.end_at, zone):
        return None
    return result


def validate_schedule(schedule: Schedule, minimum_minutes: int) -> None:
    zone = ZoneInfo(schedule.timezone)
    if any(value and not 2000 <= value.year <= 2100 for value in (schedule.start_at, schedule.end_at)):
        raise AppError(422, "invalid_schedule_time", "Choose a date between 2000 and 2100.")
    start = utc_time(schedule.start_at, zone) if schedule.start_at is not None else None
    end = utc_time(schedule.end_at, zone) if schedule.end_at is not None else None
    if start and end and end < start:
        raise AppError(422, "invalid_schedule_end", "The end must be on or after the start.")
    minimum = {"minutes": 1, "hours": 60, "daily": 1440, "weekly": 1440, "monthly": 28 * 1440}
    if schedule.frequency:
        multiplier = 1 if schedule.frequency == "weekly" and len(set(schedule.weekdays)) > 1 else schedule.interval
        if minimum[schedule.frequency] * multiplier < minimum_minutes:
            raise AppError(422, "schedule_interval_too_short", f"Allow at least {minimum_minutes} minutes between sends.")
