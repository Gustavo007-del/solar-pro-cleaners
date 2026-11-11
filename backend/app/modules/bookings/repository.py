from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import AppError
from app.modules.bookings.models import Booking
from app.modules.bookings.schemas import BookingListItem, BookingListQuery
from app.modules.bookings.serialization import booking_card
from app.schemas.common import Page


def not_found() -> AppError:
    return AppError(404, "booking_not_found", "The requested booking was not found.")


def owned_details(db: Session, customer_id: UUID, booking_id: UUID) -> Booking:
    booking = db.execute(
        select(Booking).where(Booking.customer_id == customer_id, Booking.id == booking_id)
        .options(joinedload(Booking.address), joinedload(Booking.pricing), joinedload(Booking.history))
        .execution_options(populate_existing=True)
    ).unique().scalar_one_or_none()
    if booking is None:
        raise not_found()
    return booking


def lock_booking(db: Session, booking_id: UUID, *, customer_id: UUID | None) -> Booking:
    statement = select(Booking).where(Booking.id == booking_id)
    if customer_id is not None:
        statement = statement.where(Booking.customer_id == customer_id)
    booking = db.scalar(statement.with_for_update())
    if booking is None:
        raise not_found()
    return booking


def booking_filters(
    query: BookingListQuery, *, customer_id: UUID | None,
    service_id: UUID | None = None, search: str | None = None,
) -> list:
    filters = []
    if customer_id is not None:
        filters.append(Booking.customer_id == customer_id)
    if service_id is not None:
        filters.append(Booking.service_id == service_id)
    if query.status is not None:
        filters.append(Booking.status == query.status)
    if query.date_from is not None:
        filters.append(Booking.service_date >= query.date_from)
    if query.date_to is not None:
        filters.append(Booking.service_date <= query.date_to)
    if query.reference:
        filters.append(Booking.booking_reference.icontains(query.reference, autoescape=True))
    if search:
        filters.append(or_(
            Booking.booking_reference.icontains(search, autoescape=True),
            Booking.customer_name_snapshot.icontains(search, autoescape=True),
            Booking.customer_phone_snapshot.contains(search, autoescape=True),
        ))
    return filters


def page_bookings(
    db: Session, query: BookingListQuery, *, customer_id: UUID | None,
    service_id: UUID | None = None, search: str | None = None,
) -> Page[BookingListItem]:
    filters = booking_filters(query, customer_id=customer_id, service_id=service_id, search=search)
    order = (Booking.created_at.desc(), Booking.id.desc()) if query.sort == "newest" else (Booking.created_at, Booking.id)
    total = db.scalar(select(func.count()).select_from(Booking).where(*filters)) or 0
    rows = db.scalars(
        select(Booking).where(*filters)
        .options(joinedload(Booking.address), joinedload(Booking.pricing))
        .order_by(*order).offset(query.offset).limit(query.page_size)
    )
    return Page[BookingListItem](
        items=[booking_card(row) for row in rows], total=total, page=query.page, page_size=query.page_size,
    )
