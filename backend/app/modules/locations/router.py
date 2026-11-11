from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.dependencies import DatabaseSession
from app.modules.customers.dependencies import AuthenticatedCustomer
from app.modules.locations.schemas import CoverageCheckRequest, CoverageCheckResponse, CoverageResult, LocationQuery, PublicServiceArea
from app.modules.locations.service import check_coverage, evaluate_coverage, list_service_areas
from app.schemas.catalogue import PublicPageQuery
from app.schemas.common import Page

router = APIRouter(prefix="/service-areas", tags=["Service Areas"])
location_router = APIRouter(prefix="/locations", tags=["Locations"])


@router.get("", summary="List active service areas")
def service_areas(db: DatabaseSession, query: Annotated[PublicPageQuery, Query()]) -> Page[PublicServiceArea]:
    return list_service_areas(db, query)


@router.get("/check", summary="Match a PIN code or address to configured coverage")
def coverage(db: DatabaseSession, query: Annotated[LocationQuery, Query()]) -> CoverageResult:
    return check_coverage(db, query)


@location_router.post("/check-coverage", summary="Evaluate coverage for a proposed location")
def location_coverage(
    data: CoverageCheckRequest, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response,
) -> CoverageCheckResponse:
    response.headers["Cache-Control"] = "no-store"
    return evaluate_coverage(db, data)
