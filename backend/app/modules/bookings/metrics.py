from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.bookings.models import Booking
from app.modules.bookings.status import BookingStatus


def status_counts(db: Session, *filters) -> dict[BookingStatus, int]:
    counts = dict.fromkeys(BookingStatus, 0)
    for status, total in db.execute(
        select(Booking.status, func.count()).where(*filters).group_by(Booking.status)
    ):
        counts[status] = total
    return counts
