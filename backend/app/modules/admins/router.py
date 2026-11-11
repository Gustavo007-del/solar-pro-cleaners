from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response

from app.api.dependencies import AppSettings, DatabaseSession
from app.api.rate_limits import RATE_LIMITED, client_source, rate_limit
from app.modules.admins.authentication import change_password, login
from app.modules.admins.browser import clear_cookie, publish_tokens, refresh_input, require_browser_origin
from app.modules.admins.dependencies import AdminRoute, AuthenticatedAdmin, require_permission
from app.modules.admins.permissions import Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.schemas import (
    AdminAuthentication, AdminLogin, AdminLogoutResponse, AdminProfile, AdminProfileUpdate, AdminRefresh,
    AdminUserCreate, AdminUserQuery, AdminUserResponse, AdminUserUpdate, ChangePassword,
)
from app.modules.admins.sessions import AdminContext, logout, rotate_session
from app.modules.admins.users import create_user, deactivate_user, list_users, read_user, update_self, update_user
from app.schemas.common import AdminPage, ErrorResponse


router = APIRouter(
    route_class=AdminRoute,
    prefix="/admin", dependencies=[Depends(prevent_caching)],
    responses={
        401: {"model": ErrorResponse, "description": "Administrative authentication failed."},
        403: {"model": ErrorResponse, "description": "Administrative permission or origin denied."},
        503: {"model": ErrorResponse, "description": "Administrative authentication unavailable."},
    },
)
Reader = Annotated[AdminContext, Depends(require_permission(Permission.USERS_READ))]
Creator = Annotated[AdminContext, Depends(require_permission(Permission.USERS_CREATE))]
Editor = Annotated[AdminContext, Depends(require_permission(Permission.USERS_UPDATE))]
Deactivator = Annotated[AdminContext, Depends(require_permission(Permission.USERS_DEACTIVATE))]
conflict = {409: {"model": ErrorResponse, "description": "Administrative account conflict."}}
not_found = {404: {"model": ErrorResponse, "description": "Administrative account not found."}}


@router.post("/auth/login", tags=["Admin Authentication"], summary="Sign in to an administrative account", responses={429: {"model": ErrorResponse}})
def sign_in(data: AdminLogin, db: DatabaseSession, settings: AppSettings, request: Request, response: Response) -> AdminAuthentication:
    if data.transport == "cookie":
        require_browser_origin(request, settings)
    source = client_source(request)
    return publish_tokens(response, settings, login(db, settings, data, source), data.transport)


@router.post("/auth/refresh", tags=["Admin Authentication"], dependencies=[rate_limit("admin_refresh")], responses=RATE_LIMITED, summary="Rotate an administrative refresh token")
def refresh(
    db: DatabaseSession, settings: AppSettings, request: Request, response: Response, data: AdminRefresh | None = None,
) -> AdminAuthentication:
    secret, transport = refresh_input(request, settings, data)
    return publish_tokens(response, settings, rotate_session(db, settings, secret, transport), transport)


@router.post("/auth/logout", tags=["Admin Authentication"], summary="Revoke the current admin session")
def sign_out(
    db: DatabaseSession, admin: AuthenticatedAdmin, settings: AppSettings, request: Request, response: Response,
) -> AdminLogoutResponse:
    if admin.transport == "cookie":
        require_browser_origin(request, settings)
    logout(db, admin)
    if admin.transport == "cookie":
        clear_cookie(response, settings)
    return AdminLogoutResponse()


@router.post("/auth/logout-all", tags=["Admin Authentication"], summary="Revoke all sessions for the current admin")
def sign_out_all(
    db: DatabaseSession, admin: AuthenticatedAdmin, settings: AppSettings, request: Request, response: Response,
) -> AdminLogoutResponse:
    if admin.transport == "cookie":
        require_browser_origin(request, settings)
    logout(db, admin, all_sessions=True)
    if admin.transport == "cookie":
        clear_cookie(response, settings)
    return AdminLogoutResponse()


@router.post("/auth/change-password", tags=["Admin Authentication"], dependencies=[rate_limit("admin_password")], responses=RATE_LIMITED, summary="Change the password and replace the current session")
def password_change(
    data: ChangePassword, db: DatabaseSession, admin: AuthenticatedAdmin, settings: AppSettings,
    request: Request, response: Response,
) -> AdminAuthentication:
    if admin.transport == "cookie":
        require_browser_origin(request, settings)
    return publish_tokens(response, settings, change_password(db, settings, admin, data), admin.transport)


@router.get("/me", tags=["Admin Authentication"], summary="Read the current administrative profile and permissions")
def me(admin: AuthenticatedAdmin) -> AdminProfile:
    return admin.profile


@router.patch("/me", tags=["Admin Authentication"], summary="Update the current admin's name")
def edit_me(data: AdminProfileUpdate, db: DatabaseSession, admin: AuthenticatedAdmin) -> AdminProfile:
    return update_self(db, admin, data.full_name)


@router.get("/users", tags=["Admin Users"], summary="List administrative accounts")
def users(db: DatabaseSession, admin: Reader, query: Annotated[AdminUserQuery, Query()]) -> AdminPage[AdminUserResponse]:
    return list_users(db, query)


@router.post("/users", tags=["Admin Users"], status_code=201, summary="Create an admin or staff account",
             dependencies=[rate_limit("admin_create")], responses={**conflict, **RATE_LIMITED})
def new_user(data: AdminUserCreate, db: DatabaseSession, settings: AppSettings, admin: Creator) -> AdminUserResponse:
    return create_user(db, settings, admin, data)


@router.get("/users/{admin_id}", tags=["Admin Users"], summary="Read an administrative account", responses=not_found)
def user(admin_id: UUID, db: DatabaseSession, admin: Reader) -> AdminUserResponse:
    return read_user(db, admin_id)


@router.patch("/users/{admin_id}", tags=["Admin Users"], summary="Update an administrative account", responses={**not_found, **conflict})
def edit_user(admin_id: UUID, data: AdminUserUpdate, db: DatabaseSession, admin: Editor) -> AdminUserResponse:
    return update_user(db, admin, admin_id, data)


@router.post("/users/{admin_id}/deactivate", tags=["Admin Users"], summary="Deactivate an admin or staff account", responses={**not_found, **conflict})
def deactivate(admin_id: UUID, db: DatabaseSession, admin: Deactivator) -> AdminUserResponse:
    return deactivate_user(db, admin, admin_id)
