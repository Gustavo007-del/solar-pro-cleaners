from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, false, text, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CustomerDevice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customer_devices"

    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id"), index=True)
    installation_id: Mapped[UUID] = mapped_column(ForeignKey("customer_installations.id"), unique=True)
    expo_push_token: Mapped[str | None] = mapped_column(String(200), unique=True)
    platform: Mapped[str] = mapped_column(String(7))
    device_name: Mapped[str | None] = mapped_column(String(80))
    app_version: Mapped[str | None] = mapped_column(String(40))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    notification_enabled: Mapped[bool] = mapped_column(Boolean, server_default=true())
    revision: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    last_registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class NotificationCampaign(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notification_campaigns"
    __table_args__ = (
        UniqueConstraint("created_by_admin_id", "request_id"),
        Index("ix_notification_campaigns_due", "next_run_at", postgresql_where=text("status = 'scheduled'")),
    )

    title: Mapped[str] = mapped_column(String(100))
    message: Mapped[str] = mapped_column(String(700))
    notification_type: Mapped[str] = mapped_column(String(24))
    recipient_type: Mapped[str] = mapped_column(String(24))
    customer_ids: Mapped[list[str]] = mapped_column(JSONB)
    destination: Mapped[str | None] = mapped_column(String(20))
    booking_id: Mapped[UUID | None]
    custom_data: Mapped[dict] = mapped_column(JSONB)
    schedule: Mapped[dict] = mapped_column(JSONB)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), index=True)
    occurrence_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    created_by_admin_id: Mapped[UUID] = mapped_column(ForeignKey("admin_users.id"))
    request_id: Mapped[UUID]


class NotificationExecution(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "notification_executions"
    __table_args__ = (
        UniqueConstraint("campaign_id", "scheduled_execution_at"),
        Index("ix_notification_executions_processing", "started_at", postgresql_where=text("completed_at IS NULL")),
    )

    campaign_id: Mapped[UUID] = mapped_column(ForeignKey("notification_campaigns.id"))
    scheduled_execution_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    execution_status: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict] = mapped_column(JSONB)
    recipients_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    successful_submissions: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    failed_submissions: Mapped[int] = mapped_column(Integer, server_default=text("0"))


class NotificationDelivery(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notification_deliveries"
    __table_args__ = (
        UniqueConstraint("execution_id", "device_id"),
        Index("ix_notification_deliveries_queue", "available_at", postgresql_where=text("status IN ('queued', 'submitted')")),
        Index("ix_notification_deliveries_sending", "attempted_at", postgresql_where=text("status = 'sending'")),
        Index("ix_notification_deliveries_attempt", "attempted_at"),
        Index("ix_notification_deliveries_execution_status", "execution_id", "status"),
    )

    execution_id: Mapped[UUID] = mapped_column(ForeignKey("notification_executions.id"))
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id"))
    device_id: Mapped[UUID] = mapped_column(ForeignKey("customer_devices.id"))
    device_revision: Mapped[int]
    platform: Mapped[str] = mapped_column(String(7))
    status: Mapped[str] = mapped_column(String(32))
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    receipt_attempts: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    expo_ticket_id: Mapped[str | None] = mapped_column(String(100))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    receipt_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(64))
    submission_accepted: Mapped[bool] = mapped_column(Boolean, server_default=false())
