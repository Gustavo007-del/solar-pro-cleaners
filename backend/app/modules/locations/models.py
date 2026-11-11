from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Numeric, String, Text, false, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ServiceArea(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "service_areas"
    __table_args__ = (
        CheckConstraint("postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'", name="postal_code_format"),
        CheckConstraint(
            "(match_type = 'pin' AND postal_code IS NOT NULL) OR "
            "(match_type = 'locality' AND postal_code IS NULL AND locality IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL) OR "
            "(match_type = 'city' AND postal_code IS NULL AND locality IS NULL AND city IS NOT NULL AND state IS NOT NULL) OR "
            "(match_type = 'district' AND postal_code IS NULL AND locality IS NULL AND city IS NULL AND district IS NOT NULL AND state IS NOT NULL)",
            name="coverage_shape",
        ),
        Index("ix_service_areas_public_order", "name", "id", postgresql_where=text("is_active")),
    )

    name: Mapped[str] = mapped_column(String(120))
    match_type: Mapped[str] = mapped_column(String(12))
    locality: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    postal_code: Mapped[str | None] = mapped_column(String(6))
    description: Mapped[str | None] = mapped_column(Text)
    coverage_key: Mapped[str] = mapped_column(String(64), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())


class CustomerAddress(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customer_addresses"
    __table_args__ = (
        CheckConstraint("length(btrim(address_line)) > 0", name="address_nonblank"),
        CheckConstraint("postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'", name="postal_code_format"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="coordinate_range"),
        CheckConstraint(
            "(location_source = 'manual' AND latitude IS NULL AND longitude IS NULL) OR "
            "(location_source IN ('gps', 'gps_with_manual_address') AND latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="location_source_pair",
        ),
        Index("ix_customer_addresses_owner_created", "customer_id", "created_at", "id"),
        Index("uq_customer_addresses_one_default", "customer_id", unique=True, postgresql_where=text("is_default")),
    )

    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"))
    label: Mapped[str | None] = mapped_column(String(80))
    recipient_name: Mapped[str | None] = mapped_column(String(100))
    recipient_phone: Mapped[str | None] = mapped_column(String(13))
    address_line: Mapped[str] = mapped_column(String(800))
    address_line_2: Mapped[str | None] = mapped_column(String(800))
    locality: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    postal_code: Mapped[str | None] = mapped_column(String(6))
    landmark: Mapped[str | None] = mapped_column(String(120))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    location_source: Mapped[str] = mapped_column(String(24))
    is_default: Mapped[bool] = mapped_column(Boolean, server_default=false())
