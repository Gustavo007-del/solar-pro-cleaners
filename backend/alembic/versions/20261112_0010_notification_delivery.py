"""notification_delivery

Revision ID: 20261112_0010
Revises: 20261112_0009
Create Date: 2026-11-12 19:51:53.076874
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '20261112_0010'
down_revision: str | Sequence[str] | None = '20261112_0009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table('notification_campaigns',
    sa.Column('title', sa.String(length=100), nullable=False),
    sa.Column('message', sa.String(length=700), nullable=False),
    sa.Column('notification_type', sa.String(length=24), nullable=False),
    sa.Column('recipient_type', sa.String(length=24), nullable=False),
    sa.Column('customer_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('destination', sa.String(length=20), nullable=True),
    sa.Column('booking_id', sa.Uuid(), nullable=True),
    sa.Column('custom_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('schedule', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('occurrence_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('created_by_admin_id', sa.Uuid(), nullable=False),
    sa.Column('request_id', sa.Uuid(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by_admin_id'], ['admin_users.id'], name=op.f('fk_notification_campaigns_created_by_admin_id_admin_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notification_campaigns')),
    sa.UniqueConstraint('created_by_admin_id', 'request_id', name=op.f('uq_notification_campaigns_created_by_admin_id'))
    )
    op.create_index('ix_notification_campaigns_due', 'notification_campaigns', ['next_run_at'], unique=False, postgresql_where=sa.text("status = 'scheduled'"))
    op.create_index(op.f('ix_notification_campaigns_status'), 'notification_campaigns', ['status'], unique=False)
    op.create_table('customer_devices',
    sa.Column('customer_id', sa.Uuid(), nullable=False),
    sa.Column('installation_id', sa.Uuid(), nullable=False),
    sa.Column('expo_push_token', sa.String(length=200), nullable=True),
    sa.Column('platform', sa.String(length=7), nullable=False),
    sa.Column('device_name', sa.String(length=80), nullable=True),
    sa.Column('app_version', sa.String(length=40), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('notification_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('revision', sa.Integer(), server_default=sa.text('1'), nullable=False),
    sa.Column('last_registered_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_customer_devices_customer_id_customers')),
    sa.ForeignKeyConstraint(['installation_id'], ['customer_installations.id'], name=op.f('fk_customer_devices_installation_id_customer_installations')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_customer_devices')),
    sa.UniqueConstraint('expo_push_token', name=op.f('uq_customer_devices_expo_push_token')),
    sa.UniqueConstraint('installation_id', name=op.f('uq_customer_devices_installation_id'))
    )
    op.create_index(op.f('ix_customer_devices_customer_id'), 'customer_devices', ['customer_id'], unique=False)
    op.create_table('notification_executions',
    sa.Column('campaign_id', sa.Uuid(), nullable=False),
    sa.Column('scheduled_execution_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('execution_status', sa.String(length=16), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('recipients_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('successful_submissions', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('failed_submissions', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['campaign_id'], ['notification_campaigns.id'], name=op.f('fk_notification_executions_campaign_id_notification_campaigns')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notification_executions')),
    sa.UniqueConstraint('campaign_id', 'scheduled_execution_at', name=op.f('uq_notification_executions_campaign_id'))
    )
    op.create_index('ix_notification_executions_processing', 'notification_executions', ['started_at'], unique=False, postgresql_where=sa.text('completed_at IS NULL'))
    op.create_table('notification_deliveries',
    sa.Column('execution_id', sa.Uuid(), nullable=False),
    sa.Column('customer_id', sa.Uuid(), nullable=False),
    sa.Column('device_id', sa.Uuid(), nullable=False),
    sa.Column('device_revision', sa.Integer(), nullable=False),
    sa.Column('platform', sa.String(length=7), nullable=False),
    sa.Column('status', sa.String(length=32), nullable=False),
    sa.Column('available_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('attempted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('attempts', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('receipt_attempts', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('expo_ticket_id', sa.String(length=100), nullable=True),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('receipt_checked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('error_code', sa.String(length=64), nullable=True),
    sa.Column('submission_accepted', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_notification_deliveries_customer_id_customers')),
    sa.ForeignKeyConstraint(['device_id'], ['customer_devices.id'], name=op.f('fk_notification_deliveries_device_id_customer_devices')),
    sa.ForeignKeyConstraint(['execution_id'], ['notification_executions.id'], name=op.f('fk_notification_deliveries_execution_id_notification_executions')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notification_deliveries')),
    sa.UniqueConstraint('execution_id', 'device_id', name=op.f('uq_notification_deliveries_execution_id'))
    )
    op.create_index('ix_notification_deliveries_attempt', 'notification_deliveries', ['attempted_at'], unique=False)
    op.create_index('ix_notification_deliveries_execution_status', 'notification_deliveries', ['execution_id', 'status'], unique=False)
    op.create_index('ix_notification_deliveries_queue', 'notification_deliveries', ['available_at'], unique=False, postgresql_where=sa.text("status IN ('queued', 'submitted')"))
    op.create_index('ix_notification_deliveries_sending', 'notification_deliveries', ['attempted_at'], unique=False, postgresql_where=sa.text("status = 'sending'"))
    tables = ("customer_devices", "notification_campaigns", "notification_executions", "notification_deliveries")
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    targets = ", ".join(tables)
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
        END $$;
    """)


def downgrade() -> None:
    # Roll back binaries without removing the tables. A schema downgrade is allowed on empty installs only.
    op.execute("""
        DO $$
        BEGIN
            LOCK TABLE notification_deliveries, notification_executions, notification_campaigns, customer_devices
                IN ACCESS EXCLUSIVE MODE;
            IF EXISTS (SELECT 1 FROM notification_campaigns) OR EXISTS (SELECT 1 FROM customer_devices) THEN
                RAISE EXCEPTION 'Refusing to drop notification records';
            END IF;
        END $$;
    """)
    op.drop_index('ix_notification_deliveries_sending', table_name='notification_deliveries', postgresql_where=sa.text("status = 'sending'"))
    op.drop_index('ix_notification_deliveries_queue', table_name='notification_deliveries', postgresql_where=sa.text("status IN ('queued', 'submitted')"))
    op.drop_index('ix_notification_deliveries_execution_status', table_name='notification_deliveries')
    op.drop_index('ix_notification_deliveries_attempt', table_name='notification_deliveries')
    op.drop_table('notification_deliveries')
    op.drop_index('ix_notification_executions_processing', table_name='notification_executions', postgresql_where=sa.text('completed_at IS NULL'))
    op.drop_table('notification_executions')
    op.drop_index(op.f('ix_customer_devices_customer_id'), table_name='customer_devices')
    op.drop_table('customer_devices')
    op.drop_index(op.f('ix_notification_campaigns_status'), table_name='notification_campaigns')
    op.drop_index('ix_notification_campaigns_due', table_name='notification_campaigns', postgresql_where=sa.text("status = 'scheduled'"))
    op.drop_table('notification_campaigns')
