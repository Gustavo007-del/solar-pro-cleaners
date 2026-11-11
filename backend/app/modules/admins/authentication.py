from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.credentials import authentication_failed
from app.modules.admins.models import AdminUser
from app.modules.admins.passwords import dummy_hash, hash_password, needs_rehash, validate_password, verify_password
from app.modules.admins.schemas import AdminAuthentication, AdminLogin, ChangePassword
from app.modules.admins.sessions import AdminContext, issue_session, lock_authenticated_admin, lock_user, revoke_sessions
from app.modules.admins.throttle import admit_login
from app.modules.customers.credentials import utc_now


def login(db: Session, settings: Settings, data: AdminLogin, source: str) -> AdminAuthentication:
    admit_login(db, settings, data.email, source)
    fallback = dummy_hash()
    with db.begin():
        candidate = db.execute(select(AdminUser.id, AdminUser.password_hash, AdminUser.is_active).where(
            AdminUser.email == data.email,
        )).one_or_none()
    expected_hash = candidate.password_hash if candidate is not None and candidate.is_active else fallback
    verified = verify_password(data.password, expected_hash)

    with db.begin():
        user = lock_user(db, candidate.id) if candidate is not None and verified and candidate.is_active else None
        if user is not None and user.is_active and user.email == data.email and user.password_hash == expected_hash:
            now = utc_now()
            if needs_rehash(expected_hash):
                user.password_hash = hash_password(data.password)
            user.last_login_at = now
            record_audit(db, "login_succeeded", actor_id=user.id, resource_id=user.id)
            return issue_session(db, settings, user, data.transport, now)
        record_audit(db, "login_failed")
    raise authentication_failed()


def change_password(
    db: Session, settings: Settings, context: AdminContext, data: ChangePassword,
) -> AdminAuthentication:
    with db.begin():
        user, session = lock_authenticated_admin(db, context)
        if not verify_password(data.current_password, user.password_hash):
            raise authentication_failed()
        validate_password(data.new_password, settings, email=user.email)
        if data.new_password == data.current_password:
            raise AppError(422, "password_unchanged", "Choose a different password.")
        now = utc_now()
        user.password_hash = hash_password(data.new_password)
        revoke_sessions(db, user.id, now)
        record_audit(db, "password_changed", actor_id=user.id, resource_id=user.id)
        return issue_session(db, settings, user, session.transport, now)
