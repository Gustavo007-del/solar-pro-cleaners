from datetime import date, datetime, time
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StrictBool, StringConstraints, model_validator

from app.modules.admins.schemas import AdminEmail
from app.modules.bookings.schemas import BookingAddressResponse, CalendarDate, Note
from app.modules.business.schemas import PublicURL
from app.modules.customers.schemas import FullName, PhoneNumber
from app.modules.locations.validators import AddressLine
from app.modules.technicians.status import AssignmentStatus, AvailabilityStatus, EmploymentStatus
from app.schemas.catalogue import ConfigInput, PostalCode, PublicPageQuery, PublicRecord, Text120
from app.schemas.common import AdminPage

LongNote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class TechnicianPatch(ConfigInput):
    full_name: FullName | None = None
    primary_phone: PhoneNumber | None = None
    alternate_phone: PhoneNumber | None = None
    email: AdminEmail | None = None
    profile_image_url: PublicURL | None = None
    address: AddressLine | None = None
    city: Text120 | None = None
    district: Text120 | None = None
    pin_code: PostalCode | None = None
    employment_status: EmploymentStatus | None = None
    joining_date: CalendarDate | None = None
    notes: LongNote | None = None


class TechnicianCreate(TechnicianPatch):
    full_name: FullName
    primary_phone: PhoneNumber
    employment_status: EmploymentStatus = EmploymentStatus.ACTIVE


class TechnicianUpdate(TechnicianPatch):
    @model_validator(mode="after")
    def validate_patch(self) -> "TechnicianUpdate":
        if not self.model_fields_set:
            raise ValueError("Supply at least one technician field.")
        for field in ("full_name", "primary_phone", "employment_status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError("Name, primary phone and employment status cannot be null.")
        return self


class DeactivateTechnician(ConfigInput):
    reason: Note | None = None
    retain_active_assignments: StrictBool = False


class TechnicianQuery(PublicPageQuery):
    search: Text120 | None = None
    employment_status: EmploymentStatus | None = None
    is_active: bool | None = None
    city: Text120 | None = None
    district: Text120 | None = None
    sort: Literal["name", "joining_date", "newest"] = "newest"


class TechnicianResponse(PublicRecord):
    id: UUID
    full_name: str
    primary_phone: str
    alternate_phone: str | None
    email: str | None
    profile_image_url: str | None
    address: str | None
    city: str | None
    district: str | None
    pin_code: str | None
    employment_status: EmploymentStatus
    is_active: bool
    joining_date: date | None
    availability_reset_at: datetime | None
    deactivation_reason: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class WorkloadCounts(PublicRecord):
    active_assignments: int = 0
    completed_assignments: int = 0
    rejected_assignments: int = 0
    cancelled_assignments: int = 0


class TechnicianCard(PublicRecord):
    id: UUID
    full_name: str
    primary_phone: str
    city: str | None
    employment_status: EmploymentStatus
    is_active: bool
    active_assignments: int
    completed_assignments: int


class DateQuery(PublicPageQuery):
    date_from: CalendarDate | None = None
    date_to: CalendarDate | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "DateQuery":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("The start date must be on or before the end date.")
        return self


class WorkloadQuery(TechnicianQuery, DateQuery):
    pass


class AvailabilityInput(ConfigInput):
    availability_date: CalendarDate | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None
    availability_status: AvailabilityStatus
    reason: Note | None = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "AvailabilityInput":
        if (self.availability_date is None) == (self.day_of_week is None):
            raise ValueError("Specify either a date or a weekday.")
        if self.start_time is not None or self.end_time is not None:
            if (
                self.availability_status != AvailabilityStatus.AVAILABLE
                or self.start_time is None or self.end_time is None
                or self.start_time.tzinfo is not None or self.end_time.tzinfo is not None
                or self.start_time >= self.end_time
            ):
                raise ValueError("Available hours require two ordered local times on the same day.")
        return self


class AvailabilityRecord(PublicRecord):
    id: UUID
    technician_id: UUID
    availability_date: date | None
    day_of_week: int | None
    start_time: time | None
    end_time: time | None
    availability_status: AvailabilityStatus
    reason: str | None
    created_at: datetime
    updated_at: datetime


class AvailabilityPage(AdminPage[AvailabilityRecord]):
    timezone: str


class EffectiveAvailability(PublicRecord):
    date: date
    timezone: str
    available: bool
    source: Literal["employment", "approved_leave", "date", "weekly", "unconfigured", "assignment", "outside_hours"]
    status: AvailabilityStatus
    start_time: time | None = None
    end_time: time | None = None


class LeaveInput(ConfigInput):
    start_date: CalendarDate
    end_date: CalendarDate
    is_approved: bool = True
    reason: Note | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "LeaveInput":
        if self.start_date > self.end_date:
            raise ValueError("The start date must be on or before the end date.")
        return self


class LeaveUpdate(ConfigInput):
    start_date: CalendarDate | None = None
    end_date: CalendarDate | None = None
    is_approved: bool | None = None
    reason: Note | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "LeaveUpdate":
        if not self.model_fields_set or any(
            getattr(self, field) is None for field in self.model_fields_set if field != "reason"
        ):
            raise ValueError("Supply a non-empty leave update with valid dates and approval.")
        return self


class LeaveRecord(PublicRecord):
    id: UUID
    technician_id: UUID
    start_date: date
    end_date: date
    is_approved: bool
    reason: str | None
    created_at: datetime
    updated_at: datetime


class AssignmentQuery(DateQuery):
    assignment_status: AssignmentStatus | None = None
    sort: Literal["newest", "oldest", "completed"] = "newest"


class AssignInput(ConfigInput):
    technician_id: UUID
    note: LongNote | None = None


class ReassignInput(ConfigInput):
    new_technician_id: UUID
    reassignment_reason: Note
    administrative_note: LongNote | None = None
    allow_in_progress: StrictBool = False


class UnassignInput(ConfigInput):
    reason: Note | None = None
    allow_in_progress: StrictBool = False


class AssignmentRecord(PublicRecord):
    id: UUID
    booking_id: UUID
    booking_reference: str
    technician_id: UUID
    technician_name: str
    assigned_by_admin_id: UUID
    replaces_assignment_id: UUID | None
    ended_by_admin_id: UUID | None
    service_date: date
    assignment_status: AssignmentStatus
    assigned_at: datetime
    accepted_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    ended_at: datetime | None
    cancellation_reason: str | None
    reassignment_reason: str | None
    administrative_note: str | None
    operational_note: str | None


class TechnicianDetails(TechnicianResponse):
    workload: WorkloadCounts
    availability: EffectiveAvailability
    active_assignments: AdminPage[AssignmentRecord]
    recent_assignments: list[AssignmentRecord]


class TechnicianWorkload(PublicRecord):
    id: UUID
    full_name: str
    employment_status: EmploymentStatus
    is_active: bool
    availability: EffectiveAvailability
    workload: WorkloadCounts


class TechnicianJob(PublicRecord):
    id: UUID
    booking_id: UUID
    booking_reference: str
    service_date: date
    service_name: str
    assignment_status: AssignmentStatus
    customer_name: str
    customer_phone: str
    address: BookingAddressResponse
    customer_instructions: str | None
