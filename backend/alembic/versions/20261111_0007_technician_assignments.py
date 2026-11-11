"""Add technician, availability, leave, and assignment records."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0007"
down_revision = "20261111_0006"
branch_labels = None
depends_on = None

TABLES = ("technicians", "technician_availability", "technician_leave", "booking_assignments")
ACTIVE = "assignment_status IN ('assigned', 'accepted', 'in_progress')"


def identity(table: str):
    return (
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
    )


def fk(table: str, column: str, target: str):
    return sa.ForeignKeyConstraint(
        [column], [f"{target}.id"], name=op.f(f"fk_{table}_{column}_{target}"), ondelete="RESTRICT",
    )


def check(table: str, name: str, sql: str):
    return sa.CheckConstraint(sql, name=op.f(f"ck_{table}_{name}"))


def upgrade() -> None:
    op.create_table(
        "technicians", *identity("technicians"),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("primary_phone", sa.String(13), nullable=False),
        sa.Column("alternate_phone", sa.String(13)),
        sa.Column("email", sa.String(254)),
        sa.Column("profile_image_url", sa.String(2048)),
        sa.Column("address", sa.String(800)),
        sa.Column("city", sa.String(120)),
        sa.Column("district", sa.String(120)),
        sa.Column("pin_code", sa.String(6)),
        sa.Column("employment_status", sa.String(12), nullable=False, server_default=sa.text("'active'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("joining_date", sa.Date()),
        sa.Column("availability_reset_at", sa.DateTime(timezone=True)),
        sa.Column("deactivation_reason", sa.String(500)),
        sa.Column("notes", sa.String(2000)),
        sa.UniqueConstraint("primary_phone", name=op.f("uq_technicians_primary_phone")),
        sa.UniqueConstraint("email", name=op.f("uq_technicians_email")),
        check("technicians", "employment_status", "employment_status IN ('active', 'inactive', 'on_leave', 'terminated')"),
        check("technicians", "inactive_status", "employment_status NOT IN ('inactive', 'terminated') OR NOT is_active"),
        check("technicians", "primary_phone", "primary_phone ~ '^[+]91[6-9][0-9]{9}$'"),
        check("technicians", "alternate_phone", "alternate_phone IS NULL OR alternate_phone ~ '^[+]91[6-9][0-9]{9}$'"),
        check("technicians", "normalized_email", "email IS NULL OR email = lower(email)"),
        check("technicians", "pin_code", "pin_code IS NULL OR pin_code ~ '^[1-9][0-9]{5}$'"),
    )
    op.create_index("ix_technicians_employment_created", "technicians", ["employment_status","created_at","id"])

    op.create_table(
        "technician_availability", *identity("technician_availability"),
        sa.Column("technician_id", sa.Uuid(), nullable=False),
        sa.Column("availability_date", sa.Date()),
        sa.Column("day_of_week", sa.SmallInteger()),
        sa.Column("start_time", sa.Time()),
        sa.Column("end_time", sa.Time()),
        sa.Column("availability_status", sa.String(24), nullable=False),
        sa.Column("reason", sa.String(500)),
        fk("technician_availability", "technician_id", "technicians"),
        check("technician_availability", "calendar_key", "(availability_date IS NULL) <> (day_of_week IS NULL)"),
        check("technician_availability", "weekday_range", "day_of_week BETWEEN 0 AND 6"),
        check("technician_availability", "status", "availability_status IN ('available', 'unavailable', 'on_leave', 'temporarily_unavailable')"),
        check("technician_availability", "time_range", "(start_time IS NULL AND end_time IS NULL) OR (availability_status = 'available' AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)"),
    )
    op.create_index("uq_technician_availability_date", "technician_availability", ["technician_id","availability_date"], unique=True, postgresql_where=sa.text("availability_date IS NOT NULL"))
    op.create_index("uq_technician_availability_weekday", "technician_availability", ["technician_id","day_of_week"], unique=True, postgresql_where=sa.text("day_of_week IS NOT NULL"))

    op.create_table(
        "technician_leave", *identity("technician_leave"),
        sa.Column("technician_id", sa.Uuid(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reason", sa.String(500)),
        fk("technician_leave", "technician_id", "technicians"),
        check("technician_leave", "date_range", "start_date <= end_date"),
    )
    op.create_index("ix_technician_leave_dates", "technician_leave", ["technician_id","start_date","end_date"])

    op.create_table(
        "booking_assignments", *identity("booking_assignments"),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("technician_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_by_admin_id", sa.Uuid(), nullable=False),
        sa.Column("replaces_assignment_id", sa.Uuid()),
        sa.Column("ended_by_admin_id", sa.Uuid()),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("assignment_status", sa.String(24), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("cancellation_reason", sa.String(500)),
        sa.Column("reassignment_reason", sa.String(500)),
        sa.Column("administrative_note", sa.String(2000)),
        sa.Column("operational_note", sa.String(2000)),
        fk("booking_assignments", "booking_id", "bookings"),
        fk("booking_assignments", "technician_id", "technicians"),
        fk("booking_assignments", "assigned_by_admin_id", "admin_users"),
        fk("booking_assignments", "replaces_assignment_id", "booking_assignments"),
        fk("booking_assignments", "ended_by_admin_id", "admin_users"),
        check("booking_assignments", "status", "assignment_status IN ('assigned', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled', 'reassignment_required')"),
        check("booking_assignments", "end_state", "(assignment_status IN ('assigned', 'accepted', 'in_progress')) = (ended_at IS NULL)"),
    )
    op.create_index("uq_booking_assignments_current_booking", "booking_assignments", ["booking_id"], unique=True, postgresql_where=sa.text(ACTIVE))
    op.create_index("uq_booking_assignments_current_day", "booking_assignments", ["technician_id","service_date"], unique=True, postgresql_where=sa.text(ACTIVE))
    op.create_index("ix_booking_assignments_booking_assigned", "booking_assignments", ["booking_id","assigned_at","id"])
    op.create_index("ix_booking_assignments_technician_assigned", "booking_assignments", ["technician_id","assigned_at","id"])

    op.drop_constraint(op.f("ck_booking_status_history_actor_type"), "booking_status_history", type_="check")
    op.create_check_constraint(
        op.f("ck_booking_status_history_actor_type"), "booking_status_history",
        "changed_by_type IN ('customer', 'admin', 'system', 'technician')",
    )

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    targets = ", ".join(TABLES)
    op.execute(f"REVOKE ALL ON TABLE {targets} FROM PUBLIC")
    op.execute(f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                EXECUTE 'REVOKE ALL ON TABLE {targets} FROM anon';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                EXECUTE 'REVOKE ALL ON TABLE {targets} FROM authenticated';
            END IF;
        END;
        $$;
    """)


def downgrade() -> None:
    op.drop_constraint(op.f("ck_booking_status_history_actor_type"), "booking_status_history", type_="check")
    op.create_check_constraint(
        op.f("ck_booking_status_history_actor_type"), "booking_status_history",
        "changed_by_type IN ('customer', 'admin', 'system')",
    )
    for table in reversed(TABLES):
        op.drop_table(table)
