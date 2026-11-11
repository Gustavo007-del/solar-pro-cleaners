from fastapi import APIRouter

from app.api.v1.router import router as v1_router
from app.core.config import Settings


def create_api_router(settings: Settings) -> APIRouter:
    router = APIRouter()
    router.include_router(v1_router, prefix=settings.versioned_prefix)
    return router
