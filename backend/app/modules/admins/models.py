from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func, text, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AdminUser(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "admin_users"
    __table_args__ = (
        CheckConstraint("role IN ('owner', 'admin', 'staff')", name="role"),
        CheckConstraint("role <> 'owner' OR is_active", name="owner_active"),
        CheckConstraint("email = lower(email)", name="normalized_email"),
        Index("uq_admin_users_single_owner", "role", unique=True, postgresql_where=text("role = 'owner'")),
    )

    full_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(12))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminSession(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "admin_sessions"
    __table_args__ = (
        CheckConstraint("transport IN ('token', 'cookie')", name="transport"),
        Index(
            "uq_admin_sessions_active_family", "admin_user_id", "family_id",
            unique=True, postgresql_where=text("revoked_at IS NULL"),
        ),
    )

    admin_user_id: Mapped[UUID] = mapped_column(ForeignKey("admin_users.id", ondelete="RESTRICT"))
    family_id: Mapped[UUID]
    transport: Mapped[str] = mapped_column(String(8))
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminAuditLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "admin_audit_logs"
    __table_args__ = (Index("ix_admin_audit_resource_created", "resource_type", "resource_id", "created_at"),)

    actor_admin_id: Mapped[UUID | None] = mapped_column(ForeignKey("admin_users.id", ondelete="RESTRICT"), index=True)
    request_id: Mapped[str | None] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(64))
    resource_type: Mapped[str] = mapped_column(String(40))
    resource_id: Mapped[UUID | None]
    details: Mapped[dict] = mapped_column("metadata", JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class AdminLoginBucket(Base):
    __tablename__ = "admin_login_buckets"
    __table_args__ = (CheckConstraint("attempts >= 1", name="attempts_positive"),)

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    attempts: Mapped[int] = mapped_column(Integer)
