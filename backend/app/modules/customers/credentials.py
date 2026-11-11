import base64
import binascii
import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from uuid import UUID, uuid4

import jwt
from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import AppError

TOKEN_BYTES = 32
TOKEN_FORMAT = re.compile(r"[A-Za-z0-9_-]{43}")


def validate_opaque_secret(secret: SecretStr) -> SecretStr:
    value = secret.get_secret_value()
    if not TOKEN_FORMAT.fullmatch(value):
        raise ValueError("Expected a base64url-encoded 32-byte credential.")
    try:
        raw = base64.b64decode(value + "=", altchars=b"-_", validate=True)
    except binascii.Error:
        raise ValueError("Invalid credential format.") from None
    if len(raw) != TOKEN_BYTES or base64.urlsafe_b64encode(raw).decode().rstrip("=") != value:
        raise ValueError("Invalid credential format.")
    return secret


def installation_digest(secret: SecretStr) -> str:
    return hashlib.sha256(b"solar-care:installation:" + secret.get_secret_value().encode("ascii")).hexdigest()


def refresh_digest(secret: SecretStr) -> str:
    return hashlib.sha256(b"solar-care:refresh:" + secret.get_secret_value().encode("ascii")).hexdigest()


def new_refresh_token() -> SecretStr:
    return SecretStr(token_urlsafe(TOKEN_BYTES))


def authentication_failed() -> AppError:
    return AppError(401, "invalid_customer_session", "Customer authentication failed.", headers={"WWW-Authenticate": "Bearer"})


def signing_key(settings: Settings) -> str:
    if settings.secret_key is None:
        raise AppError(503, "authentication_unavailable", "Customer authentication is unavailable.")
    return settings.secret_key.get_secret_value()


@dataclass(frozen=True)
class AccessIdentity:
    customer_id: UUID
    session_id: UUID


def issue_access_token(
    identity: AccessIdentity, settings: Settings, now: datetime, session_expires_at: datetime
) -> tuple[str, int]:
    expires_at = min(now + timedelta(minutes=settings.access_token_expire_minutes), session_expires_at)
    token = jwt.encode(
        {
            "sub": str(identity.customer_id),
            "sid": str(identity.session_id),
            "type": "access",
            "iat": now,
            "exp": expires_at,
            "jti": str(uuid4()),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        },
        signing_key(settings),
        algorithm=settings.jwt_algorithm,
    )
    return token, max(0, int(expires_at.timestamp()) - int(now.timestamp()))


def decode_access_token(token: str, settings: Settings) -> AccessIdentity:
    if len(token) > 4096:
        raise authentication_failed()
    try:
        claims = jwt.decode(
            token,
            signing_key(settings),
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["sub", "sid", "type", "iat", "exp", "jti", "iss", "aud"], "strict_aud": True},
        )
        if claims["type"] != "access" or not isinstance(claims["sid"], str):
            raise authentication_failed()
        return AccessIdentity(UUID(claims["sub"]), UUID(claims["sid"]))
    except (jwt.InvalidTokenError, ValueError, TypeError, AttributeError):
        raise authentication_failed() from None


def utc_now() -> datetime:
    return datetime.now(UTC)
