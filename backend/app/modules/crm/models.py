from datetime import date, datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class LeadSource(TimestampMixin, Base):
    __tablename__ = "crm_sources"

    name: Mapped[str] = mapped_column(String(100), primary_key=True)


class Lead(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "crm_leads"

    name: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(16), index=True)
    location: Mapped[str | None] = mapped_column(String(300))
    district: Mapped[str | None] = mapped_column(String(100), index=True)
    installation_date: Mapped[date | None] = mapped_column(index=True)
    details: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(32), index=True)
    priority: Mapped[str] = mapped_column(String(8))
    source: Mapped[str] = mapped_column(ForeignKey("crm_sources.name"), index=True)
    assigned_to: Mapped[UUID | None] = mapped_column(ForeignKey("admin_users.id"), index=True)
    created_by: Mapped[UUID] = mapped_column(ForeignKey("admin_users.id"))
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    customer_id: Mapped[UUID | None] = mapped_column(ForeignKey("customers.id"))
    booking_id: Mapped[UUID | None] = mapped_column(ForeignKey("bookings.id"))
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LeadEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "crm_events"

    lead_id: Mapped[UUID] = mapped_column(ForeignKey("crm_leads.id"), index=True)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("admin_users.id"))
    kind: Mapped[str] = mapped_column(String(32), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSONB)


class FollowUp(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "crm_follow_ups"

    lead_id: Mapped[UUID] = mapped_column(ForeignKey("crm_leads.id"), index=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)
