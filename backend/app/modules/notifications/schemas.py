import json
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, Field, JsonValue, StringConstraints, field_validator, model_validator

from app.schemas.catalogue import ConfigInput, PublicRecord

Category = Literal["announcement", "promotional", "service_update", "booking_related", "general"]
RecipientType = Literal["all_customers", "selected_customers"]
CampaignStatus = Literal["draft", "scheduled", "active", "paused", "completed", "cancelled", "failed"]
Frequency = Literal["minutes", "hours", "daily", "weekly", "monthly"]
Destination = Literal["home", "bookings", "booking", "contact"]


def encoded_json(value) -> bytes:
    try:
        output = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
        # PostgreSQL JSONB and text cannot store embedded null characters.
        if has_null_character(value):
            raise ValueError
        return output
    except (ValueError, UnicodeError):
        raise ValueError("Use valid Unicode text and finite numbers.") from None


def has_null_character(value) -> bool:
    if isinstance(value, str):
        return "\x00" in value
    if isinstance(value, dict):
        return any(has_null_character(k) or has_null_character(v) for k, v in value.items())
    if isinstance(value, list):
        return any(map(has_null_character, value))
    return False


class DeviceRegistration(ConfigInput):
    expo_push_token: Annotated[str, StringConstraints(
        min_length=22, max_length=200, pattern=r"^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$",
    )]
    platform: Literal["android", "ios"]
    device_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None
    app_version: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)] | None = None

    @field_validator("device_name", "app_version")
    @classmethod
    def valid_text(cls, value: str | None) -> str | None:
        encoded_json(value)
        return value


class DevicePreferences(ConfigInput):
    enabled: bool


class DeviceResponse(PublicRecord):
    id: UUID
    platform: str
    device_name: str | None
    app_version: str | None
    is_active: bool
    notification_enabled: bool
    last_registered_at: datetime
    last_seen_at: datetime


class AdminDeviceResponse(DeviceResponse):
    customer_id: UUID


class Schedule(ConfigInput):
    mode: Literal["now", "once", "repeat"] = "now"
    start_at: datetime | None = None
    timezone: str = Field(default="Asia/Kolkata", max_length=64)
    frequency: Frequency | None = None
    interval: int = Field(default=1, ge=1, le=365)
    weekdays: list[Annotated[int, Field(ge=0, le=6)]] = Field(default_factory=list, max_length=7)
    month_day: int | None = Field(default=None, ge=1, le=31)
    end_at: datetime | None = None
    max_occurrences: int | None = Field(default=None, ge=1, le=10000)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Use an IANA timezone such as Asia/Kolkata.") from None
        return value

    @model_validator(mode="after")
    def validate_mode(self) -> "Schedule":
        if self.mode != "now" and self.start_at is None:
            raise ValueError("Choose a start date and time.")
        if (self.mode == "repeat") != (self.frequency is not None):
            raise ValueError("Choose a frequency for repeating schedules only.")
        if self.mode != "repeat" and (self.end_at or self.max_occurrences or self.interval != 1):
            raise ValueError("Schedule limits apply only to repeating campaigns.")
        if self.mode == "now" and self.start_at is not None:
            raise ValueError("Immediate campaigns start when queued.")
        if self.weekdays and self.frequency != "weekly":
            raise ValueError("Weekdays are available for weekly schedules only.")
        if self.month_day is not None and self.frequency != "monthly":
            raise ValueError("A day of the month is available for monthly schedules only.")
        return self


class CampaignContent(ConfigInput):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=700)]
    notification_type: Category = "general"
    recipient_type: RecipientType
    customer_ids: list[UUID] = Field(default_factory=list, max_length=500)
    destination: Destination | None = None
    booking_id: UUID | None = None
    custom_data: dict[str, JsonValue] = Field(default_factory=dict, max_length=20)
    schedule: Schedule = Field(default_factory=Schedule)

    @model_validator(mode="after")
    def validate_content(self) -> "CampaignContent":
        if (self.recipient_type == "selected_customers") != bool(self.customer_ids):
            raise ValueError("Choose at least one customer for a selected audience.")
        if len(set(self.customer_ids)) != len(self.customer_ids):
            raise ValueError("Select each customer only once.")
        if (self.destination == "booking") != (self.booking_id is not None):
            raise ValueError("Supply a booking ID only for a booking destination.")
        if self.booking_id and self.recipient_type != "selected_customers":
            raise ValueError("A booking destination requires a selected customer.")
        if len(encoded_json(self.custom_data)) > 1024:
            raise ValueError("Custom data must fit within 1 KB.")
        # Leave room for Expo's JSON envelope and escaping in the 4096 byte payload.
        if len(encoded_json([self.title, self.message])) > 2400:
            raise ValueError("Shorten the notification title or message.")
        return self


class CampaignCreate(CampaignContent):
    request_id: UUID


class CampaignAction(ConfigInput):
    confirm_broadcast: bool = False


class CampaignResponse(CampaignContent, PublicRecord):
    id: UUID
    status: CampaignStatus
    next_run_at: AwareDatetime | None
    occurrence_count: int
    created_by_admin_id: UUID
    created_at: datetime
    updated_at: datetime


class ExecutionResponse(PublicRecord):
    id: UUID
    scheduled_execution_at: datetime
    started_at: datetime
    completed_at: datetime | None
    execution_status: str
    recipients_count: int
    successful_submissions: int
    failed_submissions: int


class DeliveryResponse(PublicRecord):
    id: UUID
    execution_id: UUID
    customer_id: UUID
    platform: str
    status: str
    attempts: int
    submission_accepted: bool
    sent_at: datetime | None
    receipt_checked_at: datetime | None
    error_code: str | None
