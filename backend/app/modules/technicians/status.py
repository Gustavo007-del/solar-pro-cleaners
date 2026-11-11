from enum import StrEnum


class EmploymentStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ON_LEAVE = "on_leave"
    TERMINATED = "terminated"


class AvailabilityStatus(StrEnum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    ON_LEAVE = "on_leave"
    TEMPORARILY_UNAVAILABLE = "temporarily_unavailable"


class AssignmentStatus(StrEnum):
    ASSIGNED = "assigned"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    REASSIGNMENT_REQUIRED = "reassignment_required"


ACTIVE_ASSIGNMENTS = (AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.IN_PROGRESS)
ACTIVE_SQL = "assignment_status IN ('assigned', 'accepted', 'in_progress')"
