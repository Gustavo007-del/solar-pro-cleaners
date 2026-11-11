from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.modules.admins.dashboard_schemas import (
    AnalyticsPoint, AnalyticsQuery, BookingAnalytics, DashboardSummary, DateWindow, RecentBooking,
    ReportingQuery, SummaryQuery,
)
from app.modules.admins.reporting_dates import business_zone, date_filters
from app.modules.bookings.metrics import status_counts
from app.modules.bookings.models import Booking
from app.modules.bookings.status import BookingStatus
from app.modules.customers.models import Customer


def _window(query: ReportingQuery, today: date) -> DateWindow:
    return DateWindow(
        start_date=query.start_date or today - timedelta(days=29),
        end_date=query.end_date or today,
    )


def _recent(db: Session, column, query: SummaryQuery, zone: ZoneInfo) -> list[RecentBooking]:
    rows = db.execute(
        select(
            Booking.id, Booking.booking_reference, Booking.service_name_snapshot.label("service_name"),
            Booking.service_date, Booking.status, Booking.created_at, Booking.updated_at, Booking.completed_at,
        ).where(column.is_not(None), *date_filters(column, query.start_date, query.end_date, zone))
        .order_by(column.desc(), Booking.id.desc()).limit(query.recent_limit)
    ).mappings()
    return [RecentBooking.model_validate(row) for row in rows]


def summary(db: Session, query: SummaryQuery) -> DashboardSummary:
    zone = business_zone(db)
    today = datetime.now(zone).date()
    period = _window(query, today)
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    total_customers, new_customers = db.execute(
        select(
            func.count(),
            func.count().filter(*date_filters(Customer.created_at, period.start_date, period.end_date, zone)),
        ).select_from(Customer)
    ).one()
    today_count, week_count, month_count = db.execute(
        select(
            func.count().filter(*date_filters(Booking.created_at, today, today, zone)),
            func.count().filter(*date_filters(Booking.created_at, week_start, today, zone)),
            func.count().filter(*date_filters(Booking.created_at, month_start, today, zone)),
        ).select_from(Booking).where(*date_filters(Booking.created_at, min(week_start, month_start), today, zone))
    ).one()
    counts = status_counts(db, *date_filters(Booking.created_at, query.start_date, query.end_date, zone))
    return DashboardSummary(
        timezone=zone.key, reporting_period=period,
        booking_counts=counts, total_bookings=sum(counts.values()), total_customers=total_customers,
        new_customers=new_customers, bookings_today=today_count, bookings_this_week=week_count,
        bookings_this_month=month_count, recent_created=_recent(db, Booking.created_at, query, zone),
        recent_updated=_recent(db, Booking.updated_at, query, zone),
        recent_completed=_recent(db, Booking.completed_at, query, zone),
    )


def _period_start(day: date, interval: str) -> date:
    if interval == "week":
        return day - timedelta(days=day.weekday())
    if interval == "month":
        return day.replace(day=1)
    return day


def _next_period(day: date, interval: str) -> date:
    if interval == "month":
        return date(day.year + (day.month == 12), day.month % 12 + 1, 1)
    return day + timedelta(days=7 if interval == "week" else 1)


def analytics(db: Session, query: AnalyticsQuery) -> BookingAnalytics:
    zone = business_zone(db)
    period = _window(query, datetime.now(zone).date())
    bucket = cast(func.date_trunc(query.interval, func.timezone(zone.key, Booking.created_at)), Date).label("bucket")
    rows = db.execute(
        select(bucket, Booking.status, func.count())
        .where(*date_filters(Booking.created_at, period.start_date, period.end_date, zone))
        .group_by(bucket, Booking.status)
    )
    by_period: dict[date, dict[BookingStatus, int]] = {}
    distribution = dict.fromkeys(BookingStatus, 0)
    for day, status, total in rows:
        by_period.setdefault(day, dict.fromkeys(BookingStatus, 0))[status] = total
        distribution[status] += total

    current = _period_start(period.start_date, query.interval)
    last = _period_start(period.end_date, query.interval)
    points = []
    while True:
        counts = by_period.get(current) or dict.fromkeys(BookingStatus, 0)
        points.append(AnalyticsPoint(
            period_start=current, total=sum(counts.values()), completed=counts[BookingStatus.COMPLETED],
            cancelled=counts[BookingStatus.CANCELLED], status_counts=counts,
        ))
        if current >= last:
            break
        current = _next_period(current, query.interval)

    return BookingAnalytics(
        timezone=zone.key, reporting_period=period, interval=query.interval, points=points,
        status_distribution=distribution, completed=distribution[BookingStatus.COMPLETED],
        cancelled=distribution[BookingStatus.CANCELLED],
    )
