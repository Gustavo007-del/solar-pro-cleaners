from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.modules.pricing.models import ServicePrice


def find_applicable_price(db: Session, service_id: UUID, at: datetime) -> ServicePrice | None:
    return db.scalar(
        select(ServicePrice)
        .where(
            ServicePrice.service_id == service_id,
            ServicePrice.is_active.is_(True),
            or_(ServicePrice.effective_from.is_(None), ServicePrice.effective_from <= at),
            or_(ServicePrice.effective_until.is_(None), ServicePrice.effective_until > at),
        )
        .order_by(ServicePrice.effective_from.desc().nulls_last())
        .limit(1)
    )
