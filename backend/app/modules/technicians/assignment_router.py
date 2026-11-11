from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import DatabaseSession
from app.modules.admins.dependencies import require_permission
from app.modules.admins.permissions import Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.sessions import AdminContext
from app.modules.bookings.models import Booking
from app.modules.bookings.repository import not_found
from app.modules.technicians.assignments import assign_booking, reassign_booking, unassign_booking
from app.modules.technicians.repository import assignment_page
from app.modules.technicians.schemas import AssignInput, AssignmentQuery, AssignmentRecord, ReassignInput, UnassignInput
from app.schemas.common import AdminPage, ErrorResponse

router = APIRouter(
    prefix="/admin/bookings", tags=["admin assignments"], dependencies=[Depends(prevent_caching)],
    responses={
        401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
Assigner = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_ASSIGN))]
Reassigner = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_REASSIGN))]
Unassigner = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_UNASSIGN))]
Reader = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIAN_ASSIGNMENTS_READ))]


@router.post("/{booking_id}/assign", status_code=201, summary="Assign an eligible technician")
def assign(booking_id: UUID, data: AssignInput, db: DatabaseSession, admin: Assigner) -> AssignmentRecord:
    return assign_booking(db, admin, booking_id, data)


@router.post("/{booking_id}/reassign", status_code=201, summary="Replace a technician while preserving assignment history")
def reassign(booking_id: UUID, data: ReassignInput, db: DatabaseSession, admin: Reassigner) -> AssignmentRecord:
    return reassign_booking(db, admin, booking_id, data)


@router.post("/{booking_id}/unassign", summary="End a booking assignment")
def unassign(
    booking_id: UUID, db: DatabaseSession, admin: Unassigner, data: UnassignInput | None = None,
) -> AssignmentRecord:
    return unassign_booking(db, admin, booking_id, data or UnassignInput())


@router.get("/{booking_id}/assignments", summary="List the complete assignment history for a booking")
def assignments(
    booking_id: UUID, db: DatabaseSession, admin: Reader, query: Annotated[AssignmentQuery, Query()],
) -> AdminPage[AssignmentRecord]:
    if db.get(Booking, booking_id) is None:
        raise not_found()
    return assignment_page(db, query, booking_id=booking_id)
