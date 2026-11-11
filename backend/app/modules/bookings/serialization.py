from app.modules.bookings.models import Booking
from app.modules.bookings.schemas import (
    BookingAddressResponse, BookingCustomerSnapshot, BookingDetails, BookingHistoryItem,
    BookingListItem, BookingPricingResponse,
)
from app.modules.bookings.status import STATUS_LABELS


def booking_card(booking: Booking) -> BookingListItem:
    address = booking.address
    parts = list(dict.fromkeys(part for part in (address.locality, address.city, address.postal_code) if part))
    summary = ", ".join(parts) or address.address_line
    if len(summary) > 180:
        summary = summary[:177].rstrip() + "..."
    return BookingListItem(
        id=booking.id, booking_reference=booking.booking_reference,
        service_id=booking.service_id, service_name=booking.service_name_snapshot, service_date=booking.service_date,
        status=booking.status, status_label=STATUS_LABELS[booking.status],
        estimated_amount=booking.pricing.estimated_amount, currency=booking.pricing.currency,
        created_at=booking.created_at, address_summary=summary,
    )


def booking_details(booking: Booking) -> BookingDetails:
    return BookingDetails(
        **booking_card(booking).model_dump(),
        customer=BookingCustomerSnapshot(
            full_name=booking.customer_name_snapshot, phone_number=booking.customer_phone_snapshot,
            alternate_phone_number=booking.alternate_phone_snapshot,
        ),
        address=BookingAddressResponse.model_validate(booking.address),
        pricing=BookingPricingResponse.model_validate(booking.pricing),
        customer_instructions=booking.customer_instructions, coverage_matched=booking.coverage_matched,
        updated_at=booking.updated_at, confirmed_at=booking.confirmed_at, assigned_at=booking.assigned_at,
        started_at=booking.started_at, completed_at=booking.completed_at, cancelled_at=booking.cancelled_at,
        cancellation_reason=booking.cancellation_reason,
        history=[
            BookingHistoryItem(
                old_status=entry.old_status, new_status=entry.new_status,
                status_label=STATUS_LABELS[entry.new_status], created_at=entry.created_at,
            )
            for entry in booking.history
        ],
    )
