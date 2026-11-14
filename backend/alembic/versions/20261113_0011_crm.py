"""Add private CRM records and follow-ups."""
from alembic import op

revision = "20261113_0011"
down_revision = "20261112_0010"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute("""
        CREATE TABLE crm_sources (
            name varchar(100) PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
        INSERT INTO crm_sources (name) VALUES ('Manual entry'), ('Solar installation data'), ('Phone enquiry'),
            ('WhatsApp enquiry'), ('Website enquiry'), ('Referral'), ('Existing customer referral'), ('Other');
        CREATE TABLE crm_leads (
            id uuid PRIMARY KEY, name varchar(100), phone varchar(16), location varchar(300), district varchar(100),
            installation_date date, details jsonb NOT NULL, status varchar(32) NOT NULL, priority varchar(8) NOT NULL,
            source varchar(100) NOT NULL REFERENCES crm_sources(name),
            assigned_to uuid REFERENCES admin_users(id), created_by uuid NOT NULL REFERENCES admin_users(id),
            last_contacted_at timestamptz, archived_at timestamptz, customer_id uuid REFERENCES customers(id),
            booking_id uuid REFERENCES bookings(id), converted_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE crm_events (
            id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES crm_leads(id),
            actor_id uuid NOT NULL REFERENCES admin_users(id), kind varchar(32) NOT NULL, note text,
            details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE crm_follow_ups (
            id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES crm_leads(id), due_at timestamptz NOT NULL,
            status varchar(16) NOT NULL, reason varchar(300) NOT NULL, notes text,
            created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_crm_leads_phone ON crm_leads(phone);
        CREATE INDEX ix_crm_leads_status ON crm_leads(status);
        CREATE INDEX ix_crm_leads_source ON crm_leads(source);
        CREATE INDEX ix_crm_leads_assigned_to ON crm_leads(assigned_to);
        CREATE INDEX ix_crm_leads_district ON crm_leads(district);
        CREATE INDEX ix_crm_leads_installation_date ON crm_leads(installation_date);
        CREATE INDEX ix_crm_events_lead_id ON crm_events(lead_id);
        CREATE INDEX ix_crm_events_kind ON crm_events(kind);
        CREATE INDEX ix_crm_follow_ups_lead_id ON crm_follow_ups(lead_id);
        CREATE INDEX ix_crm_follow_ups_due_at ON crm_follow_ups(due_at);
        CREATE UNIQUE INDEX uq_crm_open_follow_up ON crm_follow_ups(lead_id) WHERE status = 'open';
    """)
    for table in ("crm_sources", "crm_leads", "crm_events", "crm_follow_ups"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON {table} FROM PUBLIC")
        for role in ("anon", "authenticated"):
            op.execute(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') "
                       f"THEN REVOKE ALL ON {table} FROM {role}; END IF; END $$")


def downgrade():
    raise RuntimeError("Keep CRM records when rolling back the application.")
