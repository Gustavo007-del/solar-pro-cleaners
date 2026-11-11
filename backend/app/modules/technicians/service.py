from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.permissions import AdminRole, Permission, enforce_permission
from app.modules.admins.reporting_dates import business_zone
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.customers.credentials import utc_now
from app.modules.technicians.availability import effective_availability
from app.modules.technicians.models import Technician
from app.modules.technicians.repository import active_assignments, assignment_page, get_technician, technician_page, workload_counts
from app.modules.technicians.schemas import (
    AssignmentQuery, DeactivateTechnician, TechnicianCard, TechnicianCreate, TechnicianDetails, TechnicianQuery,
    TechnicianResponse, TechnicianUpdate, TechnicianWorkload, WorkloadCounts, WorkloadQuery,
)
from app.modules.technicians.status import EmploymentStatus
from app.schemas.common import AdminPage, PaginationParams


def _handle_conflict(exc: IntegrityError) -> None:
    constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    if constraint == "uq_technicians_primary_phone":
        raise AppError(409, "technician_phone_conflict", "A technician already uses this primary phone number.") from None
    if constraint == "uq_technicians_email":
        raise AppError(409, "technician_email_conflict", "A technician already uses this email.") from None
    raise exc


def create_technician(db: Session, context: AdminContext, data: TechnicianCreate) -> TechnicianResponse:
    try:
        with db.begin():
            actor = lock_authorized_admin(db, context, Permission.TECHNICIANS_CREATE)
            row = Technician(
                **data.model_dump(), is_active=data.employment_status in (EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE),
            )
            db.add(row)
            db.flush()
            record_audit(db, "technician_created", actor_id=actor.id, resource_id=row.id, resource_type="technician")
            return TechnicianResponse.model_validate(row)
    except IntegrityError as exc:
        _handle_conflict(exc)


def update_technician(db: Session, context: AdminContext, technician_id: UUID, data: TechnicianUpdate) -> TechnicianResponse:
    try:
        with db.begin():
            actor = lock_authorized_admin(db, context, Permission.TECHNICIANS_UPDATE)
            row = get_technician(db, technician_id, lock=True)
            changes = data.model_dump(exclude_unset=True)
            target = changes.get("employment_status")
            if target is not None and target != row.employment_status:
                if row.employment_status == EmploymentStatus.TERMINATED:
                    raise AppError(409, "technician_terminated", "A terminated employment record cannot be reactivated.")
                if not row.is_active and target in (EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE):
                    raise AppError(409, "technician_inactive", "Reactivate the technician before changing to this employment status.")
                if target in (EmploymentStatus.INACTIVE, EmploymentStatus.TERMINATED):
                    enforce_permission(AdminRole(actor.role), Permission.TECHNICIANS_DEACTIVATE)
                if target != EmploymentStatus.ACTIVE and active_assignments(db, row.id):
                    raise AppError(409, "technician_active_assignments", "Resolve active assignments before changing employment status.")
                if target in (EmploymentStatus.INACTIVE, EmploymentStatus.TERMINATED):
                    row.is_active = False
                    record_audit(db, "technician_deactivated", actor_id=actor.id, resource_id=row.id, resource_type="technician")
            changed = {key: value for key, value in changes.items() if getattr(row, key) != value}
            for name, value in changed.items():
                setattr(row, name, value)
            if changed:
                record_audit(db, "technician_updated", actor_id=actor.id, resource_id=row.id, resource_type="technician")
            db.flush()
            return TechnicianResponse.model_validate(row)
    except IntegrityError as exc:
        _handle_conflict(exc)


def deactivate_technician(
    db: Session, context: AdminContext, technician_id: UUID, data: DeactivateTechnician,
) -> TechnicianResponse:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.TECHNICIANS_DEACTIVATE)
        row = get_technician(db, technician_id, lock=True)
        if row.is_active:
            outstanding = active_assignments(db, row.id)
            if outstanding and (not data.retain_active_assignments or not data.reason):
                raise AppError(
                    409, "technician_active_assignments",
                    "Resolve active assignments or explicitly retain them with a reason.",
                )
            row.is_active = False
            row.employment_status = EmploymentStatus.INACTIVE
            row.deactivation_reason = data.reason
            record_audit(
                db, "technician_deactivated", actor_id=actor.id, resource_id=row.id, resource_type="technician",
                retained_assignments=bool(outstanding),
            )
        db.flush()
        return TechnicianResponse.model_validate(row)


def activate_technician(db: Session, context: AdminContext, technician_id: UUID) -> TechnicianResponse:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.TECHNICIANS_ACTIVATE)
        row = get_technician(db, technician_id, lock=True)
        if row.employment_status == EmploymentStatus.TERMINATED:
            raise AppError(409, "technician_terminated", "A terminated employment record cannot be reactivated.")
        if not row.is_active:
            row.is_active = True
            row.employment_status = EmploymentStatus.ACTIVE
            row.availability_reset_at = utc_now()
            record_audit(db, "technician_activated", actor_id=actor.id, resource_id=row.id, resource_type="technician")
        db.flush()
        return TechnicianResponse.model_validate(row)


def list_technicians(db: Session, query: TechnicianQuery) -> AdminPage[TechnicianCard]:
    rows, total = technician_page(db, query)
    counts = workload_counts(db, [row.id for row in rows])
    return AdminPage[TechnicianCard](
        items=[
            TechnicianCard.model_validate({
                **{key: getattr(row, key) for key in TechnicianCard.model_fields if key not in WorkloadCounts.model_fields},
                **counts.get(row.id, WorkloadCounts()).model_dump(exclude={"rejected_assignments", "cancelled_assignments"}),
            })
            for row in rows
        ],
        page=query.page, page_size=query.page_size, total=total,
    )


def technician_details(db: Session, technician_id: UUID, query: PaginationParams) -> TechnicianDetails:
    row = get_technician(db, technician_id)
    zone = business_zone(db)
    now = utc_now().astimezone(zone)
    return TechnicianDetails(
        **TechnicianResponse.model_validate(row).model_dump(),
        workload=workload_counts(db, [row.id]).get(row.id, WorkloadCounts()),
        availability=effective_availability(db, [row], now.date(), zone.key, local_time=now.time())[row.id],
        active_assignments=assignment_page(
            db, AssignmentQuery(page=query.page, page_size=query.page_size), technician_id=row.id, active_only=True,
        ),
        recent_assignments=assignment_page(db, AssignmentQuery(page_size=5), technician_id=row.id).items,
    )


def technician_workload(db: Session, query: WorkloadQuery) -> AdminPage[TechnicianWorkload]:
    rows, total = technician_page(db, query)
    zone = business_zone(db)
    now = utc_now().astimezone(zone)
    availability = effective_availability(db, rows, now.date(), zone.key, local_time=now.time())
    counts = workload_counts(db, [row.id for row in rows], query.date_from, query.date_to)
    return AdminPage[TechnicianWorkload](
        items=[
            TechnicianWorkload(
                id=row.id, full_name=row.full_name, employment_status=row.employment_status,
                is_active=row.is_active, availability=availability[row.id],
                workload=counts.get(row.id, WorkloadCounts()),
            )
            for row in rows
        ],
        page=query.page, page_size=query.page_size, total=total,
    )
