from fastapi import APIRouter, Response
from sqlalchemy import text

from app.api.dependencies import AppSettings, DatabaseSession
from app.modules.system.schemas import ApplicationInfo, HealthResponse, ReadinessResponse
from app.schemas.common import ErrorResponse

router = APIRouter(tags=["System"])
operations = APIRouter()


@operations.get("/health", include_in_schema=False)
@operations.head("/health", include_in_schema=False)
@router.get("/health", summary="Application liveness")
@router.head("/health", include_in_schema=False)
def health(response: Response) -> HealthResponse:
    response.headers["Cache-Control"] = "no-store"
    return HealthResponse(status="ok")


@operations.get("/health/ready", include_in_schema=False)
@router.get("/health/ready", summary="Database readiness", responses={503: {"model": ErrorResponse}})
def ready(db: DatabaseSession, response: Response) -> ReadinessResponse:
    with db.begin():
        db.execute(text("SET LOCAL statement_timeout = '2s'"))
        db.execute(text("SELECT 1"))
    response.headers["Cache-Control"] = "no-store"
    return ReadinessResponse(status="ready")


@router.get("/info", summary="Public API information")
def application_info(settings: AppSettings) -> ApplicationInfo:
    return ApplicationInfo(name=settings.app_name, api_version=settings.api_version)

