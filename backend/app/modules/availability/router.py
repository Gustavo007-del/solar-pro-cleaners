from typing import Annotated

from fastapi import APIRouter, Query

from app.api.dependencies import DatabaseSession
from app.modules.availability.schemas import AvailabilityQuery, AvailabilityResult
from app.modules.availability.service import evaluate_availability

router = APIRouter(prefix="/availability", tags=["Availability"])


@router.get("", summary="Evaluate configured service availability for an address and date")
def availability(db: DatabaseSession, query: Annotated[AvailabilityQuery, Query()]) -> AvailabilityResult:
    return evaluate_availability(db, query.service_id, query.requested_date, query)
