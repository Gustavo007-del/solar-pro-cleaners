"""Add service catalogue, pricing, coverage, and business configuration."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20261111_0002"
down_revision = "20261111_0001"
branch_labels = None
depends_on = None

TABLES = (
    "services", "service_prices", "service_areas", "business_profiles",
    "business_operating_hours", "business_closures",
)


def _identity(table: str):
    return (
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
    )


def _active():
    return sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False)


def _optional_text(*names: str, size: int):
    return (sa.Column(name, sa.String(size), nullable=True) for name in names)


def upgrade() -> None:
    op.create_table(
        "services",
        *_identity("services"),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("short_description", sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("benefits", JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        _active(),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.UniqueConstraint("slug", name=op.f("uq_services_slug")),
        sa.CheckConstraint("display_order >= 0", name=op.f("ck_services_display_order_nonnegative")),
        sa.CheckConstraint("jsonb_typeof(benefits) = 'array'", name=op.f("ck_services_benefits_array")),
    )
    op.create_index("ix_services_public_order", "services", ["display_order", "slug"], postgresql_where=sa.text("is_active"))

    op.create_table(
        "service_prices",
        *_identity("service_prices"),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("pricing_type", sa.String(16), nullable=False),
        sa.Column("base_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("price_per_panel", sa.Numeric(12, 2), nullable=True),
        sa.Column("minimum_charge", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), server_default=sa.text("'INR'"), nullable=False),
        _active(),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_until", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], name=op.f("fk_service_prices_service_id_services"), ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "service_id", "effective_from", name=op.f("uq_service_prices_service_id"),
            postgresql_nulls_not_distinct=True,
        ),
        sa.CheckConstraint(
            "(pricing_type = 'fixed' AND base_price IS NOT NULL AND price_per_panel IS NULL) OR "
            "(pricing_type = 'per_panel' AND price_per_panel IS NOT NULL AND base_price IS NULL) OR "
            "(pricing_type = 'custom_quote' AND base_price IS NULL AND price_per_panel IS NULL AND minimum_charge IS NULL)",
            name=op.f("ck_service_prices_price_shape"),
        ),
        sa.CheckConstraint(
            "base_price BETWEEN 0 AND 9999999999.99 AND price_per_panel BETWEEN 0 AND 9999999999.99 "
            "AND minimum_charge BETWEEN 0 AND 9999999999.99",
            name=op.f("ck_service_prices_amount_range"),
        ),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name=op.f("ck_service_prices_currency_format")),
        sa.CheckConstraint(
            "effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from",
            name=op.f("ck_service_prices_effective_period"),
        ),
    )
    op.create_table(
        "service_areas",
        *_identity("service_areas"),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("match_type", sa.String(12), nullable=False),
        *_optional_text("locality", "city", "district", "state", size=120),
        *_optional_text("postal_code", size=6),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("coverage_key", sa.String(64), nullable=False),
        _active(),
        sa.UniqueConstraint("coverage_key", name=op.f("uq_service_areas_coverage_key")),
        sa.CheckConstraint("postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'", name=op.f("ck_service_areas_postal_code_format")),
        sa.CheckConstraint(
            "(match_type = 'pin' AND postal_code IS NOT NULL) OR "
            "(match_type = 'locality' AND postal_code IS NULL AND locality IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL) OR "
            "(match_type = 'city' AND postal_code IS NULL AND locality IS NULL AND city IS NOT NULL AND state IS NOT NULL) OR "
            "(match_type = 'district' AND postal_code IS NULL AND locality IS NULL AND city IS NULL AND district IS NOT NULL AND state IS NOT NULL)",
            name=op.f("ck_service_areas_coverage_shape"),
        ),
    )
    op.create_index("ix_service_areas_public_order", "service_areas", ["name", "id"], postgresql_where=sa.text("is_active"))

    op.create_table(
        "business_profiles",
        *_identity("business_profiles"),
        sa.Column("singleton_key", sa.SmallInteger(), server_default=sa.text("1"), nullable=False),
        sa.Column("business_name", sa.String(150), nullable=False),
        *_optional_text("short_description", size=300),
        sa.Column("description", sa.Text(), nullable=True),
        *_optional_text("primary_phone", "alternate_phone", "whatsapp_number", size=16),
        *_optional_text("support_email", size=254),
        *_optional_text("website_url", "logo_url", "privacy_policy_url", "terms_url", size=2048),
        sa.Column("business_address", sa.Text(), nullable=True),
        *_optional_text("city", "district", "state", size=120),
        *_optional_text("postal_code", size=6),
        sa.Column("timezone", sa.String(64), server_default=sa.text("'Asia/Kolkata'"), nullable=False),
        _active(),
        sa.UniqueConstraint("singleton_key", name=op.f("uq_business_profiles_singleton_key")),
        sa.CheckConstraint("singleton_key = 1", name=op.f("ck_business_profiles_singleton")),
        sa.CheckConstraint("postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'", name=op.f("ck_business_profiles_postal_code_format")),
    )
    op.create_table(
        "business_operating_hours",
        *_identity("business_operating_hours"),
        sa.Column("business_profile_id", sa.Uuid(), nullable=False),
        sa.Column("day_of_week", sa.SmallInteger(), nullable=False),
        sa.Column("is_open", sa.Boolean(), nullable=False),
        sa.Column("opening_time", sa.Time(), nullable=True),
        sa.Column("closing_time", sa.Time(), nullable=True),
        sa.ForeignKeyConstraint(
            ["business_profile_id"], ["business_profiles.id"],
            name=op.f("fk_business_operating_hours_business_profile_id_business_profiles"), ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("business_profile_id", "day_of_week", name=op.f("uq_business_operating_hours_business_profile_id")),
        sa.CheckConstraint("day_of_week BETWEEN 0 AND 6", name=op.f("ck_business_operating_hours_weekday")),
        sa.CheckConstraint(
            "(is_open AND opening_time IS NOT NULL AND closing_time IS NOT NULL AND opening_time < closing_time) OR "
            "(NOT is_open AND opening_time IS NULL AND closing_time IS NULL)",
            name=op.f("ck_business_operating_hours_time_range"),
        ),
    )
    op.create_table(
        "business_closures",
        *_identity("business_closures"),
        sa.Column("business_profile_id", sa.Uuid(), nullable=False),
        sa.Column("closure_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(300), nullable=True),
        _active(),
        sa.ForeignKeyConstraint(
            ["business_profile_id"], ["business_profiles.id"],
            name=op.f("fk_business_closures_business_profile_id_business_profiles"), ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("business_profile_id", "closure_date", name=op.f("uq_business_closures_business_profile_id")),
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
