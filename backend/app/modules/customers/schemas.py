import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, SecretStr, StringConstraints, model_validator

from app.modules.customers.credentials import validate_opaque_secret

MOBILE_FORMAT = re.compile(r"(?:(?:\+91|0091|91|\(\+91\))[ -]?)?([6-9](?:[ -]?[0-9]){9})")
MALAYALAM_DIGITS = str.maketrans("൦൧൨൩൪൫൬൭൮൯", "0123456789")


def normalize_phone(value: str) -> str:
    value = value.translate(MALAYALAM_DIGITS)
    match = MOBILE_FORMAT.fullmatch(value)
    if match is None:
        raise ValueError("Enter a valid Indian mobile number.")
    return "+91" + match[1].replace(" ", "").replace("-", "")


FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[^\x00-\x1f\x7f]+$")]
PhoneNumber = Annotated[str, StringConstraints(strip_whitespace=True, max_length=32), AfterValidator(normalize_phone)]
OpaqueSecret = Annotated[SecretStr, Field(min_length=43, max_length=43), AfterValidator(validate_opaque_secret)]
InstallationLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$")]


class CustomerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CustomerRegister(CustomerInput):
    model_config = ConfigDict(json_schema_extra={"examples": [{
        "full_name": "Example Customer",
        "phone_number": "+919000000001",
        "alternate_phone_number": None,
        "installation_credential": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    }]})
    full_name: FullName
    phone_number: PhoneNumber
    alternate_phone_number: PhoneNumber | None = None
    installation_credential: OpaqueSecret = Field(
        description="Canonical unpadded base64url from 32 CSPRNG bytes. The example credential is illustrative only."
    )
    installation_label: InstallationLabel | None = None


class CustomerLogin(CustomerInput):
    installation_credential: OpaqueSecret


class RefreshRequest(CustomerInput):
    refresh_token: OpaqueSecret


class CustomerProfileUpdate(CustomerInput):
    full_name: FullName | None = None
    phone_number: PhoneNumber | None = None
    alternate_phone_number: PhoneNumber | None = None

    @model_validator(mode="after")
    def check_patch(self) -> "CustomerProfileUpdate":
        if not self.model_fields_set:
            raise ValueError("Send at least one profile field.")
        if ("full_name" in self.model_fields_set and self.full_name is None) or (
            "phone_number" in self.model_fields_set and self.phone_number is None
        ):
            raise ValueError("Name and primary phone cannot be null.")
        return self


class CustomerProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    phone_number: str
    alternate_phone_number: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CustomerAccount(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CustomerTokens(BaseModel):
    access_token: str = Field(repr=False)
    refresh_token: str = Field(repr=False)
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    refresh_expires_at: datetime


class CustomerAuthentication(BaseModel):
    customer: CustomerProfile
    tokens: CustomerTokens


class LogoutResponse(BaseModel):
    status: Literal["ok"] = "ok"
