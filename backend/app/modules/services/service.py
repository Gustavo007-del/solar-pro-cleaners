from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.pricing.schemas import PublicPrice
from app.modules.pricing.service import find_applicable_price
from app.modules.services.models import Service
from app.modules.services.schemas import ServiceDetails, ServiceQuery, ServiceSummary
from app.schemas.common import Page


def find_active_service(db: Session, service_id: UUID) -> Service | None:
    return db.scalar(select(Service).where(Service.id == service_id, Service.is_active.is_(True)))


def require_active_service(db: Session, service_id: UUID, *, lock: bool = False) -> Service:
    if lock:
        service = db.scalar(
            select(Service).where(Service.id == service_id, Service.is_active.is_(True)).with_for_update(read=True)
        )
    else:
        service = find_active_service(db, service_id)
    if service is None:
        raise AppError(404, "service_not_found", "The requested service is unavailable.")
    return service


def list_services(db: Session, query: ServiceQuery) -> Page[ServiceSummary]:
    filters = [Service.is_active.is_(True)]
    if query.search:
        filters.append(or_(
            Service.name.icontains(query.search, autoescape=True),
            Service.slug.icontains(query.search, autoescape=True),
        ))
    total = db.scalar(select(func.count()).select_from(Service).where(*filters)) or 0
    services = db.scalars(
        select(Service).where(*filters).order_by(Service.display_order, Service.slug)
        .offset(query.offset).limit(query.page_size)
    )
    return Page[ServiceSummary](
        items=[ServiceSummary.model_validate(row) for row in services],
        page=query.page, page_size=query.page_size, total=total,
    )


def read_service(db: Session, service_id: UUID) -> ServiceDetails:
    return ServiceDetails.model_validate(require_active_service(db, service_id))


def read_service_price(db: Session, service_id: UUID) -> PublicPrice | None:
    require_active_service(db, service_id)
    price = find_applicable_price(db, service_id, datetime.now(UTC))
    return PublicPrice.model_validate(price) if price is not None else None
