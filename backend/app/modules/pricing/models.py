from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String, UniqueConstraint, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ServicePrice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "service_prices"
    __table_args__ = (
        UniqueConstraint("service_id", "effective_from", postgresql_nulls_not_distinct=True),
        CheckConstraint(
            "(pricing_type = 'fixed' AND base_price IS NOT NULL AND price_per_panel IS NULL) OR "
            "(pricing_type = 'per_panel' AND price_per_panel IS NOT NULL AND base_price IS NULL) OR "
            "(pricing_type = 'custom_quote' AND base_price IS NULL AND price_per_panel IS NULL AND minimum_charge IS NULL)",
            name="price_shape",
        ),
        CheckConstraint(
            "base_price BETWEEN 0 AND 9999999999.99 AND price_per_panel BETWEEN 0 AND 9999999999.99 "
            "AND minimum_charge BETWEEN 0 AND 9999999999.99", name="amount_range",
        ),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        CheckConstraint(
            "effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from",
            name="effective_period",
        ),
    )

    service_id: Mapped[UUID] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"))
    pricing_type: Mapped[str] = mapped_column(String(16))
    base_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_per_panel: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    minimum_charge: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), server_default=text("'INR'"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    effective_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
