from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from pydantic import SecretStr
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.modules.admins.audit import record_audit
from app.modules.admins.credentials import AdminIdentity, authentication_failed, issue_access, refresh_hash
from app.modules.admins.models import AdminSession, AdminUser
from app.modules.admins.permissions import AdminRole, Permission, ROLE_PERMISSIONS, enforce_permission
from app.modules.admins.schemas import AdminAuthentication, AdminProfile, AdminTokens, AdminUserResponse, Transport
from app.modules.customers.credentials import new_refresh_token, utc_now


@dataclass(frozen=True)
class AdminContext:
    identity: AdminIdentity
    profile: AdminProfile
    transport: Transport


def admin_profile(user: AdminUser) -> AdminProfile:
    profile = AdminUserResponse.model_validate(user)
    return AdminProfile(**profile.model_dump(), permissions=sorted(ROLE_PERMISSIONS[profile.role]))


def lock_user(db: Session, user_id: UUID) -> AdminUser | None:
    return db.scalar(select(AdminUser).where(AdminUser.id == user_id).with_for_update())


def _active_session(db: Session, identity: AdminIdentity):
    return db.execute(
        select(AdminUser, AdminSession).select_from(AdminUser)
        .join(AdminSession, AdminSession.admin_user_id == AdminUser.id)
        .where(
            AdminUser.id == identity.admin_id, AdminUser.is_active.is_(True), AdminSession.id == identity.session_id,
            AdminSession.revoked_at.is_(None), AdminSession.expires_at > utc_now(),
        )
    ).one_or_none()


def authenticate_admin(db: Session, identity: AdminIdentity) -> AdminContext:
    with db.begin():
        active = _active_session(db, identity)
        if active is None:
            raise authentication_failed()
        user, session = active
        return AdminContext(identity, admin_profile(user), session.transport)


def lock_authenticated_admin(db: Session, context: AdminContext) -> tuple[AdminUser, AdminSession]:
    lock_user(db, context.identity.admin_id)
    active = _active_session(db, context.identity)
    if active is None:
        raise authentication_failed()
    user, session = active
    return user, session


def lock_authorized_admin(db: Session, context: AdminContext, permission: Permission) -> AdminUser:
    user, _ = lock_authenticated_admin(db, context)
    enforce_permission(AdminRole(user.role), permission)
    return user


def revoke_sessions(db: Session, admin_id: UUID, now: datetime, *, family_id: UUID | None = None) -> None:
    statement = update(AdminSession).where(AdminSession.admin_user_id == admin_id, AdminSession.revoked_at.is_(None))
    if family_id is not None:
        statement = statement.where(AdminSession.family_id == family_id)
    db.execute(statement.values(revoked_at=now))


def issue_session(
    db: Session, settings: Settings, user: AdminUser, transport: Transport, now: datetime,
    *, family_id: UUID | None = None, expires_at: datetime | None = None,
) -> AdminAuthentication:
    expires = expires_at or now + timedelta(days=settings.admin_refresh_token_days)
    secret = new_refresh_token()
    session_id = uuid4()
    db.add(AdminSession(
        id=session_id, admin_user_id=user.id, family_id=family_id or uuid4(), transport=transport,
        refresh_token_hash=refresh_hash(settings, secret), expires_at=expires,
    ))
    access, expires_in = issue_access(settings, AdminIdentity(user.id, session_id), now, expires)
    db.flush()
    return AdminAuthentication(
        admin=admin_profile(user), tokens=AdminTokens(
            access_token=access, refresh_token=secret.get_secret_value(),
            expires_in=expires_in, refresh_expires_at=expires,
        ),
    )


def rotate_session(db: Session, settings: Settings, secret: SecretStr, transport: Transport) -> AdminAuthentication:
    digest = refresh_hash(settings, secret)
    with db.begin():
        owner_id = db.scalar(select(AdminSession.admin_user_id).where(AdminSession.refresh_token_hash == digest))
        user = lock_user(db, owner_id) if owner_id is not None else None
        if user is None or not user.is_active:
            raise authentication_failed()
        previous = db.scalar(select(AdminSession).where(
            AdminSession.admin_user_id == user.id, AdminSession.refresh_token_hash == digest,
        ))
        if previous is None or previous.transport != transport:
            raise authentication_failed()
        now = utc_now()
        if previous.rotated_at is not None:
            revoke_sessions(db, user.id, now, family_id=previous.family_id)
            record_audit(db, "refresh_replay", actor_id=user.id, resource_id=previous.family_id, resource_type="admin_session_family")
        else:
            if previous.revoked_at is not None or int(previous.expires_at.timestamp()) <= int(now.timestamp()):
                raise authentication_failed()
            previous.rotated_at = previous.revoked_at = previous.last_used_at = now
            db.flush()
            return issue_session(
                db, settings, user, transport, now, family_id=previous.family_id, expires_at=previous.expires_at,
            )
    raise authentication_failed()


def logout(db: Session, context: AdminContext, *, all_sessions: bool = False) -> None:
    with db.begin():
        user, session = lock_authenticated_admin(db, context)
        now = utc_now()
        if all_sessions:
            revoke_sessions(db, user.id, now)
            record_audit(db, "logout_all", actor_id=user.id, resource_id=user.id)
        else:
            session.revoked_at = now
            record_audit(db, "logout", actor_id=user.id, resource_id=session.id, resource_type="admin_session")
