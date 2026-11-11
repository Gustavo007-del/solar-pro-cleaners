from typing import Annotated

from fastapi import Depends
from fastapi.routing import APIRoute
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


class PermissionCheck:
    def __init__(self, *permissions: Permission) -> None:
        self.permissions = permissions

    def __call__(self, admin: AuthenticatedAdmin) -> AdminContext:
        for permission in self.permissions:
            enforce_permission(admin.profile.role, permission)
        return admin


def require_permission(*permissions: Permission) -> PermissionCheck:
    return PermissionCheck(*permissions)


class AdminRoute(APIRoute):
    """Expose unconditional permissions from the dependencies that enforce them."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        permissions = sorted({
            permission.value
            for dependency in self.dependant.dependencies
            if isinstance(dependency.call, PermissionCheck)
            for permission in dependency.call.permissions
        })
        if permissions and "x-required-permissions" not in (self.openapi_extra or {}):
            self.openapi_extra = {**(self.openapi_extra or {}), "x-required-permissions": permissions}
            self.description = (
                f"{self.description}\n\nRequired permissions: " + ", ".join(f"`{value}`" for value in permissions) + "."
            ).strip()
