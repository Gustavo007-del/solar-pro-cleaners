from datetime import date
from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.availability.schemas import AvailabilityResult
from app.modules.business.schedule import business_today, schedule_on_date
from app.modules.business.schemas import DEFAULT_TIMEZONE
from app.modules.business.service import find_active_business
from app.modules.locations.schemas import LocationFields
from app.modules.locations.service import check_coverage
from app.modules.services.service import find_active_service


def evaluate_availability(
    db: Session, service_id: UUID, requested_date: date, location: LocationFields,
) -> AvailabilityResult:
    return evaluate_service_date(
        db, requested_date, location, service_active=find_active_service(db, service_id) is not None,
    )


def evaluate_service_date(
    db: Session, requested_date: date, location: LocationFields, *, service_active: bool,
) -> AvailabilityResult:
    coverage = check_coverage(db, location)
    business = find_active_business(db)
    timezone = business.timezone if business else db.info.get("business_timezone", DEFAULT_TIMEZONE)
    operating, closure = schedule_on_date(db, business.id, requested_date) if business else (None, None)

    if not service_active:
        reason, message = "service_unavailable", "The requested service is unavailable."
    elif requested_date < business_today(timezone):
        reason, message = "past_date", "Choose today or a future date."
    elif closure:
        reason, message = "closure", "The business has a closure configured for this date."
    elif operating is False:
        reason, message = "closed", "The business is closed on this day of the week."
    elif not coverage.covered or operating is None:
        reason, message = "confirmation_required", "The business needs to confirm service for this address and date."
    else:
        reason, message = "candidate", "Coverage and operating hours match. The business still needs to confirm availability."

    return AvailabilityResult(
        requested_date=requested_date, timezone=timezone, service_active=service_active,
        coverage=coverage, business_operating=operating, blocked_by_closure=closure,
        manual_confirmation_required=reason in ("confirmation_required", "candidate"),
        reason=reason, message=message,
    )
