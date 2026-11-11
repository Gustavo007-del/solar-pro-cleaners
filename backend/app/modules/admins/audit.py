from typing import Literal
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.request_id import request_id_context
from app.modules.admins.models import AdminAuditLog
from app.modules.admins.permissions import AdminRole
from app.modules.bookings.status import BookingStatus

AuditAction = Literal[
    "login_succeeded", "login_failed", "refresh_replay", "logout", "logout_all", "password_changed",
    "owner_provisioned", "user_created", "user_updated", "role_changed", "account_activated", "account_deactivated",
    "booking_status_changed", "booking_cancelled", "booking_note_created", "booking_note_updated",
    "booking_note_deleted", "customer_updated", "customer_activated", "customer_deactivated",
    "technician_created", "technician_updated", "technician_activated", "technician_deactivated",
    "technician_availability_changed", "technician_leave_created", "technician_leave_updated",
    "technician_leave_deleted", "booking_assigned", "booking_reassigned", "booking_unassigned",
]
AccountReason = Literal["customer_request", "account_review", "policy", "other"]
CustomerField = Literal["full_name", "phone_number", "alternate_phone_number"]


def record_audit(
    db: Session, action: AuditAction, *, actor_id: UUID | None = None,
    resource_id: UUID | None = None, resource_type: str = "admin_user",
    previous_role: AdminRole | None = None, new_role: AdminRole | None = None,
    previous_status: BookingStatus | None = None, new_status: BookingStatus | None = None,
    customer_fields: tuple[CustomerField, ...] = (), account_reason: AccountReason | None = None,
    retained_assignments: bool | None = None,
) -> None:
    details = {}
    if previous_role is not None:
        details["previous_role"] = previous_role.value
    if new_role is not None:
        details["new_role"] = new_role.value
    if previous_status is not None and new_status is not None:
        details["previous_status"] = previous_status.value
        details["new_status"] = new_status.value
    if customer_fields:
        details["changed_fields"] = list(customer_fields)
    if account_reason is not None:
        details["reason_code"] = account_reason
    if retained_assignments is not None:
        details["retained_assignments"] = retained_assignments
    db.add(AdminAuditLog(
        actor_admin_id=actor_id, action=action, resource_type=resource_type, resource_id=resource_id,
        details=details, request_id=request_id_context.get(),
    ))
