import json
from datetime import date, datetime
from decimal import Decimal
from hashlib import sha256
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BeforeValidator, Field, ModelWrapValidatorHandler, PrivateAttr, StringConstraints, model_validator

from app.modules.availability.schemas import parse_requested_date
from app.modules.bookings.status import BookingStatus
from app.modules.locations.address_schemas import AddressInput, AddressPatch, AddressSnapshotResponse
from app.modules.pricing.schemas import PricingType
from app.schemas.catalogue import ConfigInput, PublicPageQuery, PublicRecord

Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
CalendarDate = Annotated[date, BeforeValidator(parse_requested_date)]
ReferenceQuery = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=17)]


class BookingPricingInput(ConfigInput):
    panel_quantity: int | None = Field(default=None, strict=True, ge=1, le=10_000)


class BookingCreate(ConfigInput):
    service_id: UUID
    service_date: CalendarDate
    address: AddressInput | None = None
    saved_address_id: UUID | None = None
    address_overrides: AddressPatch | None = None
    pricing: BookingPricingInput = Field(default_factory=BookingPricingInput)
    customer_instructions: Note | None = None
    _previous_request_hash: str | None = PrivateAttr(default=None)

    @model_validator(mode="wrap")
    @classmethod
    def preserve_previous_idempotency(
        cls, value: object, handler: ModelWrapValidatorHandler["BookingCreate"],
    ) -> "BookingCreate":
        booking = handler(value)
        if not isinstance(value, dict) or booking.address is None or booking.address_overrides is not None:
            return booking
        raw_address = value.get("address")
        if not isinstance(raw_address, dict):
            return booking
        address = booking.address
        if any(getattr(address, field) is not None for field in ("address_line_2", "recipient_name", "recipient_phone")):
            return booking

        # Phase 4 trimmed text but did not collapse its interior whitespace.
        fields = (
            "postal_code", "locality", "city", "district", "state",
            "address_line", "landmark", "latitude", "longitude", "location_source",
        )
        payload = booking.model_dump(mode="json", exclude={"saved_address_id", "address_overrides"})
        normalized = payload["address"]
        legacy_address = {field: normalized[field] for field in fields}
        for field in ("address_line", "locality", "city", "district", "state", "landmark"):
            if isinstance(raw_address.get(field), str):
                legacy_address[field] = raw_address[field].strip()
        payload["address"] = legacy_address
        booking._previous_request_hash = sha256(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        return booking

    def idempotency_hashes(self) -> tuple[str, str | None]:
        payload = self.model_dump(mode="json")
        if self.address_overrides is not None:
            payload["address_overrides"] = self.address_overrides.model_dump(mode="json", exclude_unset=True)
        current = sha256(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
        return current, self._previous_request_hash

    @model_validator(mode="after")
    def choose_address(self) -> "BookingCreate":
        if (self.address is None) == (self.saved_address_id is None):
            raise ValueError("Supply either a new address or a saved address ID.")
        if self.address_overrides is not None and self.saved_address_id is None:
            raise ValueError("Address overrides require a saved address ID.")
        return self


class BookingListQuery(PublicPageQuery):
    sort: Literal["newest", "oldest"] = "newest"
    status: BookingStatus | None = None
    date_from: CalendarDate | None = None
    date_to: CalendarDate | None = None
    reference: ReferenceQuery | None = None

    @model_validator(mode="after")
    def validate_date_bounds(self) -> "BookingListQuery":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("The start date must be on or before the end date.")
        return self


class BookingCancellation(ConfigInput):
    reason: Note | None = None


class BookingStatusSummary(PublicRecord):
    status: BookingStatus
    status_label: str


class BookingListItem(BookingStatusSummary):
    id: UUID
    booking_reference: str
    service_id: UUID
    service_name: str
    service_date: date
    estimated_amount: Decimal | None
    currency: str
    created_at: datetime
    address_summary: str


class BookingAddressResponse(AddressSnapshotResponse):
    google_maps_url: str | None


class AdminBookingLocation(PublicRecord):
    booking_id: UUID
    booking_reference: str
    coverage_matched: bool | None
    address: BookingAddressResponse


class BookingPricingResponse(PublicRecord):
    pricing_type: PricingType | None
    base_price: Decimal | None
    price_per_panel: Decimal | None
    minimum_charge: Decimal | None
    panel_quantity: int | None
    estimated_amount: Decimal | None
    currency: str


class BookingCustomerSnapshot(PublicRecord):
    full_name: str
    phone_number: str
    alternate_phone_number: str | None


class BookingHistoryItem(PublicRecord):
    old_status: BookingStatus | None
    new_status: BookingStatus
    status_label: str
    created_at: datetime


class BookingDetails(BookingListItem):
    customer: BookingCustomerSnapshot
    address: BookingAddressResponse
    pricing: BookingPricingResponse
    customer_instructions: str | None
    coverage_matched: bool | None
    updated_at: datetime
    confirmed_at: datetime | None
    assigned_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancellation_reason: str | None
    history: list[BookingHistoryItem]


class BookingCancellationResponse(BookingDetails):
    """Return the updated booking after customer cancellation."""
