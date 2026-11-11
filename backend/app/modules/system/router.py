from fastapi import APIRouter

from app.api.dependencies import AppSettings
from app.modules.system.schemas import ApplicationInfo, HealthResponse

router = APIRouter(tags=["system"])


@router.get("/health", summary="Application liveness")
def health() -> HealthResponse:
    """Report that the API process can respond to requests."""
    return HealthResponse(status="ok")


@router.get("/info", summary="Public API information")
def application_info(settings: AppSettings) -> ApplicationInfo:
    return ApplicationInfo(name=settings.app_name, api_version=settings.api_version)
