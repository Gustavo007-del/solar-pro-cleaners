import re
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BeforeValidator

from app.modules.locations.schemas import CoverageResult, LocationQuery
from app.schemas.catalogue import PublicRecord


def parse_requested_date(value: object) -> date:
    if type(value) is date:
        return value
    if not isinstance(value, str) or re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value) is None:
        raise ValueError("Use a date in YYYY-MM-DD format.")
    return date.fromisoformat(value)


class AvailabilityQuery(LocationQuery):
    service_id: UUID
    requested_date: Annotated[date, BeforeValidator(parse_requested_date)]


class AvailabilityResult(PublicRecord):
    requested_date: date
    timezone: str
    service_active: bool
    coverage: CoverageResult
    business_operating: bool | None
    blocked_by_closure: bool | None
    manual_confirmation_required: bool
    reason: Literal["service_unavailable", "past_date", "closure", "closed", "confirmation_required", "candidate"]
    message: str
