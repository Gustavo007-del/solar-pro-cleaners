from datetime import date, datetime, time
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, SmallInteger, String, Time, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.technicians.status import ACTIVE_SQL


class Technician(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "technicians"
    __table_args__ = (
        CheckConstraint("employment_status IN ('active', 'inactive', 'on_leave', 'terminated')", name="employment_status"),
        CheckConstraint("employment_status NOT IN ('inactive', 'terminated') OR NOT is_active", name="inactive_status"),
        CheckConstraint("primary_phone ~ '^[+]91[6-9][0-9]{9}$'", name="primary_phone"),
        CheckConstraint("alternate_phone IS NULL OR alternate_phone ~ '^[+]91[6-9][0-9]{9}$'", name="alternate_phone"),
        CheckConstraint("email IS NULL OR email = lower(email)", name="normalized_email"),
        CheckConstraint("pin_code IS NULL OR pin_code ~ '^[1-9][0-9]{5}$'", name="pin_code"),
        Index("ix_technicians_employment_created", "employment_status", "created_at", "id"),
    )

    full_name: Mapped[str] = mapped_column(String(100))
    primary_phone: Mapped[str] = mapped_column(String(13), unique=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(13))
    email: Mapped[str | None] = mapped_column(String(254), unique=True)
    profile_image_url: Mapped[str | None] = mapped_column(String(2048))
    address: Mapped[str | None] = mapped_column(String(800))
    city: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    pin_code: Mapped[str | None] = mapped_column(String(6))
    employment_status: Mapped[str] = mapped_column(String(12), server_default=text("'active'"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    joining_date: Mapped[date | None] = mapped_column(Date)
    availability_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deactivation_reason: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(String(2000))


class TechnicianAvailability(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "technician_availability"
    __table_args__ = (
        CheckConstraint("(availability_date IS NULL) <> (day_of_week IS NULL)", name="calendar_key"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="weekday_range"),
        CheckConstraint(
            "availability_status IN ('available', 'unavailable', 'on_leave', 'temporarily_unavailable')", name="status",
        ),
        CheckConstraint(
            "(start_time IS NULL AND end_time IS NULL) OR "
            "(availability_status = 'available' AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)",
            name="time_range",
        ),
        Index("uq_technician_availability_date", "technician_id", "availability_date", unique=True, postgresql_where=text("availability_date IS NOT NULL")),
        Index("uq_technician_availability_weekday", "technician_id", "day_of_week", unique=True, postgresql_where=text("day_of_week IS NOT NULL")),
    )

    technician_id: Mapped[UUID] = mapped_column(ForeignKey("technicians.id", ondelete="RESTRICT"))
    availability_date: Mapped[date | None] = mapped_column(Date)
    day_of_week: Mapped[int | None] = mapped_column(SmallInteger)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    availability_status: Mapped[str] = mapped_column(String(24))
    reason: Mapped[str | None] = mapped_column(String(500))


class TechnicianLeave(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "technician_leave"
    __table_args__ = (
        CheckConstraint("start_date <= end_date", name="date_range"),
        Index("ix_technician_leave_dates", "technician_id", "start_date", "end_date"),
    )

    technician_id: Mapped[UUID] = mapped_column(ForeignKey("technicians.id", ondelete="RESTRICT"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    is_approved: Mapped[bool] = mapped_column(Boolean, server_default=true())
    reason: Mapped[str | None] = mapped_column(String(500))


class BookingAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "booking_assignments"
    __table_args__ = (
        CheckConstraint(
            "assignment_status IN ('assigned', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled', 'reassignment_required')",
            name="status",
        ),
        CheckConstraint(f"({ACTIVE_SQL}) = (ended_at IS NULL)", name="end_state"),
        Index("uq_booking_assignments_current_booking", "booking_id", unique=True, postgresql_where=text(ACTIVE_SQL)),
        Index("uq_booking_assignments_current_day", "technician_id", "service_date", unique=True, postgresql_where=text(ACTIVE_SQL)),
        Index("ix_booking_assignments_booking_assigned", "booking_id", "assigned_at", "id"),
        Index("ix_booking_assignments_technician_assigned", "technician_id", "assigned_at", "id"),
        Index(
            "ix_booking_assignments_technician_service_date", "technician_id", "service_date",
            postgresql_include=["assignment_status"],
        ),
    )

    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"))
    technician_id: Mapped[UUID] = mapped_column(ForeignKey("technicians.id", ondelete="RESTRICT"))
    assigned_by_admin_id: Mapped[UUID] = mapped_column(ForeignKey("admin_users.id", ondelete="RESTRICT"))
    replaces_assignment_id: Mapped[UUID | None] = mapped_column(ForeignKey("booking_assignments.id", ondelete="RESTRICT"))
    ended_by_admin_id: Mapped[UUID | None] = mapped_column(ForeignKey("admin_users.id", ondelete="RESTRICT"))
    service_date: Mapped[date] = mapped_column(Date)
    assignment_status: Mapped[str] = mapped_column(String(24))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(String(500))
    reassignment_reason: Mapped[str | None] = mapped_column(String(500))
    administrative_note: Mapped[str | None] = mapped_column(String(2000))
    operational_note: Mapped[str | None] = mapped_column(String(2000))
