from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.api.dependencies import DatabaseSession
from app.modules.pricing.schemas import PublicPrice
from app.modules.services.schemas import ServiceDetails, ServiceQuery, ServiceSummary
from app.modules.services.service import list_services, read_service, read_service_price
from app.schemas.common import ErrorResponse, Page

router = APIRouter(prefix="/services", tags=["Services"])
not_found = {404: {"model": ErrorResponse, "description": "The service is unavailable."}}


@router.get("", summary="List active services")
def catalogue(db: DatabaseSession, query: Annotated[ServiceQuery, Query()]) -> Page[ServiceSummary]:
    return list_services(db, query)


@router.get("/{service_id}", summary="Read active service details", responses=not_found)
def service_details(service_id: UUID, db: DatabaseSession) -> ServiceDetails:
    return read_service(db, service_id)


@router.get(
    "/{service_id}/pricing", summary="Read current public pricing",
    response_model_exclude_none=True, responses=not_found,
)
def service_pricing(service_id: UUID, db: DatabaseSession) -> PublicPrice | None:
    return read_service_price(db, service_id)
