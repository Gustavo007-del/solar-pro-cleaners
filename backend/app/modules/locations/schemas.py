from typing import Literal
from uuid import UUID

from pydantic import model_validator

from app.modules.locations.validators import Latitude, Longitude, validate_pair

from app.schemas.catalogue import ConfigInput, LongText, PostalCode, PublicRecord, Text120

MatchType = Literal["pin", "locality", "city", "district"]


class LocationFields(ConfigInput):
    postal_code: PostalCode | None = None
    locality: Text120 | None = None
    city: Text120 | None = None
    district: Text120 | None = None
    state: Text120 | None = None


class LocationQuery(LocationFields):
    @model_validator(mode="after")
    def require_location(self) -> "LocationQuery":
        if not (self.postal_code or self.locality or self.city or self.district):
            raise ValueError("Provide a PIN code, locality, city, or district.")
        return self


class ServiceAreaInput(LocationFields):
    name: Text120
    match_type: MatchType
    description: LongText | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def validate_match_fields(self) -> "ServiceAreaInput":
        if self.match_type == "pin":
            valid = bool(self.postal_code)
        elif self.match_type == "locality":
            valid = not self.postal_code and bool(self.locality and self.city and self.state)
        elif self.match_type == "city":
            valid = not (self.postal_code or self.locality) and bool(self.city and self.state)
        else:
            valid = not (self.postal_code or self.locality or self.city) and bool(self.district and self.state)
        if not valid:
            raise ValueError("Location fields must match the coverage type.")
        return self


class PublicServiceArea(PublicRecord):
    id: UUID
    name: str
    match_type: MatchType
    postal_code: str | None
    locality: str | None
    city: str | None
    district: str | None
    state: str | None
    description: str | None


class CoverageResult(PublicRecord):
    covered: Literal[True] | None
    reason: Literal["matched", "conflicting_pin", "no_confident_match"]
    matched_area_id: UUID | None = None
    matched_area_name: str | None = None
    match_type: MatchType | None = None
    message: str


class CoverageCheckRequest(LocationFields):
    latitude: Latitude | None = None
    longitude: Longitude | None = None

    @model_validator(mode="after")
    def validate_coordinates(self) -> "CoverageCheckRequest":
        validate_pair(self.latitude, self.longitude)
        return self


class CoverageCheckResponse(PublicRecord):
    is_covered: bool
    match_type: Literal["postal_code", "locality", "city", "district", "unmatched"]
    matched_service_area_id: UUID | None
    matched_service_area_name: str | None
    requires_manual_confirmation: bool
    message: str
