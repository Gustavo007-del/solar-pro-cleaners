import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import create_api_router
from app.core.config import Settings, get_settings
from app.core.database import create_database
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.middleware.requests import RequestContextMiddleware
from app.schemas.common import ErrorResponse

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        configure_logging(settings)
        database = create_database(settings) if settings.database_url is not None else None
        application.state.database = database
        logger.info("startup", extra={"event": "startup"})
        try:
            yield
        finally:
            if database is not None:
                database.engine.dispose()
            application.state.database = None
            logger.info("shutdown", extra={"event": "shutdown"})

    app = FastAPI(
        title=settings.app_name,
        description="API foundation for Solar Care customer and administration clients.",
        version=settings.api_version,
        lifespan=lifespan,
        docs_url="/docs" if settings.expose_docs else None,
        redoc_url="/redoc" if settings.expose_docs else None,
        openapi_url=f"{settings.versioned_prefix}/openapi.json" if settings.expose_docs else None,
        openapi_tags=[
            {"name": "system", "description": "Liveness and public API information."},
            {"name": "customers", "description": "Customer installation authentication and account profiles."},
            {"name": "admin", "description": "Separate administrative authentication, permissions, and account management."},
            {"name": "admin bookings", "description": "Protected booking administration and internal notes."},
            {"name": "admin customers", "description": "Protected customer and saved-address management."},
            {"name": "admin dashboard", "description": "Operational summaries and booking analytics."},
            {"name": "admin technicians", "description": "Technician profiles, availability, leave, and workload."},
            {"name": "admin assignments", "description": "Booking assignment, reassignment, removal, and history."},
            {"name": "bookings", "description": "Authenticated booking requests, history, and pending cancellation."},
            {"name": "services", "description": "Active services and applicable public pricing."},
            {"name": "service areas", "description": "Configured coverage areas and address matching."},
            {"name": "locations", "description": "Location validation and coverage checks."},
            {"name": "saved addresses", "description": "Customer-owned addresses and default selection."},
            {"name": "business", "description": "Public business profile, operating hours, and closure dates."},
            {"name": "availability", "description": "Advisory coverage and operating-date evaluation."},
        ],
        responses={
            422: {"model": ErrorResponse, "description": "Request validation failed."},
            500: {"model": ErrorResponse, "description": "Unexpected server error."},
        },
    )
    app.state.settings = settings
    app.state.database = None

    register_exception_handlers(app)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins,
        allow_credentials=bool(settings.admin_browser_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )
    app.include_router(create_api_router(settings))
    return app


app = create_app()
