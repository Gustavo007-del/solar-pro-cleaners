from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.business.models import BusinessProfile
from app.modules.business.schemas import PublicBusinessProfile


def find_active_business(db: Session) -> BusinessProfile | None:
    return db.scalar(select(BusinessProfile).where(
        BusinessProfile.singleton_key == 1, BusinessProfile.is_active.is_(True),
    ))


def require_active_business(db: Session) -> BusinessProfile:
    business = find_active_business(db)
    if business is None:
        raise AppError(404, "business_not_configured", "Business information is not available.")
    return business


def read_business(db: Session) -> PublicBusinessProfile:
    return PublicBusinessProfile.model_validate(require_active_business(db))
