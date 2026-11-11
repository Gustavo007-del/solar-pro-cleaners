from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import DatabaseSession
from app.api.rate_limits import RATE_LIMITED, rate_limit
from app.modules.admins.dependencies import require_permission
from app.modules.admins.permissions import Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.sessions import AdminContext
from app.modules.bookings.admin_notes import create_note, delete_note, list_notes, update_note
from app.modules.bookings.admin_schemas import (
    AdminBookingCard, AdminBookingDetails, AdminBookingQuery, AdminBookingStatusUpdate,
    BookingAdminNoteInput, BookingAdminNoteResponse,
)
from app.modules.bookings.admin_service import change_booking_status, list_admin_bookings, read_admin_booking
from app.modules.bookings.schemas import BookingCancellation
from app.modules.bookings.status import BookingStatus
from app.schemas.catalogue import PublicPageQuery
from app.schemas.common import AdminPage, ErrorResponse

router = APIRouter(
    prefix="/admin/bookings", tags=["admin bookings"], dependencies=[Depends(prevent_caching)],
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
BookingReader = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_READ))]
BookingEditor = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_UPDATE))]
BookingCanceller = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_CANCEL))]
NoteReader = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_NOTES_READ))]
NoteCreator = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_NOTES_CREATE))]
NoteEditor = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_NOTES_UPDATE))]
NoteDeleter = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_NOTES_DELETE))]
conflict = {409: {"model": ErrorResponse, "description": "The requested booking transition is unavailable."}}


@router.get("", summary="Search all bookings")
def bookings(db: DatabaseSession, admin: BookingReader, query: Annotated[AdminBookingQuery, Query()]) -> AdminPage[AdminBookingCard]:
    return list_admin_bookings(db, query)


@router.get("/{booking_id}", summary="Read booking details and administrative history")
def booking(booking_id: UUID, db: DatabaseSession, admin: BookingReader) -> AdminBookingDetails:
    return read_admin_booking(db, booking_id, show_private_notes=Permission.BOOKINGS_NOTES_READ in admin.profile.permissions)


@router.patch("/{booking_id}/status", summary="Apply a permitted booking status transition", responses=conflict)
def status(booking_id: UUID, data: AdminBookingStatusUpdate, db: DatabaseSession, admin: BookingEditor) -> AdminBookingDetails:
    return change_booking_status(db, admin, booking_id, data.status, reason=data.reason)


@router.post("/{booking_id}/cancel", summary="Cancel a booking through the admin workflow",
             dependencies=[rate_limit("admin_booking_cancel")], responses={**conflict, **RATE_LIMITED})
def cancel(
    booking_id: UUID, db: DatabaseSession, admin: BookingCanceller, data: BookingCancellation | None = None,
) -> AdminBookingDetails:
    return change_booking_status(
        db, admin, booking_id, BookingStatus.CANCELLED, reason=data.reason if data else None,
    )


@router.get("/{booking_id}/notes", summary="List private booking notes")
def notes(
    booking_id: UUID, db: DatabaseSession, admin: NoteReader, query: Annotated[PublicPageQuery, Query()],
) -> AdminPage[BookingAdminNoteResponse]:
    return list_notes(db, booking_id, query)


@router.post("/{booking_id}/notes", status_code=201, summary="Add a private booking note")
def new_note(
    booking_id: UUID, data: BookingAdminNoteInput, db: DatabaseSession, admin: NoteCreator,
) -> BookingAdminNoteResponse:
    return create_note(db, admin, booking_id, data.note)


@router.patch("/{booking_id}/notes/{note_id}", summary="Edit a private booking note")
def edit_note(
    booking_id: UUID, note_id: UUID, data: BookingAdminNoteInput, db: DatabaseSession, admin: NoteEditor,
) -> BookingAdminNoteResponse:
    return update_note(db, admin, booking_id, note_id, data.note)


@router.delete("/{booking_id}/notes/{note_id}", status_code=204, summary="Delete a private booking note")
def remove_note(booking_id: UUID, note_id: UUID, db: DatabaseSession, admin: NoteDeleter) -> Response:
    delete_note(db, admin, booking_id, note_id)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
