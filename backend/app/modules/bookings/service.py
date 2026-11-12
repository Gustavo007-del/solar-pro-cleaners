from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from secrets import choice
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.availability.service import evaluate_service_date
from app.modules.bookings.metrics import status_counts
from app.modules.bookings.models import Booking, BookingAddress, BookingPricingSnapshot, BookingStatusHistory
from app.modules.bookings.repository import lock_booking, owned_details, page_bookings
from app.modules.bookings.schemas import (
    BookingCancellation, BookingCancellationResponse, BookingCreate, BookingDetails, BookingListQuery, CustomerBookingPage,
)
from app.modules.bookings.serialization import booking_details
from app.modules.bookings.status import BookingStatus, CUSTOMER_CANCELLABLE_STATUSES
from app.modules.bookings.transitions import transition_locked_booking
from app.modules.customers.credentials import utc_now
from app.modules.customers.service import CustomerContext, lock_authenticated_session
from app.modules.locations.address_schemas import AddressInput
from app.modules.locations.addresses import resolve_saved_address
from app.modules.locations.utils import google_maps_url
from app.modules.pricing.service import find_applicable_price
from app.modules.services.service import require_active_service

REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _reference() -> str:
    groups = ("".join(choice(REFERENCE_ALPHABET) for _ in range(4)) for _ in range(3))
    return "SC-" + "-".join(groups)


def _insert_booking(db: Session, values: dict) -> None:
    for _ in range(5):
        statement = (
            insert(Booking).values(**values, booking_reference=_reference())
            .on_conflict_do_nothing(index_elements=[Booking.booking_reference]).returning(Booking.id)
        )
        if db.scalar(statement) is not None:
            return
    raise AppError(503, "booking_reference_unavailable", "A booking reference could not be issued. Please retry.")


def _pricing_snapshot(
    db: Session, booking_id: UUID, service_id: UUID, quantity: int | None, now: datetime,
) -> BookingPricingSnapshot:
    price = find_applicable_price(db, service_id, now)
    if price is None:
        return BookingPricingSnapshot(booking_id=booking_id, panel_quantity=quantity, currency="INR")

    estimate = None
    if price.pricing_type == "fixed":
        estimate = price.base_price
    elif price.pricing_type == "per_panel":
        if quantity is None:
            raise AppError(422, "panel_quantity_required", "Enter the number of panels for this service.")
        estimate = price.price_per_panel * quantity

    if estimate is not None and price.minimum_charge is not None:
        estimate = max(estimate, price.minimum_charge)
    return BookingPricingSnapshot(
        booking_id=booking_id, price_configuration_id=price.id, pricing_type=price.pricing_type,
        base_price=price.base_price, price_per_panel=price.price_per_panel,
        minimum_charge=price.minimum_charge, panel_quantity=quantity, currency=price.currency,
        estimated_amount=estimate.quantize(Decimal("0.01")) if estimate is not None else None,
    )


def _address_snapshot(booking_id: UUID, address: AddressInput) -> BookingAddress:
    return BookingAddress(
        booking_id=booking_id, **address.model_dump(),
        google_maps_url=google_maps_url(address.latitude, address.longitude),
    )


def create_booking(
    db: Session, context: CustomerContext, data: BookingCreate, idempotency_key: str | None,
) -> tuple[BookingDetails, bool]:
    key_hash = sha256(idempotency_key.encode("ascii")).hexdigest() if idempotency_key else None
    request_hash, previous_hash = data.idempotency_hashes() if key_hash else (None, None)

    with db.begin():
        # Serialize customer writes, including idempotency lookups, and recheck the live session.
        customer, _, _ = lock_authenticated_session(db, context)
        if key_hash:
            existing = db.execute(select(Booking.id, Booking.request_hash).where(
                Booking.customer_id == customer.id, Booking.idempotency_key_hash == key_hash,
            )).one_or_none()
            if existing is not None:
                if existing.request_hash not in {request_hash, previous_hash}:
                    raise AppError(409, "idempotency_conflict", "This idempotency key was used for a different booking request.")
                return booking_details(owned_details(db, customer.id, existing.id)), False

        address = data.address
        if data.saved_address_id is not None:
            address = resolve_saved_address(db, customer.id, data.saved_address_id, data.address_overrides)
        if address is None:
            raise AppError(422, "invalid_address", "A booking address is required.")
        service = require_active_service(db, data.service_id, lock=True)
        availability = evaluate_service_date(db, data.service_date, address, service_active=True)
        if availability.reason == "past_date":
            raise AppError(422, "invalid_service_date", availability.message)
        if availability.reason in {"closure", "closed"}:
            raise AppError(409, "service_date_unavailable", availability.message)

        now = utc_now()
        booking_id = uuid4()
        pricing = _pricing_snapshot(db, booking_id, service.id, data.pricing.panel_quantity, now)
        _insert_booking(db, {
            "id": booking_id, "customer_id": customer.id, "service_id": service.id,
            "status": BookingStatus.PENDING, "status_version": 0, "service_date": data.service_date,
            "customer_name_snapshot": customer.full_name, "customer_phone_snapshot": customer.phone_number,
            "alternate_phone_snapshot": customer.alternate_phone_number, "service_name_snapshot": service.name,
            "customer_instructions": data.customer_instructions, "coverage_matched": availability.coverage.covered,
            "idempotency_key_hash": key_hash, "request_hash": request_hash, "created_at": now, "updated_at": now,
        })
        db.add_all([
            _address_snapshot(booking_id, address),
            pricing,
            BookingStatusHistory(
                booking_id=booking_id, sequence=0, old_status=None, new_status=BookingStatus.PENDING,
                changed_by_type="customer", changed_by_id=customer.id, created_at=now,
            ),
        ])
        db.flush()
        return booking_details(owned_details(db, customer.id, booking_id)), True


def list_customer_bookings(db: Session, context: CustomerContext, query: BookingListQuery) -> CustomerBookingPage:
    page = page_bookings(db, query, customer_id=context.customer_id)
    counts = status_counts(db, Booking.customer_id == context.customer_id) if query.page == 1 else None
    return CustomerBookingPage(items=page.items, total=page.total, page=page.page, page_size=page.page_size, status_counts=counts)


def read_customer_booking(db: Session, context: CustomerContext, booking_id: UUID) -> BookingDetails:
    return booking_details(owned_details(db, context.customer_id, booking_id))


def cancel_customer_booking(
    db: Session, context: CustomerContext, booking_id: UUID, data: BookingCancellation,
) -> BookingCancellationResponse:
    with db.begin():
        lock_authenticated_session(db, context)
        booking = lock_booking(db, booking_id, customer_id=context.customer_id)
        if booking.status not in CUSTOMER_CANCELLABLE_STATUSES:
            raise AppError(409, "booking_not_cancellable", "This booking cannot be cancelled.")
        transition_locked_booking(
            db, booking, BookingStatus.CANCELLED, utc_now(), actor_type="customer",
            actor_id=context.customer_id, reason=data.reason, public_cancellation_reason=data.reason,
        )
        db.flush()
        return BookingCancellationResponse.model_validate(
            booking_details(owned_details(db, context.customer_id, booking.id)).model_dump()
        )
