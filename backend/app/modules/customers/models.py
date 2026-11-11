from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, String, UniqueConstraint, func, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Customer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        CheckConstraint("length(btrim(full_name)) > 0", name="full_name_nonblank"),
        CheckConstraint("phone_number ~ '^[+]91[6-9][0-9]{9}$'", name="phone_format"),
        CheckConstraint(
            "alternate_phone_number IS NULL OR alternate_phone_number ~ '^[+]91[6-9][0-9]{9}$'",
            name="alternate_phone_format",
        ),
    )

    full_name: Mapped[str] = mapped_column(String(100))
    phone_number: Mapped[str] = mapped_column(String(13))
    alternate_phone_number: Mapped[str | None] = mapped_column(String(13))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())


Index("ix_customers_created", Customer.created_at, Customer.id)
Index("ix_customers_active_created", Customer.is_active, Customer.created_at, Customer.id)
Index(
    "ix_customers_name_prefix", func.lower(Customer.full_name).label("normalized_name"),
    postgresql_ops={"normalized_name": "text_pattern_ops"},
)
Index("ix_customers_phone_prefix", Customer.phone_number, postgresql_ops={"phone_number": "varchar_pattern_ops"})
Index(
    "ix_customers_alternate_phone_prefix", Customer.alternate_phone_number,
    postgresql_ops={"alternate_phone_number": "varchar_pattern_ops"},
)


class CustomerInstallation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "customer_installations"
    __table_args__ = (
        UniqueConstraint("customer_id", "id", name="uq_customer_installations_customer_id_id"),
    )

    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"))
    credential_hash: Mapped[str] = mapped_column(String(64), unique=True)
    installation_label: Mapped[str | None] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshSession(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "customer_refresh_sessions"

    customer_id: Mapped[UUID]
    installation_id: Mapped[UUID]
    family_id: Mapped[UUID]
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        ForeignKeyConstraint(
            ["customer_id", "installation_id"],
            ["customer_installations.customer_id", "customer_installations.id"],
            name="fk_customer_refresh_sessions_installation_owner",
            ondelete="RESTRICT",
        ),
        Index("ix_customer_refresh_sessions_installation", "customer_id", "installation_id"),
        Index(
            "ix_customer_refresh_sessions_active_family", "customer_id", "family_id",
            unique=True, postgresql_where=text("revoked_at IS NULL"),
        ),
    )
