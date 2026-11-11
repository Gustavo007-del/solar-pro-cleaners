from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import DatabaseSession
from app.modules.admins.dependencies import AdminRoute, require_permission
from app.modules.admins.permissions import Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.sessions import AdminContext
from app.modules.bookings.models import Booking
from app.modules.bookings.repository import not_found
from app.modules.technicians.assignments import assign_booking, assignment_candidates, reassign_booking, unassign_booking
from app.modules.technicians.repository import assignment_page
from app.modules.technicians.schemas import (
    AssignInput, AssignmentQuery, AssignmentRecord, EligibleTechnicianQuery, EligibleTechniciansPage, ReassignInput, UnassignInput,
)
from app.schemas.common import AdminPage, ErrorResponse

router = APIRouter(
    route_class=AdminRoute,
    prefix="/admin/bookings", tags=["Booking Assignments"], dependencies=[Depends(prevent_caching)],
    responses={
        401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
Assigner = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_ASSIGN, Permission.TECHNICIAN_ASSIGNMENTS_MANAGE))]
Reassigner = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_REASSIGN, Permission.TECHNICIAN_ASSIGNMENTS_MANAGE))]
Unassigner = Annotated[AdminContext, Depends(require_permission(Permission.BOOKINGS_UNASSIGN, Permission.TECHNICIAN_ASSIGNMENTS_MANAGE))]
Reader = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIAN_ASSIGNMENTS_READ))]


AssignmentManager = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIAN_ASSIGNMENTS_MANAGE))]


@router.get(
    "/{booking_id}/eligible-technicians",
    summary="List eligible technicians for a booking",
    description=(
        "Requires bookings.assign in assign mode or bookings.reassign in reassign mode, in addition to "
        "assignment management. Results are advisory. The assignment write rechecks eligibility."
    ),
    responses={200: {"content": {"application/json": {"example": {
        "items": [{"id": "00000000-0000-4000-8000-000000000001", "full_name": "Example Technician",
                   "city": "Kochi", "start_time": "09:00:00", "end_time": "17:00:00"}],
        "page": 1, "page_size": 20, "total": 1, "total_pages": 1, "has_next": False, "has_previous": False,
        "service_date": "2030-06-20", "timezone": "Asia/Kolkata", "requires_in_progress_override": False,
    }}}}},
)
def eligible(
    booking_id: UUID, db: DatabaseSession, admin: AssignmentManager,
    query: Annotated[EligibleTechnicianQuery, Query()],
) -> EligibleTechniciansPage:
    return assignment_candidates(db, admin, booking_id, query)


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
