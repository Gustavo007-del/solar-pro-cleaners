from sqlalchemy import Boolean, CheckConstraint, Index, Integer, String, Text, text, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Service(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("display_order >= 0", name="display_order_nonnegative"),
        CheckConstraint("jsonb_typeof(benefits) = 'array'", name="benefits_array"),
        Index("ix_services_public_order", "display_order", "slug", postgresql_where=text("is_active")),
    )

    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    short_description: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    benefits: Mapped[list[str]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    display_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
