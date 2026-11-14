import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, EmailStr, Field, StringConstraints, field_validator, model_validator

from app.schemas.catalogue import ConfigInput
from app.modules.bookings.schemas import BookingCreate

Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[^\x00]+$")]
Location = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300, pattern=r"^[^\x00]+$")]
Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=3000, pattern=r"^[^\x00]+$")]
Priority = Literal["low", "medium", "high"]
Status = Literal["new", "contact_pending", "contacted", "no_answer", "interested", "not_interested",
                 "follow_up_required", "callback_scheduled", "converted", "invalid", "do_not_contact"]
Outcome = Literal["answered", "no_answer", "busy", "switched_off", "invalid_number", "requested_callback",
                  "interested", "not_interested", "cleaning_already_completed", "other"]


class LeadInput(ConfigInput):
    name: Short | None = None
    phone: str | None = None
    alternate_phone: str | None = None
    whatsapp: str | None = None
    email: EmailStr | None = None
    location: Location | None = None
    district: Short | None = None
    state: Short | None = None
    postal_code: str | None = Field(default=None, pattern=r"^[1-9][0-9]{5}$")
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    installation_date: date | None = None
    capacity_kw: Decimal | None = Field(default=None, gt=0, le=100000)
    panel_type: Short | None = None
    panel_count: int | None = Field(default=None, ge=1, le=100000)
    installer: Short | None = None
    interest: Literal["unknown", "low", "medium", "high"] = "unknown"
    source: Short = "Manual entry"
    priority: Priority = "medium"

    @field_validator("phone", "alternate_phone", "whatsapp", mode="before")
    @classmethod
    def normalize_phone(cls, value):
        if value is None:
            return None
        if not isinstance(value, str) or len(value) > 32:
            raise ValueError("Enter a valid phone number.")
        number = re.sub(r"[ ()-]", "", value.strip())
        if re.fullmatch(r"[6-9][0-9]{9}", number):
            number = "+91" + number
        elif re.fullmatch(r"91[6-9][0-9]{9}", number):
            number = "+" + number
        elif number.startswith("00"):
            number = "+" + number[2:]
        if not re.fullmatch(r"\+[1-9][0-9]{7,14}", number):
            raise ValueError("Use an Indian mobile number or include the country code.")
        return number

    @model_validator(mode="after")
    def usable_record(self):
        if not any((self.phone, self.alternate_phone, self.whatsapp, self.email, self.location, self.name)):
            raise ValueError("Provide a name, contact number, email or installation location.")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude.")
        return self


class LeadWrite(LeadInput):
    allow_duplicate: bool = False


class SourceInput(ConfigInput):
    name: Short


class FollowUpInput(ConfigInput):
    due_at: AwareDatetime
    reason: Location
    notes: Note | None = None


class InteractionInput(ConfigInput):
    outcome: Outcome
    note: Note | None = None
    response: Location | None = None
    next_action: Location | None = None
    interest: Literal["unknown", "low", "medium", "high"] | None = None
    follow_up: FollowUpInput | None = None


class StatusInput(ConfigInput):
    status: Status
    reason: Note | None = None


class NoteInput(ConfigInput):
    note: Note


class BulkInput(ConfigInput):
    ids: list[UUID] = Field(min_length=1, max_length=100)
    action: Literal["assign", "status", "priority", "archive", "restore"]
    assigned_to: UUID | None = None
    status: Status | None = None
    priority: Priority | None = None
    reason: Note | None = None


class ConversionInput(ConfigInput):
    customer_id: UUID
    booking_id: UUID | None = None
    booking: BookingCreate | None = None

    @model_validator(mode="after")
    def single_booking(self):
        if self.booking is not None and self.booking_id is not None:
            raise ValueError("Choose an existing booking or create a new booking.")
        return self


class ImportInput(ConfigInput):
    rows: list[dict] = Field(min_length=1, max_length=100)
    allow_duplicates: bool = False
