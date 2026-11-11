from typing import Annotated

from fastapi import APIRouter, Query

from app.api.dependencies import DatabaseSession
from app.modules.business.schedule import list_closures, list_operating_hours
from app.modules.business.schemas import ClosurePage, OperatingHoursResponse, PublicBusinessProfile
from app.modules.business.service import read_business
from app.schemas.catalogue import PublicPageQuery
from app.schemas.common import ErrorResponse

router = APIRouter(
    prefix="/business", tags=["business"],
    responses={404: {"model": ErrorResponse, "description": "Business information is unavailable."}},
)


@router.get("", summary="Read the active public business profile")
def business_profile(db: DatabaseSession) -> PublicBusinessProfile:
    return read_business(db)


@router.get("/operating-hours", summary="Read configured weekly operating hours")
def operating_hours(db: DatabaseSession) -> OperatingHoursResponse:
    return list_operating_hours(db)


@router.get("/closures", summary="List upcoming active closure dates")
def closures(db: DatabaseSession, query: Annotated[PublicPageQuery, Query()]) -> ClosurePage:
    return list_closures(db, query)
