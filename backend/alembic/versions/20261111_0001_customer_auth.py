"""Create customer accounts, installations, and refresh sessions."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("phone_number", sa.String(13), nullable=False),
        sa.Column("alternate_phone_number", sa.String(13), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customers")),
        sa.CheckConstraint("length(btrim(full_name)) > 0", name=op.f("ck_customers_full_name_nonblank")),
        sa.CheckConstraint("phone_number ~ '^[+]91[6-9][0-9]{9}$'", name=op.f("ck_customers_phone_format")),
        sa.CheckConstraint(
            "alternate_phone_number IS NULL OR alternate_phone_number ~ '^[+]91[6-9][0-9]{9}$'",
            name=op.f("ck_customers_alternate_phone_format"),
        ),
    )
    op.create_table(
        "customer_installations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("credential_hash", sa.String(64), nullable=False),
        sa.Column("installation_label", sa.String(80), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_installations")),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customers.id"],
            name=op.f("fk_customer_installations_customer_id_customers"), ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("credential_hash", name=op.f("uq_customer_installations_credential_hash")),
        sa.UniqueConstraint("customer_id", "id", name=op.f("uq_customer_installations_customer_id_id")),
    )
    op.create_table(
        "customer_refresh_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("installation_id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_refresh_sessions")),
        sa.ForeignKeyConstraint(
            ["customer_id", "installation_id"], ["customer_installations.customer_id", "customer_installations.id"],
            name=op.f("fk_customer_refresh_sessions_installation_owner"), ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("refresh_token_hash", name=op.f("uq_customer_refresh_sessions_refresh_token_hash")),
    )
    op.create_index(
        op.f("ix_customer_refresh_sessions_expires_at"), "customer_refresh_sessions", ["expires_at"],
    )
    op.create_index(
        "ix_customer_refresh_sessions_installation", "customer_refresh_sessions", ["customer_id", "installation_id"],
    )
    op.create_index(
        "ix_customer_refresh_sessions_active_family", "customer_refresh_sessions", ["customer_id", "family_id"],
        unique=True, postgresql_where=sa.text("revoked_at IS NULL"),
    )

    op.execute("ALTER TABLE customers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE customer_installations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE customer_refresh_sessions ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE customers, customer_installations, customer_refresh_sessions FROM PUBLIC")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                EXECUTE 'REVOKE ALL ON TABLE customers, customer_installations, customer_refresh_sessions FROM anon';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                EXECUTE 'REVOKE ALL ON TABLE customers, customer_installations, customer_refresh_sessions FROM authenticated';
            END IF;
        END;
        $$;
    """)


def downgrade() -> None:
    op.drop_table("customer_refresh_sessions")
    op.drop_table("customer_installations")
    op.drop_table("customers")
