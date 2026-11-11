from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, Field, StringConstraints


def normalize_whitespace(value: object) -> object:
    return " ".join(value.split()) if isinstance(value, str) else value


def round_coordinate(value: Decimal) -> Decimal:
    rounded = value.quantize(Decimal("0.00000001"))
    return rounded.copy_abs() if rounded.is_zero() else rounded


def validate_pair(latitude: Decimal | None, longitude: Decimal | None) -> None:
    if (latitude is None) != (longitude is None):
        raise ValueError("Supply latitude and longitude together.")


AddressLine = Annotated[str, StringConstraints(min_length=1, max_length=800), BeforeValidator(normalize_whitespace)]
AddressText = Annotated[str, StringConstraints(min_length=1, max_length=120), BeforeValidator(normalize_whitespace)]
AddressLabel = Annotated[str, StringConstraints(min_length=1, max_length=80), BeforeValidator(normalize_whitespace)]
Latitude = Annotated[Decimal, Field(ge=-90, le=90, allow_inf_nan=False), AfterValidator(round_coordinate)]
Longitude = Annotated[Decimal, Field(ge=-180, le=180, allow_inf_nan=False), AfterValidator(round_coordinate)]
