from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, EmailStr, Field, SecretStr, model_validator

from app.modules.admins.permissions import AdminRole, Permission
from app.modules.customers.credentials import validate_opaque_secret
from app.modules.customers.schemas import FullName
from app.schemas.catalogue import ConfigInput, PublicPageQuery, PublicRecord, Text120

Transport = Literal["token", "cookie"]
ManagedRole = Literal["admin", "staff"]
Password = Annotated[SecretStr, Field(min_length=1, max_length=128)]
RefreshToken = Annotated[SecretStr, Field(min_length=43, max_length=43), AfterValidator(validate_opaque_secret)]


def normalize_email(value: str) -> str:
    return value.lower()


AdminEmail = Annotated[EmailStr, AfterValidator(normalize_email)]


class AdminLogin(ConfigInput):
    email: AdminEmail
    password: Password
    transport: Transport = "token"


class AdminRefresh(ConfigInput):
    refresh_token: RefreshToken | None = None


class ChangePassword(ConfigInput):
    current_password: Password
    new_password: Password


class AdminProfileUpdate(ConfigInput):
    full_name: FullName


class AdminUserCreate(ConfigInput):
    full_name: FullName
    email: AdminEmail
    password: Password
    role: ManagedRole


class AdminUserUpdate(ConfigInput):
    full_name: FullName | None = None
    email: AdminEmail | None = None
    role: ManagedRole | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_update(self) -> "AdminUserUpdate":
        if not self.model_fields_set or any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("Send at least one non-null update field.")
        return self


class AdminUserQuery(PublicPageQuery):
    search: Text120 | None = None
    role: AdminRole | None = None
    is_active: bool | None = None


class AdminUserResponse(PublicRecord):
    id: UUID
    full_name: str
    email: str
    role: AdminRole
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdminProfile(AdminUserResponse):
    permissions: list[Permission]


class AdminTokens(PublicRecord):
    access_token: str = Field(repr=False)
    refresh_token: str | None = Field(repr=False)
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    refresh_expires_at: datetime


class AdminAuthentication(PublicRecord):
    admin: AdminProfile
    tokens: AdminTokens


class AdminLogoutResponse(PublicRecord):
    status: Literal["ok"] = "ok"
