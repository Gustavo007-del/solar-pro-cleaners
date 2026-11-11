from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints, model_validator

from app.schemas.catalogue import ConfigInput, PublicRecord, Slug

PricingType = Literal["fixed", "per_panel", "custom_quote"]
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]


class PriceInput(ConfigInput):
    service_slug: Slug
    pricing_type: PricingType
    base_price: Money | None = None
    price_per_panel: Money | None = None
    minimum_charge: Money | None = None
    currency: Currency = "INR"
    is_active: bool = True
    effective_from: AwareDatetime | None = None
    effective_until: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_price(self) -> "PriceInput":
        if self.pricing_type == "fixed":
            valid = self.base_price is not None and self.price_per_panel is None
        elif self.pricing_type == "per_panel":
            valid = self.price_per_panel is not None and self.base_price is None
        else:
            valid = self.base_price is None and self.price_per_panel is None and self.minimum_charge is None
        if not valid:
            raise ValueError("Amounts must match the selected pricing type.")
        if self.effective_from and self.effective_until and self.effective_until <= self.effective_from:
            raise ValueError("The pricing end must be after its start.")
        return self


class PublicPrice(PublicRecord):
    pricing_type: PricingType
    currency: str
    base_price: Decimal | None
    price_per_panel: Decimal | None
    minimum_charge: Decimal | None
