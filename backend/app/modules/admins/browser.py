from pydantic import SecretStr, TypeAdapter, ValidationError
from fastapi import Request, Response

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.admins.credentials import authentication_failed
from app.modules.admins.schemas import AdminAuthentication, AdminRefresh, RefreshToken, Transport
from app.modules.customers.credentials import utc_now

COOKIE_NAME = "solar_admin_refresh"
cookie_token = TypeAdapter(RefreshToken)


def _path(settings: Settings) -> str:
    return f"{settings.versioned_prefix}/admin/auth"


def require_browser_origin(request: Request, settings: Settings) -> None:
    if request.headers.get("origin") not in settings.admin_browser_origins:
        raise AppError(403, "admin_origin_denied", "This browser origin is not allowed.")


def refresh_input(
    request: Request, settings: Settings, data: AdminRefresh | None,
) -> tuple[SecretStr, Transport]:
    if data is not None and data.refresh_token is not None:
        return data.refresh_token, "token"
    value = request.cookies.get(COOKIE_NAME)
    if value is None:
        raise authentication_failed()
    require_browser_origin(request, settings)
    try:
        return cookie_token.validate_python(value), "cookie"
    except ValidationError:
        raise authentication_failed() from None


def publish_tokens(
    response: Response, settings: Settings, result: AdminAuthentication, transport: Transport,
) -> AdminAuthentication:
    if transport == "token":
        return result
    response.set_cookie(
        COOKIE_NAME, result.tokens.refresh_token,
        max_age=max(0, int((result.tokens.refresh_expires_at - utc_now()).total_seconds())),
        path=_path(settings), secure=settings.admin_cookie_secure, httponly=True, samesite="strict",
    )
    result.tokens.refresh_token = None
    return result


def clear_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        COOKIE_NAME, path=_path(settings), secure=settings.admin_cookie_secure, httponly=True, samesite="strict",
    )
