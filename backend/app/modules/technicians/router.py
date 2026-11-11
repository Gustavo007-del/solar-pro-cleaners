from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import DatabaseSession
from app.modules.admins.dependencies import require_permission
from app.modules.admins.permissions import Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.sessions import AdminContext
from app.modules.technicians.availability import list_availability, put_availability
from app.modules.technicians.leave import delete_leave, list_leave, save_leave
from app.modules.technicians.repository import assignment_page, get_technician
from app.modules.technicians.schemas import (
    AssignmentQuery, AssignmentRecord, AvailabilityInput, AvailabilityPage, AvailabilityRecord,
    DateQuery, DeactivateTechnician, LeaveInput, LeaveRecord, LeaveUpdate, TechnicianCard,
    TechnicianCreate, TechnicianDetails, TechnicianQuery, TechnicianResponse, TechnicianUpdate,
    TechnicianWorkload, WorkloadQuery,
)
from app.modules.technicians.service import (
    activate_technician, create_technician, deactivate_technician, list_technicians,
    technician_details, technician_workload, update_technician,
)
from app.schemas.catalogue import PublicPageQuery
from app.schemas.common import AdminPage, ErrorResponse

router = APIRouter(
    prefix="/admin/technicians", tags=["admin technicians"], dependencies=[Depends(prevent_caching)],
    responses={
        401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
Reader = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIANS_READ))]
Creator = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIANS_CREATE))]
Editor = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIANS_UPDATE))]
Activator = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIANS_ACTIVATE))]
Deactivator = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIANS_DEACTIVATE))]
AvailabilityReader = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIAN_AVAILABILITY_READ))]
AvailabilityEditor = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIAN_AVAILABILITY_MANAGE))]
LeaveManager = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIAN_LEAVE_MANAGE))]
AssignmentReader = Annotated[AdminContext, Depends(require_permission(Permission.TECHNICIAN_ASSIGNMENTS_READ))]


@router.post("", status_code=201, summary="Create a technician profile")
def create(data: TechnicianCreate, db: DatabaseSession, admin: Creator) -> TechnicianResponse:
    return create_technician(db, admin, data)


@router.get("", summary="List technicians and assignment counts")
def technicians(db: DatabaseSession, admin: Reader, query: Annotated[TechnicianQuery, Query()]) -> AdminPage[TechnicianCard]:
    return list_technicians(db, query)


@router.get("/workload", summary="Read technician workloads and current availability")
def workload(
    db: DatabaseSession, admin: AssignmentReader, availability_admin: AvailabilityReader,
    query: Annotated[WorkloadQuery, Query()],
) -> AdminPage[TechnicianWorkload]:
    return technician_workload(db, query)


@router.get("/{technician_id}", summary="Read a technician profile, availability and work")
def details(
    technician_id: UUID, db: DatabaseSession, admin: Reader, assignments_admin: AssignmentReader,
    availability_admin: AvailabilityReader, query: Annotated[PublicPageQuery, Query()],
) -> TechnicianDetails:
    return technician_details(db, technician_id, query)


@router.patch("/{technician_id}", summary="Update technician information")
def edit(technician_id: UUID, data: TechnicianUpdate, db: DatabaseSession, admin: Editor) -> TechnicianResponse:
    return update_technician(db, admin, technician_id, data)


@router.post("/{technician_id}/deactivate", summary="Deactivate a technician with explicit assignment handling")
def deactivate(
    technician_id: UUID, db: DatabaseSession, admin: Deactivator, data: DeactivateTechnician | None = None,
) -> TechnicianResponse:
    return deactivate_technician(db, admin, technician_id, data or DeactivateTechnician())


@router.post("/{technician_id}/activate", summary="Reactivate a technician")
def activate(technician_id: UUID, db: DatabaseSession, admin: Activator) -> TechnicianResponse:
    return activate_technician(db, admin, technician_id)


@router.get("/{technician_id}/availability", summary="List date overrides and recurring working schedules")
def availability(
    technician_id: UUID, db: DatabaseSession, admin: AvailabilityReader, query: Annotated[DateQuery, Query()],
) -> AvailabilityPage:
    return list_availability(db, technician_id, query)


@router.put("/{technician_id}/availability", summary="Set a dated or weekly availability record")
def set_availability(
    technician_id: UUID, data: AvailabilityInput, db: DatabaseSession, admin: AvailabilityEditor,
) -> AvailabilityRecord:
    return put_availability(db, admin, technician_id, data)


@router.get("/{technician_id}/leave", summary="List technician leave records")
def leave(
    technician_id: UUID, db: DatabaseSession, admin: LeaveManager, query: Annotated[DateQuery, Query()],
) -> AdminPage[LeaveRecord]:
    return list_leave(db, technician_id, query)


@router.post("/{technician_id}/leave", status_code=201, summary="Create technician leave")
def create_leave(technician_id: UUID, data: LeaveInput, db: DatabaseSession, admin: LeaveManager) -> LeaveRecord:
    return save_leave(db, admin, technician_id, data)


@router.patch("/{technician_id}/leave/{leave_id}", summary="Update technician leave")
def edit_leave(
    technician_id: UUID, leave_id: UUID, data: LeaveUpdate, db: DatabaseSession, admin: LeaveManager,
) -> LeaveRecord:
    return save_leave(db, admin, technician_id, data, leave_id=leave_id)


@router.delete("/{technician_id}/leave/{leave_id}", status_code=204, summary="Remove a technician leave record")
def remove_leave(technician_id: UUID, leave_id: UUID, db: DatabaseSession, admin: LeaveManager) -> Response:
    delete_leave(db, admin, technician_id, leave_id)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get("/{technician_id}/assignments", summary="List a technician's assignment history")
def assignments(
    technician_id: UUID, db: DatabaseSession, admin: AssignmentReader, query: Annotated[AssignmentQuery, Query()],
) -> AdminPage[AssignmentRecord]:
    get_technician(db, technician_id)
    return assignment_page(db, query, technician_id=technician_id)
