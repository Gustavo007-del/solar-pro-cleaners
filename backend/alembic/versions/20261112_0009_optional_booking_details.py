"""Support pending bookings before the date and location are known."""
import sqlalchemy as sa
from alembic import op

revision = "20261112_0009"
down_revision = "20261111_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.alter_column("bookings", "service_date", existing_type=sa.Date(), nullable=True)
    op.alter_column("booking_addresses", "address_line", existing_type=sa.String(800), nullable=True)
    op.create_check_constraint(
        op.f("ck_booking_addresses_address_line_or_gps"), "booking_addresses",
        "address_line IS NOT NULL OR location_source = 'gps'",
    )
    # A fresh catalogue can accept the core service without implying a price or service area.
    op.execute("""
        INSERT INTO services (id, slug, name, short_description, description, display_order)
        SELECT 'e92d228e-89c5-44c5-84e6-01a7de93bd53'::uuid, 'solar-panel-cleaning', 'Solar Panel Cleaning',
               'On-site solar panel cleaning.', 'Request a visit to clean your solar panels.', 100
        WHERE NOT EXISTS (SELECT 1 FROM services)
        ON CONFLICT (slug) DO NOTHING
    """)


def downgrade() -> None:
    raise RuntimeError("Use a forward migration to preserve bookings with missing details.")
