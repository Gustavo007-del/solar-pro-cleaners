from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.dependencies import AppSettings, DatabaseSession
from app.modules.admins.credentials import authentication_failed, decode_access
from app.modules.admins.permissions import Permission, enforce_permission
from app.modules.admins.sessions import AdminContext, authenticate_admin

admin_bearer = HTTPBearer(
    scheme_name="AdminAccessToken", bearerFormat="JWT", auto_error=False,
    description="Administrative access JWT. Customer tokens use a separate trust boundary.",
)


def current_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(admin_bearer)],
    db: DatabaseSession, settings: AppSettings,
) -> AdminContext:
    if credentials is None:
        raise authentication_failed()
    return authenticate_admin(db, decode_access(credentials.credentials, settings))


AuthenticatedAdmin = Annotated[AdminContext, Depends(current_admin)]


def require_permission(permission: Permission) -> Callable:
    def authorized(admin: AuthenticatedAdmin) -> AdminContext:
        enforce_permission(admin.profile.role, permission)
        return admin
    return authorized
