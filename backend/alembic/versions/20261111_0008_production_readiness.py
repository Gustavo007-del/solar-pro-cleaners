"""Correlate audit records and index workload date ranges."""
import sqlalchemy as sa
from alembic import op

revision = "20261111_0008"
down_revision = "20261111_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column("admin_audit_logs", sa.Column("request_id", sa.String(32), nullable=True))
    op.create_index(
        "ix_booking_assignments_technician_service_date", "booking_assignments",
        ["technician_id", "service_date"],
        postgresql_include=["assignment_status"],
    )


def downgrade() -> None:
    raise RuntimeError("Use a forward migration to preserve request correlation on audit records.")

