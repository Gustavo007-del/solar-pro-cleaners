"""Create the independent administrative authentication and audit tables."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20261111_0005"
down_revision = "20261111_0004"
branch_labels = None
depends_on = None

TABLES = ("admin_users", "admin_sessions", "admin_audit_logs", "admin_login_buckets")


def identity(table: str):
    return (
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
    )


def fk(table: str, column: str):
    return sa.ForeignKeyConstraint(
        [column], ["admin_users.id"], name=op.f(f"fk_{table}_{column}_admin_users"), ondelete="RESTRICT",
    )


def check(table: str, name: str, sql: str):
    return sa.CheckConstraint(sql, name=op.f(f"ck_{table}_{name}"))


def upgrade() -> None:
    op.create_table(
        "admin_users", *identity("admin_users"),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(12), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email", name=op.f("uq_admin_users_email")),
        check("admin_users", "role", "role IN ('owner', 'admin', 'staff')"),
        check("admin_users", "owner_active", "role <> 'owner' OR is_active"),
        check("admin_users", "normalized_email", "email = lower(email)"),
    )
    op.create_index(
        "uq_admin_users_single_owner", "admin_users", ["role"],
        unique=True, postgresql_where=sa.text("role = 'owner'"),
    )

    op.create_table(
        "admin_sessions", *identity("admin_sessions"),
        sa.Column("admin_user_id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("transport", sa.String(8), nullable=False),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("rotated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("refresh_token_hash", name=op.f("uq_admin_sessions_refresh_token_hash")),
        fk("admin_sessions", "admin_user_id"),
        check("admin_sessions", "transport", "transport IN ('token', 'cookie')"),
    )
    op.create_index("ix_admin_sessions_expires_at", "admin_sessions", ["expires_at"])
    op.create_index(
        "uq_admin_sessions_active_family", "admin_sessions", ["admin_user_id", "family_id"],
        unique=True, postgresql_where=sa.text("revoked_at IS NULL"),
    )

    op.create_table(
        "admin_audit_logs", *identity("admin_audit_logs"),
        sa.Column("actor_admin_id", sa.Uuid()),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("resource_type", sa.String(40), nullable=False),
        sa.Column("resource_id", sa.Uuid()),
        sa.Column("metadata", JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        fk("admin_audit_logs", "actor_admin_id"),
    )
    op.create_index("ix_admin_audit_logs_actor_admin_id", "admin_audit_logs", ["actor_admin_id"])
    op.create_index("ix_admin_audit_logs_created_at", "admin_audit_logs", ["created_at"])
    op.create_index(
        "ix_admin_audit_resource_created", "admin_audit_logs", ["resource_type", "resource_id", "created_at"],
    )

    op.create_table(
        "admin_login_buckets",
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("key_hash", name=op.f("pk_admin_login_buckets")),
        check("admin_login_buckets", "attempts_positive", "attempts >= 1"),
    )
    op.create_index("ix_admin_login_buckets_window_started_at", "admin_login_buckets", ["window_started_at"])

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
