from datetime import date, time
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, SmallInteger, String, Text, Time, UniqueConstraint, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class BusinessProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "business_profiles"
    __table_args__ = (
        CheckConstraint("singleton_key = 1", name="singleton"),
        CheckConstraint("postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'", name="postal_code_format"),
    )

    singleton_key: Mapped[int] = mapped_column(SmallInteger, unique=True, server_default=text("1"))
    business_name: Mapped[str] = mapped_column(String(150))
    short_description: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    primary_phone: Mapped[str | None] = mapped_column(String(16))
    alternate_phone: Mapped[str | None] = mapped_column(String(16))
    support_email: Mapped[str | None] = mapped_column(String(254))
    website_url: Mapped[str | None] = mapped_column(String(2048))
    whatsapp_number: Mapped[str | None] = mapped_column(String(16))
    business_address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    postal_code: Mapped[str | None] = mapped_column(String(6))
    logo_url: Mapped[str | None] = mapped_column(String(2048))
    privacy_policy_url: Mapped[str | None] = mapped_column(String(2048))
    terms_url: Mapped[str | None] = mapped_column(String(2048))
    timezone: Mapped[str] = mapped_column(String(64), server_default=text("'Asia/Kolkata'"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())


class BusinessOperatingHour(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "business_operating_hours"
    __table_args__ = (
        UniqueConstraint("business_profile_id", "day_of_week"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="weekday"),
        CheckConstraint(
            "(is_open AND opening_time IS NOT NULL AND closing_time IS NOT NULL AND opening_time < closing_time) OR "
            "(NOT is_open AND opening_time IS NULL AND closing_time IS NULL)",
            name="time_range",
        ),
    )

    business_profile_id: Mapped[UUID] = mapped_column(ForeignKey("business_profiles.id", ondelete="RESTRICT"))
    day_of_week: Mapped[int] = mapped_column(SmallInteger)
    is_open: Mapped[bool] = mapped_column(Boolean)
    opening_time: Mapped[time | None] = mapped_column(Time())
    closing_time: Mapped[time | None] = mapped_column(Time())


class BusinessClosure(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "business_closures"
    __table_args__ = (UniqueConstraint("business_profile_id", "closure_date"),)

    business_profile_id: Mapped[UUID] = mapped_column(ForeignKey("business_profiles.id", ondelete="RESTRICT"))
    closure_date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
