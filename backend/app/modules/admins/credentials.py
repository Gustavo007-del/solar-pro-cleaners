import hmac
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID, uuid4

import jwt
from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import AppError

CLAIMS = ["sub", "sid", "type", "iat", "exp", "jti", "iss", "aud"]


@dataclass(frozen=True)
class AdminIdentity:
    admin_id: UUID
    session_id: UUID


def authentication_failed() -> AppError:
    return AppError(401, "invalid_admin_session", "Administrative authentication failed.", headers={"WWW-Authenticate": "Bearer"})


def signing_key(settings: Settings) -> str:
    if settings.admin_jwt_signing_secret is None:
        raise AppError(503, "admin_authentication_unavailable", "Administrative authentication is unavailable.")
    return settings.admin_jwt_signing_secret.get_secret_value()


def refresh_hash(settings: Settings, secret: SecretStr) -> str:
    return hmac.digest(
        signing_key(settings).encode(), b"solar-care:admin-refresh:" + secret.get_secret_value().encode(), "sha256",
    ).hex()


def issue_access(
    settings: Settings, identity: AdminIdentity, now: datetime, session_expires_at: datetime,
) -> tuple[str, int]:
    expires = min(now + timedelta(minutes=settings.admin_access_token_minutes), session_expires_at)
    return jwt.encode(
        {
            "sub": str(identity.admin_id), "sid": str(identity.session_id), "type": "admin_access",
            "iat": now, "exp": expires, "jti": str(uuid4()),
            "iss": settings.admin_jwt_issuer, "aud": settings.admin_jwt_audience,
        },
        signing_key(settings), algorithm=settings.admin_jwt_algorithm,
    ), max(0, int(expires.timestamp()) - int(now.timestamp()))


def decode_access(token: str, settings: Settings) -> AdminIdentity:
    if len(token) > 4096:
        raise authentication_failed()
    try:
        claims = jwt.decode(
            token, signing_key(settings), algorithms=[settings.admin_jwt_algorithm],
            issuer=settings.admin_jwt_issuer, audience=settings.admin_jwt_audience,
            options={"require": CLAIMS, "strict_aud": True},
        )
        if claims["type"] != "admin_access":
            raise authentication_failed()
        return AdminIdentity(UUID(claims["sub"]), UUID(claims["sid"]))
    except (jwt.InvalidTokenError, ValueError, TypeError, AttributeError):
        raise authentication_failed() from None
