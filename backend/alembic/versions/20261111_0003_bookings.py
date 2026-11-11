"""Add customer bookings, immutable snapshots, and status history."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0003"
down_revision = "20261111_0002"
branch_labels = None
depends_on = None

TABLES = ("bookings", "booking_addresses", "booking_pricing_snapshots", "booking_status_history")
STATUS_VALUES = "'pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'"


def identity(table: str):
    return (
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
    )


def fk(table: str, column: str, target: str):
    return sa.ForeignKeyConstraint(
        [column], [f"{target}.id"], name=op.f(f"fk_{table}_{column}_{target}"), ondelete="RESTRICT",
    )


def booking_fk(table: str, *, unique: bool = True):
    columns = [sa.Column("booking_id", sa.Uuid(), nullable=False), fk(table, "booking_id", "bookings")]
    if unique:
        columns.append(sa.UniqueConstraint("booking_id", name=op.f(f"uq_{table}_booking_id")))
    return columns


def check(table: str, name: str, sql: str):
    return sa.CheckConstraint(sql, name=op.f(f"ck_{table}_{name}"))


def upgrade() -> None:
    op.create_table(
        "bookings",
        *identity("bookings"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("booking_reference", sa.String(17), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("status_version", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("customer_name_snapshot", sa.String(100), nullable=False),
        sa.Column("customer_phone_snapshot", sa.String(13), nullable=False),
        sa.Column("alternate_phone_snapshot", sa.String(13)),
        sa.Column("service_name_snapshot", sa.String(120), nullable=False),
        sa.Column("customer_instructions", sa.String(500)),
        sa.Column("coverage_matched", sa.Boolean()),
        *(sa.Column(name, sa.DateTime(timezone=True)) for name in (
            "confirmed_at", "assigned_at", "started_at", "completed_at", "cancelled_at",
        )),
        sa.Column("cancellation_reason", sa.String(500)),
        sa.Column("admin_notes", sa.Text()),
        sa.Column("idempotency_key_hash", sa.String(64)),
        sa.Column("request_hash", sa.String(64)),
        fk("bookings", "customer_id", "customers"),
        fk("bookings", "service_id", "services"),
        sa.UniqueConstraint("booking_reference", name=op.f("uq_bookings_booking_reference")),
        sa.UniqueConstraint("customer_id", "idempotency_key_hash", name=op.f("uq_bookings_customer_id")),
        check("bookings", "status", f"status IN ({STATUS_VALUES})"),
        check("bookings", "status_version_nonnegative", "status_version >= 0"),
        check("bookings", "idempotency_pair", "(idempotency_key_hash IS NULL) = (request_hash IS NULL)"),
    )
    for name, columns in (
        ("customer_created", ["customer_id", "created_at", "id"]),
        ("customer_status_created", ["customer_id", "status", "created_at", "id"]),
        ("service_date", ["service_date", "id"]),
        ("status_created", ["status", "created_at", "id"]),
        ("service_id", ["service_id"]),
        ("created", ["created_at", "id"]),
    ):
        op.create_index(f"ix_bookings_{name}", "bookings", columns)

    op.create_table(
        "booking_addresses",
        *identity("booking_addresses"),
        *booking_fk("booking_addresses"),
        sa.Column("address_line", sa.String(800), nullable=False),
        *(sa.Column(name, sa.String(120)) for name in ("locality", "city", "district", "state", "landmark")),
        sa.Column("postal_code", sa.String(6)),
        sa.Column("latitude", sa.Numeric(11, 8)),
        sa.Column("longitude", sa.Numeric(11, 8)),
        sa.Column("location_source", sa.String(24), nullable=False),
        sa.Column("google_maps_url", sa.String(180)),
        check(
            "booking_addresses", "location_source_pair",
            "(location_source = 'manual' AND latitude IS NULL AND longitude IS NULL AND google_maps_url IS NULL) OR "
            "(location_source IN ('gps', 'gps_with_manual_address') AND latitude IS NOT NULL "
            "AND longitude IS NOT NULL AND google_maps_url IS NOT NULL)",
        ),
        check("booking_addresses", "coordinate_range", "latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180"),
        check("booking_addresses", "postal_code_format", "postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'"),
    )
    op.create_table(
        "booking_pricing_snapshots",
        *identity("booking_pricing_snapshots"),
        *booking_fk("booking_pricing_snapshots"),
        sa.Column("price_configuration_id", sa.Uuid()),
        fk("booking_pricing_snapshots", "price_configuration_id", "service_prices"),
        sa.Column("pricing_type", sa.String(16)),
        *(sa.Column(name, sa.Numeric(12, 2)) for name in ("base_price", "price_per_panel", "minimum_charge")),
        sa.Column("panel_quantity", sa.Integer()),
        sa.Column("estimated_amount", sa.Numeric(16, 2)),
        sa.Column("currency", sa.String(3), nullable=False),
        check("booking_pricing_snapshots", "panel_quantity_range", "panel_quantity IS NULL OR panel_quantity BETWEEN 1 AND 10000"),
        check("booking_pricing_snapshots", "currency_format", "currency ~ '^[A-Z]{3}$'"),
        check("booking_pricing_snapshots", "estimate_range", "estimated_amount IS NULL OR estimated_amount BETWEEN 0 AND 99999999999999.99"),
        check(
            "booking_pricing_snapshots", "pricing_shape",
            "(pricing_type IS NULL AND price_configuration_id IS NULL AND base_price IS NULL "
            "AND price_per_panel IS NULL AND minimum_charge IS NULL AND estimated_amount IS NULL) OR "
            "(pricing_type IS NOT NULL AND price_configuration_id IS NOT NULL AND ("
            "(pricing_type = 'custom_quote' AND base_price IS NULL AND price_per_panel IS NULL "
            "AND minimum_charge IS NULL AND estimated_amount IS NULL) OR "
            "(pricing_type = 'fixed' AND base_price IS NOT NULL AND price_per_panel IS NULL AND estimated_amount IS NOT NULL) OR "
            "(pricing_type = 'per_panel' AND base_price IS NULL AND price_per_panel IS NOT NULL "
            "AND panel_quantity IS NOT NULL AND estimated_amount IS NOT NULL)))",
        ),
    )
    op.create_index(
        op.f("ix_booking_pricing_snapshots_price_configuration_id"),
        "booking_pricing_snapshots", ["price_configuration_id"],
    )

    op.create_table(
        "booking_status_history",
        *identity("booking_status_history"),
        *booking_fk("booking_status_history", unique=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("old_status", sa.String(16)),
        sa.Column("new_status", sa.String(16), nullable=False),
        sa.Column("changed_by_type", sa.String(10), nullable=False),
        sa.Column("changed_by_id", sa.Uuid()),
        sa.Column("reason", sa.String(500)),
        sa.UniqueConstraint("booking_id", "sequence", name=op.f("uq_booking_status_history_booking_id")),
        check("booking_status_history", "old_status", f"old_status IN ({STATUS_VALUES})"),
        check("booking_status_history", "new_status", f"new_status IN ({STATUS_VALUES})"),
        check("booking_status_history", "sequence_nonnegative", "sequence >= 0"),
        check(
            "booking_status_history", "status_change",
            "(sequence = 0 AND old_status IS NULL AND new_status = 'pending') OR "
            "(sequence > 0 AND old_status IS NOT NULL AND old_status <> new_status)",
        ),
        check("booking_status_history", "actor_type", "changed_by_type IN ('customer', 'admin', 'system')"),
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
    for table in reversed(TABLES):
        op.drop_table(table)
