from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.bookings.status import BookingStatus


def status_type(name: str):
    return Enum(
        BookingStatus, name=name, native_enum=False, create_constraint=True, length=16,
        values_callable=lambda members: [member.value for member in members],
    )


class Booking(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("customer_id", "idempotency_key_hash"),
        CheckConstraint("(idempotency_key_hash IS NULL) = (request_hash IS NULL)", name="idempotency_pair"),
        CheckConstraint("status_version >= 0", name="status_version_nonnegative"),
        Index("ix_bookings_customer_created", "customer_id", "created_at", "id"),
        Index("ix_bookings_customer_status_created", "customer_id", "status", "created_at", "id"),
        Index("ix_bookings_service_date", "service_date", "id"),
        Index("ix_bookings_status_created", "status", "created_at", "id"),
        Index("ix_bookings_service_id", "service_id"),
        Index("ix_bookings_created", "created_at", "id"),
        Index("ix_bookings_updated", "updated_at", "id"),
        Index("ix_bookings_completed", "completed_at", "id", postgresql_where=text("completed_at IS NOT NULL")),
    )

    booking_reference: Mapped[str] = mapped_column(String(17), unique=True)
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"))
    service_id: Mapped[UUID] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"))
    status: Mapped[BookingStatus] = mapped_column(status_type("status"), server_default=text("'pending'"))
    status_version: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    service_date: Mapped[date | None] = mapped_column(Date)
    customer_name_snapshot: Mapped[str] = mapped_column(String(100))
    customer_phone_snapshot: Mapped[str] = mapped_column(String(13))
    alternate_phone_snapshot: Mapped[str | None] = mapped_column(String(13))
    service_name_snapshot: Mapped[str] = mapped_column(String(120))
    customer_instructions: Mapped[str | None] = mapped_column(String(500))
    coverage_matched: Mapped[bool | None] = mapped_column(Boolean)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(String(500))
    admin_notes: Mapped[str | None] = mapped_column(Text)
    idempotency_key_hash: Mapped[str | None] = mapped_column(String(64))
    request_hash: Mapped[str | None] = mapped_column(String(64))

    address: Mapped["BookingAddress | None"] = relationship(lazy="raise")
    pricing: Mapped["BookingPricingSnapshot"] = relationship(lazy="raise")
    history: Mapped[list["BookingStatusHistory"]] = relationship(
        lazy="raise", order_by="BookingStatusHistory.sequence",
    )


class BookingAddress(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "booking_addresses"
    __table_args__ = (
        CheckConstraint(
            "(location_source = 'manual' AND latitude IS NULL AND longitude IS NULL AND google_maps_url IS NULL) OR "
            "(location_source IN ('gps', 'gps_with_manual_address') AND latitude IS NOT NULL "
            "AND longitude IS NOT NULL AND google_maps_url IS NOT NULL)",
            name="location_source_pair",
        ),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="coordinate_range"),
        CheckConstraint("postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'", name="postal_code_format"),
        CheckConstraint("address_line IS NOT NULL OR location_source = 'gps'", name="address_line_or_gps"),
    )

    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"), unique=True)
    address_line: Mapped[str | None] = mapped_column(String(800))
    address_line_2: Mapped[str | None] = mapped_column(String(800))
    recipient_name: Mapped[str | None] = mapped_column(String(100))
    recipient_phone: Mapped[str | None] = mapped_column(String(13))
    locality: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    postal_code: Mapped[str | None] = mapped_column(String(6))
    landmark: Mapped[str | None] = mapped_column(String(120))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    location_source: Mapped[str] = mapped_column(String(24))
    google_maps_url: Mapped[str | None] = mapped_column(String(180))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


Index("ix_booking_addresses_city_lower", func.lower(BookingAddress.city))
Index("ix_booking_addresses_district_lower", func.lower(BookingAddress.district))
Index("ix_booking_addresses_postal_code", BookingAddress.postal_code)


class BookingPricingSnapshot(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "booking_pricing_snapshots"
    __table_args__ = (
        CheckConstraint("panel_quantity IS NULL OR panel_quantity BETWEEN 1 AND 10000", name="panel_quantity_range"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        CheckConstraint("estimated_amount IS NULL OR estimated_amount BETWEEN 0 AND 99999999999999.99", name="estimate_range"),
        CheckConstraint(
            "(pricing_type IS NULL AND price_configuration_id IS NULL AND base_price IS NULL "
            "AND price_per_panel IS NULL AND minimum_charge IS NULL AND estimated_amount IS NULL) OR "
            "(pricing_type IS NOT NULL AND price_configuration_id IS NOT NULL AND ("
            "(pricing_type = 'custom_quote' AND base_price IS NULL AND price_per_panel IS NULL "
            "AND minimum_charge IS NULL AND estimated_amount IS NULL) OR "
            "(pricing_type = 'fixed' AND base_price IS NOT NULL AND price_per_panel IS NULL AND estimated_amount IS NOT NULL) OR "
            "(pricing_type = 'per_panel' AND base_price IS NULL AND price_per_panel IS NOT NULL "
            "AND panel_quantity IS NOT NULL AND estimated_amount IS NOT NULL)))",
            name="pricing_shape",
        ),
    )

    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"), unique=True)
    price_configuration_id: Mapped[UUID | None] = mapped_column(ForeignKey("service_prices.id", ondelete="RESTRICT"), index=True)
    pricing_type: Mapped[str | None] = mapped_column(String(16))
    base_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_per_panel: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    minimum_charge: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    panel_quantity: Mapped[int | None] = mapped_column(Integer)
    estimated_amount: Mapped[Decimal | None] = mapped_column(Numeric(16, 2))
    currency: Mapped[str] = mapped_column(String(3))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BookingStatusHistory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "booking_status_history"
    __table_args__ = (
        UniqueConstraint("booking_id", "sequence"),
        CheckConstraint("sequence >= 0", name="sequence_nonnegative"),
        CheckConstraint(
            "(sequence = 0 AND old_status IS NULL AND new_status = 'pending') OR "
            "(sequence > 0 AND old_status IS NOT NULL AND old_status <> new_status)", name="status_change",
        ),
        CheckConstraint("changed_by_type IN ('customer', 'admin', 'system', 'technician')", name="actor_type"),
    )

    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"))
    sequence: Mapped[int] = mapped_column(Integer)
    old_status: Mapped[BookingStatus | None] = mapped_column(status_type("old_status"))
    new_status: Mapped[BookingStatus] = mapped_column(status_type("new_status"))
    changed_by_type: Mapped[str] = mapped_column(String(10))
    changed_by_id: Mapped[UUID | None]
    reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BookingAdminNote(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "booking_admin_notes"
    __table_args__ = (
        CheckConstraint("length(btrim(note)) BETWEEN 1 AND 4000", name="note_length"),
        Index("ix_booking_admin_notes_booking_created", "booking_id", "created_at", "id"),
    )

    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"))
    admin_id: Mapped[UUID] = mapped_column(ForeignKey("admin_users.id", ondelete="RESTRICT"))
    note: Mapped[str] = mapped_column(Text)
