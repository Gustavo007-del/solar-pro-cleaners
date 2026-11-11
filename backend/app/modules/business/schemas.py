import re
from datetime import date, time
from typing import Annotated
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, Field, StringConstraints, model_validator

from app.schemas.catalogue import ConfigInput, LongText, PostalCode, PublicRecord, Text120, Text300
from app.schemas.common import Page

DEFAULT_TIMEZONE = "Asia/Kolkata"


def validate_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("Use a valid IANA time zone.") from None
    return value


def validate_public_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
        if (
            parsed.scheme == "https" and parsed.hostname and parsed.username is None
            and parsed.password is None and not re.search(r"[\s\\]", value)
            and (port is None or port > 0)
        ):
            return value
    except ValueError:
        pass
    raise ValueError("Use a public HTTPS URL without credentials.")


Timezone = Annotated[str, StringConstraints(min_length=1, max_length=64), AfterValidator(validate_timezone)]
PublicURL = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2048), AfterValidator(validate_public_url)]
BusinessPhone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+[1-9][0-9]{7,14}$")]
SupportEmail = Annotated[str, StringConstraints(strip_whitespace=True, max_length=254, pattern=r"^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$")]


class BusinessFields(ConfigInput):
    business_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
    short_description: Text300 | None = None
    description: LongText | None = None
    primary_phone: BusinessPhone | None = None
    alternate_phone: BusinessPhone | None = None
    support_email: SupportEmail | None = None
    website_url: PublicURL | None = None
    whatsapp_number: BusinessPhone | None = None
    business_address: LongText | None = None
    city: Text120 | None = None
    district: Text120 | None = None
    state: Text120 | None = None
    postal_code: PostalCode | None = None
    logo_url: PublicURL | None = None
    privacy_policy_url: PublicURL | None = None
    terms_url: PublicURL | None = None
    timezone: Timezone = DEFAULT_TIMEZONE


class BusinessProfileInput(BusinessFields):
    is_active: bool = True


class PublicBusinessProfile(BusinessFields):
    model_config = PublicRecord.model_config


class OperatingHourFields(ConfigInput):
    day_of_week: int = Field(ge=0, le=6)
    is_open: bool
    opening_time: time | None = None
    closing_time: time | None = None

    @model_validator(mode="after")
    def validate_times(self) -> "OperatingHourFields":
        start, end = self.opening_time, self.closing_time
        if not self.is_open:
            if start is not None or end is not None:
                raise ValueError("Closed days cannot have opening or closing times.")
        elif start is None or end is None or start.tzinfo is not None or end.tzinfo is not None or start >= end:
            raise ValueError("Open days require ordered local times on the same day.")
        return self


class PublicOperatingHour(OperatingHourFields):
    model_config = PublicRecord.model_config


class OperatingHoursResponse(PublicRecord):
    timezone: str
    days: list[PublicOperatingHour]


class BusinessClosureInput(ConfigInput):
    closure_date: date
    reason: Text300 | None = None
    is_active: bool = True


class PublicClosure(PublicRecord):
    closure_date: date


class ClosurePage(Page[PublicClosure]):
    timezone: str
