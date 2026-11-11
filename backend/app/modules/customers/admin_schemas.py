from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from app.modules.admins.audit import AccountReason
from app.modules.bookings.schemas import BookingListItem, CalendarDate
from app.modules.bookings.status import BookingStatus
from app.modules.customers.schemas import CustomerProfile, CustomerProfileUpdate
from app.modules.locations.address_schemas import SavedAddressDetails
from app.schemas.catalogue import ConfigInput, PublicPageQuery, PublicRecord, Text120
from app.schemas.common import AdminPage


class AdminCustomerQuery(PublicPageQuery):
    search: Text120 | None = None
    is_active: bool | None = None
    registered_from: CalendarDate | None = None
    registered_to: CalendarDate | None = None
    sort: Literal["newest", "oldest", "name"] = "newest"

    @model_validator(mode="after")
    def validate_registration_range(self) -> "AdminCustomerQuery":
        if self.registered_from and self.registered_to and self.registered_from > self.registered_to:
            raise ValueError("The registration start date must be on or before the end date.")
        return self


class AdminCustomerUpdate(CustomerProfileUpdate):
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_active(self) -> "AdminCustomerUpdate":
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("Account status must be true or false.")
        return self


class AccountStatusRequest(ConfigInput):
    reason: AccountReason | None = None


class AdminCustomerCard(CustomerProfile):
    total_bookings: int
    last_booking_at: datetime | None


class CustomerDetailQuery(ConfigInput):
    address_page: int = Field(default=1, ge=1, le=1_000_000)
    address_page_size: int = Field(default=20, ge=1, le=100)


class AdminCustomerDetails(PublicRecord):
    customer: CustomerProfile
    saved_addresses: AdminPage[SavedAddressDetails]
    total_bookings: int
    booking_status_counts: dict[BookingStatus, int]
    recent_bookings: list[BookingListItem]
