from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status

from app.api.rate_limits import RATE_LIMITED, rate_limit
from app.api.dependencies import DatabaseSession
from app.modules.bookings.schemas import (
    BookingCancellation, BookingCancellationResponse, BookingCreate, BookingDetails, BookingListItem, BookingListQuery,
)
from app.modules.bookings.service import cancel_customer_booking, create_booking, list_customer_bookings, read_customer_booking
from app.modules.customers.dependencies import AuthenticatedCustomer
from app.schemas.common import ErrorResponse, Page

router = APIRouter(
    prefix="/bookings", tags=["bookings"],
    responses={401: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
not_found = {404: {"model": ErrorResponse, "description": "The requested booking or service is unavailable."}}
conflict = {409: {"model": ErrorResponse, "description": "The request conflicts with the current booking or configuration."}}
IdempotencyKey = Annotated[
    str | None, Header(alias="Idempotency-Key", pattern=r"^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$", max_length=128),
]


@router.post(
    "", status_code=status.HTTP_201_CREATED, summary="Submit a pending booking request",
    dependencies=[rate_limit("booking_create")],
    responses={**RATE_LIMITED, 200: {"model": BookingDetails, "description": "Existing booking returned for an identical retry."}, **not_found, **conflict},
)
def create(
    data: BookingCreate, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response,
    idempotency_key: IdempotencyKey = None,
) -> BookingDetails:
    booking, created = create_booking(db, customer, data, idempotency_key)
    if not created:
        response.status_code = status.HTTP_200_OK
    response.headers["Cache-Control"] = "no-store"
    return booking


@router.get("/my", summary="List bookings owned by the authenticated customer")
def my_bookings(
    db: DatabaseSession, customer: AuthenticatedCustomer, query: Annotated[BookingListQuery, Query()], response: Response,
) -> Page[BookingListItem]:
    response.headers["Cache-Control"] = "no-store"
    return list_customer_bookings(db, customer, query)


@router.get("/{booking_id}", summary="Read an owned booking and its progress", responses=not_found)
def details(booking_id: UUID, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response) -> BookingDetails:
    response.headers["Cache-Control"] = "no-store"
    return read_customer_booking(db, customer, booking_id)


@router.post(
    "/{booking_id}/cancel", summary="Cancel an owned pending booking",
    dependencies=[rate_limit("booking_cancel")], responses={**not_found, **conflict, **RATE_LIMITED},
)
def cancel(
    booking_id: UUID, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response,
    data: BookingCancellation | None = None,
) -> BookingCancellationResponse:
    response.headers["Cache-Control"] = "no-store"
    return cancel_customer_booking(db, customer, booking_id, data or BookingCancellation())
