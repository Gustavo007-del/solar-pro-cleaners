from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.permissions import AdminRole, Permission
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.bookings.admin_schemas import BookingAdminNoteResponse
from app.modules.bookings.models import Booking, BookingAdminNote
from app.modules.bookings.repository import lock_booking, not_found
from app.schemas.common import AdminPage, PaginationParams


def list_notes(db: Session, booking_id: UUID, query: PaginationParams) -> AdminPage[BookingAdminNoteResponse]:
    if db.scalar(select(Booking.id).where(Booking.id == booking_id)) is None:
        raise not_found()
    where = BookingAdminNote.booking_id == booking_id
    total = db.scalar(select(func.count()).select_from(BookingAdminNote).where(where)) or 0
    rows = db.scalars(
        select(BookingAdminNote).where(where).order_by(BookingAdminNote.created_at.desc(), BookingAdminNote.id.desc())
        .offset(query.offset).limit(query.page_size)
    )
    return AdminPage[BookingAdminNoteResponse](
        items=[BookingAdminNoteResponse.model_validate(row) for row in rows],
        page=query.page, page_size=query.page_size, total=total,
    )


def _locked_note(db: Session, booking_id: UUID, note_id: UUID) -> BookingAdminNote:
    row = db.scalar(select(BookingAdminNote).where(
        BookingAdminNote.booking_id == booking_id, BookingAdminNote.id == note_id,
    ).with_for_update())
    if row is None:
        raise AppError(404, "booking_note_not_found", "The requested booking note was not found.")
    return row


def create_note(db: Session, context: AdminContext, booking_id: UUID, note: str) -> BookingAdminNoteResponse:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.BOOKINGS_NOTES_CREATE)
        lock_booking(db, booking_id, customer_id=None)
        row = BookingAdminNote(booking_id=booking_id, admin_id=actor.id, note=note)
        db.add(row)
        db.flush()
        record_audit(db, "booking_note_created", actor_id=actor.id, resource_id=row.id, resource_type="booking_admin_note")
        return BookingAdminNoteResponse.model_validate(row)


def update_note(
    db: Session, context: AdminContext, booking_id: UUID, note_id: UUID, note: str,
) -> BookingAdminNoteResponse:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.BOOKINGS_NOTES_UPDATE)
        row = _locked_note(db, booking_id, note_id)
        if actor.role != AdminRole.OWNER and row.admin_id != actor.id:
            raise AppError(403, "admin_permission_denied", "Only the author or owner can edit this note.")
        if row.note != note:
            row.note = note
            record_audit(db, "booking_note_updated", actor_id=actor.id, resource_id=row.id, resource_type="booking_admin_note")
        db.flush()
        return BookingAdminNoteResponse.model_validate(row)


def delete_note(db: Session, context: AdminContext, booking_id: UUID, note_id: UUID) -> None:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.BOOKINGS_NOTES_DELETE)
        row = _locked_note(db, booking_id, note_id)
        record_audit(db, "booking_note_deleted", actor_id=actor.id, resource_id=row.id, resource_type="booking_admin_note")
        db.delete(row)
