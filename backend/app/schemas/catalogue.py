from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import PaginationParams

Text120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Text300 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
Slug = Annotated[str, StringConstraints(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]
MALAYALAM_DIGITS = str.maketrans("൦൧൨൩൪൫൬൭൮൯", "0123456789")


def normalize_postal_code(value: str) -> str:
    value = value.translate(MALAYALAM_DIGITS)
    if len(value) != 6 or not value.isascii() or not value.isdigit() or value.startswith("0"):
        raise ValueError("Enter a six-digit Indian PIN code.")
    return value


PostalCode = Annotated[str, StringConstraints(strip_whitespace=True, max_length=6), AfterValidator(normalize_postal_code)]


class ConfigInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PublicRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PublicPageQuery(PaginationParams):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1, le=1_000_000)
