from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.modules.bookings.schemas import CalendarDate
from app.modules.bookings.status import BookingStatus
from app.schemas.catalogue import ConfigInput, PublicRecord


class ReportingQuery(ConfigInput):
    start_date: CalendarDate | None = None
    end_date: CalendarDate | None = None

    @model_validator(mode="after")
    def validate_window(self) -> "ReportingQuery":
        if (self.start_date is None) != (self.end_date is None):
            raise ValueError("Supply both reporting dates or omit both.")
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("The start date must be on or before the end date.")
        return self


class SummaryQuery(ReportingQuery):
    recent_limit: int = Field(default=5, ge=1, le=20)


class AnalyticsQuery(ReportingQuery):
    interval: Literal["day", "week", "month"] = "day"

    @model_validator(mode="after")
    def limit_window(self) -> "AnalyticsQuery":
        if self.start_date and self.end_date and (self.end_date - self.start_date).days >= 366:
            raise ValueError("Analytics supports a maximum of 366 calendar days.")
        return self


class DateWindow(PublicRecord):
    start_date: date
    end_date: date


class RecentBooking(PublicRecord):
    id: UUID
    booking_reference: str
    service_name: str
    service_date: date | None
    status: BookingStatus
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class DashboardSummary(PublicRecord):
    timezone: str
    reporting_period: DateWindow
    booking_counts: dict[BookingStatus, int]
    total_bookings: int
    total_customers: int
    new_customers: int
    bookings_today: int
    bookings_this_week: int
    bookings_this_month: int
    recent_created: list[RecentBooking]
    recent_updated: list[RecentBooking]
    recent_completed: list[RecentBooking]


class AnalyticsPoint(PublicRecord):
    period_start: date
    total: int
    completed: int
    cancelled: int
    status_counts: dict[BookingStatus, int]


class BookingAnalytics(PublicRecord):
    timezone: str
    reporting_period: DateWindow
    interval: Literal["day", "week", "month"]
    points: list[AnalyticsPoint]
    status_distribution: dict[BookingStatus, int]
    completed: int
    cancelled: int
