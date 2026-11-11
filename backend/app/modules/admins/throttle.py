import hmac
from datetime import UTC, datetime

from sqlalchemy import case, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.admins.credentials import signing_key
from app.modules.admins.models import AdminLoginBucket
from app.modules.customers.credentials import utc_now


def bucket_key(secret: str, value: str) -> str:
    return hmac.digest(secret.encode(), value.encode(), "sha256").hex()


def take_attempt(db: Session, key: str, start: datetime, limit: int) -> bool:
    bucket = AdminLoginBucket
    statement = insert(bucket).values(key_hash=key, window_started_at=start, attempts=1)
    expired = bucket.window_started_at < start
    statement = statement.on_conflict_do_update(
        index_elements=[bucket.key_hash],
        set_={"window_started_at": start, "attempts": case((expired, 1), else_=bucket.attempts + 1)},
        where=or_(expired, (bucket.window_started_at == start) & (bucket.attempts < limit)),
    ).returning(bucket.key_hash)
    return db.scalar(statement) is not None


def admit_login(db: Session, settings: Settings, email: str, source: str) -> None:
    window = settings.admin_login_window_seconds
    now = int(utc_now().timestamp())
    start = datetime.fromtimestamp(now - now % window, UTC)
    secret = signing_key(settings)

    with db.begin():
        permitted = take_attempt(
            db, bucket_key(secret, f"admin-login-source:{source}"), start, settings.admin_login_attempts_per_source,
        ) and take_attempt(
            db, bucket_key(secret, f"admin-login-pair:{source}:{email}"), start, settings.admin_login_attempts_per_pair,
        ) and take_attempt(
            db, bucket_key(secret, f"admin-login-account:{email}"), start, settings.admin_login_attempts_per_account,
        )
    if not permitted:
        raise AppError(
            429, "admin_login_throttled", "Too many login attempts. Please try again later.",
            headers={"Retry-After": str(window - now % window)},
        )
