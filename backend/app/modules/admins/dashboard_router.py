from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import DatabaseSession
from app.modules.admins.dashboard import analytics, summary
from app.modules.admins.dashboard_schemas import AnalyticsQuery, BookingAnalytics, DashboardSummary, SummaryQuery
from app.modules.admins.dependencies import require_permission
from app.modules.admins.permissions import Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.sessions import AdminContext
from app.schemas.common import ErrorResponse

router = APIRouter(
    prefix="/admin/dashboard", tags=["admin dashboard"], dependencies=[Depends(prevent_caching)],
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
DashboardReader = Annotated[AdminContext, Depends(require_permission(Permission.DASHBOARD_READ))]
AnalyticsReader = Annotated[AdminContext, Depends(require_permission(Permission.DASHBOARD_ANALYTICS_READ))]


@router.get("/summary", summary="Read operational counts and recent booking activity")
def dashboard(db: DatabaseSession, admin: DashboardReader, query: Annotated[SummaryQuery, Query()]) -> DashboardSummary:
    return summary(db, query)


@router.get("/bookings-analytics", summary="Read business-local booking chart buckets")
def chart(db: DatabaseSession, admin: AnalyticsReader, query: Annotated[AnalyticsQuery, Query()]) -> BookingAnalytics:
    return analytics(db, query)
