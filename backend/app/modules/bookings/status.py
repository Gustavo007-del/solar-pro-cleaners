from enum import StrEnum


class BookingStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


STATUS_LABELS = {status: status.value.replace("_", " ").title() for status in BookingStatus}

TRANSITIONS = {
    BookingStatus.PENDING: frozenset({BookingStatus.CONFIRMED, BookingStatus.CANCELLED}),
    BookingStatus.CONFIRMED: frozenset({BookingStatus.ASSIGNED, BookingStatus.CANCELLED}),
    BookingStatus.ASSIGNED: frozenset({BookingStatus.IN_PROGRESS, BookingStatus.CONFIRMED}),
    BookingStatus.IN_PROGRESS: frozenset({BookingStatus.COMPLETED, BookingStatus.CONFIRMED, BookingStatus.ASSIGNED}),
    BookingStatus.COMPLETED: frozenset(),
    BookingStatus.CANCELLED: frozenset(),
}
CUSTOMER_CANCELLABLE_STATUSES = frozenset({BookingStatus.PENDING})
