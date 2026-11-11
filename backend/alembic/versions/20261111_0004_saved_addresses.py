"""Add saved customer addresses and optional booking address snapshot fields."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0004"
down_revision = "20261111_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_addresses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(80)),
        sa.Column("recipient_name", sa.String(100)),
        sa.Column("recipient_phone", sa.String(13)),
        sa.Column("address_line", sa.String(800), nullable=False),
        sa.Column("address_line_2", sa.String(800)),
        *(sa.Column(name, sa.String(120)) for name in ("locality", "city", "district", "state", "landmark")),
        sa.Column("postal_code", sa.String(6)),
        sa.Column("latitude", sa.Numeric(11, 8)),
        sa.Column("longitude", sa.Numeric(11, 8)),
        sa.Column("location_source", sa.String(24), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_addresses")),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customers.id"],
            name=op.f("fk_customer_addresses_customer_id_customers"), ondelete="RESTRICT",
        ),
        sa.CheckConstraint("length(btrim(address_line)) > 0", name=op.f("ck_customer_addresses_address_nonblank")),
        sa.CheckConstraint(
            "postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'",
            name=op.f("ck_customer_addresses_postal_code_format"),
        ),
        sa.CheckConstraint(
            "latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180",
            name=op.f("ck_customer_addresses_coordinate_range"),
        ),
        sa.CheckConstraint(
            "(location_source = 'manual' AND latitude IS NULL AND longitude IS NULL) OR "
            "(location_source IN ('gps', 'gps_with_manual_address') AND latitude IS NOT NULL AND longitude IS NOT NULL)",
            name=op.f("ck_customer_addresses_location_source_pair"),
        ),
    )
    op.create_index("ix_customer_addresses_owner_created", "customer_addresses", ["customer_id", "created_at", "id"])
    op.create_index(
        "uq_customer_addresses_one_default", "customer_addresses", ["customer_id"],
        unique=True, postgresql_where=sa.text("is_default"),
    )
    op.execute("ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE customer_addresses FROM PUBLIC")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                EXECUTE 'REVOKE ALL ON TABLE customer_addresses FROM anon';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                EXECUTE 'REVOKE ALL ON TABLE customer_addresses FROM authenticated';
            END IF;
        END;
        $$;
    """)

    op.add_column("booking_addresses", sa.Column("address_line_2", sa.String(800)))
    op.add_column("booking_addresses", sa.Column("recipient_name", sa.String(100)))
    op.add_column("booking_addresses", sa.Column("recipient_phone", sa.String(13)))


def downgrade() -> None:
    for name in ("recipient_phone", "recipient_name", "address_line_2"):
        op.drop_column("booking_addresses", name)
    op.drop_table("customer_addresses")
