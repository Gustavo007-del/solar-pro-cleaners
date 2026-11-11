from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.models import AdminUser
from app.modules.admins.passwords import hash_password, validate_password
from app.modules.admins.permissions import AdminRole, Permission, enforce_permission
from app.modules.admins.schemas import AdminProfile, AdminUserCreate, AdminUserQuery, AdminUserResponse, AdminUserUpdate
from app.modules.admins.sessions import AdminContext, admin_profile, lock_authenticated_admin, lock_user, revoke_sessions
from app.modules.customers.credentials import utc_now
from app.schemas.common import AdminPage


def _not_found() -> AppError:
    return AppError(404, "admin_user_not_found", "The requested administrative account was not found.")


def _handle_integrity(error: IntegrityError) -> None:
    if getattr(getattr(error.orig, "diag", None), "constraint_name", None) == "uq_admin_users_email":
        raise AppError(409, "admin_email_conflict", "An administrative account already uses this email.") from None
    raise error


def read_user(db: Session, admin_id: UUID) -> AdminUserResponse:
    user = db.get(AdminUser, admin_id)
    if user is None:
        raise _not_found()
    return AdminUserResponse.model_validate(user)


def list_users(db: Session, query: AdminUserQuery) -> AdminPage[AdminUserResponse]:
    conditions = []
    if query.role is not None:
        conditions.append(AdminUser.role == query.role.value)
    if query.is_active is not None:
        conditions.append(AdminUser.is_active == query.is_active)
    if query.search:
        conditions.append(or_(
            AdminUser.full_name.icontains(query.search, autoescape=True),
            AdminUser.email.icontains(query.search, autoescape=True),
        ))
    total = db.scalar(select(func.count()).select_from(AdminUser).where(*conditions)) or 0
    rows = db.scalars(
        select(AdminUser).where(*conditions).order_by(AdminUser.created_at.desc(), AdminUser.id.desc())
        .offset(query.offset).limit(query.page_size)
    )
    return AdminPage[AdminUserResponse](
        items=[AdminUserResponse.model_validate(row) for row in rows],
        page=query.page, page_size=query.page_size, total=total,
    )


def update_self(db: Session, context: AdminContext, full_name: str) -> AdminProfile:
    with db.begin():
        user, _ = lock_authenticated_admin(db, context)
        if user.full_name != full_name:
            user.full_name = full_name
            record_audit(db, "user_updated", actor_id=user.id, resource_id=user.id)
        db.flush()
        return admin_profile(user)


def create_user(db: Session, settings: Settings, context: AdminContext, data: AdminUserCreate) -> AdminUserResponse:
    validate_password(data.password, settings, email=data.email)
    password_hash = hash_password(data.password)
    try:
        with db.begin():
            actor, _ = lock_authenticated_admin(db, context)
            enforce_permission(AdminRole(actor.role), Permission.USERS_CREATE)
            user = AdminUser(full_name=data.full_name, email=data.email, role=data.role, password_hash=password_hash)
            db.add(user)
            db.flush()
            record_audit(db, "user_created", actor_id=actor.id, resource_id=user.id, new_role=AdminRole(user.role))
            return AdminUserResponse.model_validate(user)
    except IntegrityError as exc:
        _handle_integrity(exc)


def _update_locked_user(
    db: Session, context: AdminContext, admin_id: UUID, data: AdminUserUpdate, permission: Permission,
) -> AdminUserResponse:
    actor, _ = lock_authenticated_admin(db, context)
    actor_role = AdminRole(actor.role)
    enforce_permission(actor_role, permission)
    user = lock_user(db, admin_id)
    if user is None:
        raise _not_found()
    changes = data.model_dump(exclude_unset=True)
    if "role" in changes:
        enforce_permission(actor_role, Permission.ROLES_MANAGE)
    if "is_active" in changes:
        enforce_permission(actor_role, Permission.USERS_DEACTIVATE)
    if user.role == AdminRole.OWNER and ("role" in changes or changes.get("is_active") is False):
        raise AppError(409, "owner_protected", "The owner role and active status are protected.")

    changed = {key: value for key, value in changes.items() if getattr(user, key) != value}
    previous_role = AdminRole(user.role)
    for key, value in changed.items():
        setattr(user, key, value)
    if set(changed) & {"email", "role", "is_active"}:
        revoke_sessions(db, user.id, utc_now())
    if "role" in changed:
        record_audit(
            db, "role_changed", actor_id=actor.id, resource_id=user.id,
            previous_role=previous_role, new_role=AdminRole(user.role),
        )
    if "is_active" in changed:
        action = "account_activated" if user.is_active else "account_deactivated"
        record_audit(db, action, actor_id=actor.id, resource_id=user.id)
    if set(changed) & {"full_name", "email"}:
        record_audit(db, "user_updated", actor_id=actor.id, resource_id=user.id)
    db.flush()
    return AdminUserResponse.model_validate(user)


def update_user(db: Session, context: AdminContext, admin_id: UUID, data: AdminUserUpdate) -> AdminUserResponse:
    try:
        with db.begin():
            return _update_locked_user(db, context, admin_id, data, Permission.USERS_UPDATE)
    except IntegrityError as exc:
        _handle_integrity(exc)


def deactivate_user(db: Session, context: AdminContext, admin_id: UUID) -> AdminUserResponse:
    with db.begin():
        return _update_locked_user(
            db, context, admin_id, AdminUserUpdate(is_active=False), Permission.USERS_DEACTIVATE,
        )
