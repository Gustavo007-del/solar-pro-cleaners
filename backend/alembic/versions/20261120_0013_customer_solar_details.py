"""Save optional solar details provided during registration."""
from alembic import op
import sqlalchemy as sa

revision = "20261120_0013"
down_revision = "20261120_0012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("customers", sa.Column("solar_company", sa.String(100)))
    op.add_column("customers", sa.Column("solar_capacity_kv", sa.Integer()))
    op.create_check_constraint("solar_capacity_kv", "customers", "solar_capacity_kv IN (3, 4, 5, 7, 10)")


def downgrade():
    raise RuntimeError("Keep customer solar details when rolling back the application.")
