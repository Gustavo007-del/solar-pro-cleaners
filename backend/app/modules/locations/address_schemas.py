from datetime import datetime
from decimal import Decimal
from typing import Annotated
from typing import Literal
from uuid import UUID

from pydantic import PlainSerializer, computed_field, model_validator

from app.modules.customers.schemas import FullName, PhoneNumber
from app.modules.locations.schemas import LocationFields
from app.modules.locations.utils import google_maps_url
from app.modules.locations.validators import AddressLabel, AddressLine, AddressText, Latitude, Longitude, validate_pair
from app.schemas.catalogue import PublicRecord

LocationSource = Literal["gps", "manual", "gps_with_manual_address"]


class AddressPatch(LocationFields):
    address_line: AddressLine | None = None
    address_line_2: AddressLine | None = None
    recipient_name: FullName | None = None
    recipient_phone: PhoneNumber | None = None
    locality: AddressText | None = None
    city: AddressText | None = None
    district: AddressText | None = None
    state: AddressText | None = None
    landmark: AddressText | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    location_source: LocationSource | None = None


class AddressInput(AddressPatch):
    address_line: AddressLine
    location_source: LocationSource

    @model_validator(mode="after")
    def validate_coordinates(self) -> "AddressInput":
        validate_pair(self.latitude, self.longitude)
        if (self.location_source == "manual") == (self.latitude is not None):
            raise ValueError("GPS sources require coordinates and manual addresses omit them.")
        return self


class SavedAddressCreate(AddressInput):
    label: AddressLabel | None = None
    is_default: bool = False


class SavedAddressUpdate(AddressPatch):
    label: AddressLabel | None = None
    is_default: bool | None = None

    @model_validator(mode="after")
    def check_update(self) -> "SavedAddressUpdate":
        if not self.model_fields_set:
            raise ValueError("Send at least one address field.")
        if "is_default" in self.model_fields_set and self.is_default is None:
            raise ValueError("The default flag must be true or false.")
        return self


Coordinate = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]


class AddressSnapshotResponse(PublicRecord):
    address_line: str
    address_line_2: str | None
    recipient_name: str | None
    recipient_phone: str | None
    locality: str | None
    city: str | None
    district: str | None
    state: str | None
    postal_code: str | None
    landmark: str | None
    latitude: Coordinate | None
    longitude: Coordinate | None
    location_source: LocationSource


class SavedAddressListItem(PublicRecord):
    id: UUID
    label: str | None
    address_line: str
    locality: str | None
    city: str | None
    postal_code: str | None
    location_source: LocationSource
    is_default: bool
    created_at: datetime
    updated_at: datetime


class SavedAddressDetails(SavedAddressListItem, AddressSnapshotResponse):
    @computed_field
    @property
    def google_maps_url(self) -> str | None:
        return google_maps_url(self.latitude, self.longitude)
