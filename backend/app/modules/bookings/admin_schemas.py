from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import StringConstraints, model_validator

from app.modules.bookings.schemas import BookingDetails, BookingHistoryItem, BookingListItem, BookingListQuery, CalendarDate, Note
from app.modules.bookings.status import BookingStatus
from app.modules.technicians.status import AssignmentStatus
from app.schemas.catalogue import ConfigInput, PostalCode, PublicRecord, Text120


class AdminBookingQuery(BookingListQuery):
    sort: Literal["newest", "oldest", "service_date", "updated"] = "newest"
    search: Text120 | None = None
    customer_name: Text120 | None = None
    customer_phone: Text120 | None = None
    service_id: UUID | None = None
    technician_id: UUID | None = None
    created_from: CalendarDate | None = None
    created_to: CalendarDate | None = None
    city: Text120 | None = None
    district: Text120 | None = None
    postal_code: PostalCode | None = None

    @model_validator(mode="after")
    def validate_creation_bounds(self) -> "AdminBookingQuery":
        if self.created_from and self.created_to and self.created_from > self.created_to:
            raise ValueError("The creation start date must be on or before the end date.")
        return self


class CurrentTechnician(PublicRecord):
    assignment_id: UUID
    technician_id: UUID
    technician_name: str
    assignment_status: AssignmentStatus


class AdminBookingCard(BookingListItem):
    customer_id: UUID
    customer_name: str
    customer_phone: str
    updated_at: datetime
    current_assignment: CurrentTechnician | None = None


class AdminBookingHistory(BookingHistoryItem):
    changed_by_type: Literal["customer", "admin", "system", "technician"]
    changed_by_id: UUID | None
    changed_by_name: str | None
    reason: str | None


class AdminBookingDetails(BookingDetails):
    customer_id: UUID
    service_current_description: str | None
    legacy_admin_notes: str | None
    history: list[AdminBookingHistory]
    current_assignment: CurrentTechnician | None = None


class AdminBookingStatusUpdate(ConfigInput):
    status: BookingStatus
    reason: Note | None = None


class BookingAdminNoteInput(ConfigInput):
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class BookingAdminNoteResponse(PublicRecord):
    id: UUID
    booking_id: UUID
    admin_id: UUID
    note: str
    created_at: datetime
    updated_at: datetime
