"""Add private booking notes and indexes for administrative queries."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0006"
down_revision = "20261111_0005"
branch_labels = None
depends_on = None

INDEXES = (
    ("ix_bookings_updated", "bookings", ["updated_at", "id"]),
    ("ix_booking_addresses_city_lower", "booking_addresses", [sa.text("lower(city)")]),
    ("ix_booking_addresses_district_lower", "booking_addresses", [sa.text("lower(district)")]),
    ("ix_booking_addresses_postal_code", "booking_addresses", ["postal_code"]),
    ("ix_customers_created", "customers", ["created_at", "id"]),
    ("ix_customers_active_created", "customers", ["is_active", "created_at", "id"]),
    ("ix_customers_name_prefix", "customers", [sa.text("lower(full_name) text_pattern_ops")]),
    ("ix_customers_phone_prefix", "customers", [sa.text("phone_number varchar_pattern_ops")]),
    ("ix_customers_alternate_phone_prefix", "customers", [sa.text("alternate_phone_number varchar_pattern_ops")]),
)


def upgrade() -> None:
    op.create_table(
        "booking_admin_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("admin_id", sa.Uuid(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_booking_admin_notes")),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name=op.f("fk_booking_admin_notes_booking_id_bookings"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["admin_id"], ["admin_users.id"], name=op.f("fk_booking_admin_notes_admin_id_admin_users"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint("length(btrim(note)) BETWEEN 1 AND 4000", name=op.f("ck_booking_admin_notes_note_length")),
    )
    op.create_index("ix_booking_admin_notes_booking_created", "booking_admin_notes", ["booking_id", "created_at", "id"])
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)
    op.create_index(
        "ix_bookings_completed", "bookings", ["completed_at", "id"],
        postgresql_where=sa.text("completed_at IS NOT NULL"),
    )
    op.execute("ALTER TABLE booking_admin_notes ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE booking_admin_notes FROM PUBLIC")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                EXECUTE 'REVOKE ALL ON TABLE booking_admin_notes FROM anon';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                EXECUTE 'REVOKE ALL ON TABLE booking_admin_notes FROM authenticated';
            END IF;
        END;
        $$;
    """)


def downgrade() -> None:
    op.drop_index("ix_bookings_completed", table_name="bookings")
    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table)
    op.drop_table("booking_admin_notes")
