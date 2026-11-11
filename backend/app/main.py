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
from app.middleware.limits import HostValidationMiddleware, RequestSizeMiddleware
from app.modules.system.public import web as public_web
from app.modules.system.router import operations
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
            {"name": "System", "description": "Liveness and public API information."},
            {"name": "Customer Authentication", "description": "Customer installation registration and session management."},
            {"name": "Customer Profile", "description": "Authenticated account profile and status."},
            {"name": "Admin Authentication", "description": "Administrative sessions and the current admin profile."},
            {"name": "Admin Users", "description": "Administrative account and role management."},
            {"name": "Admin Bookings", "description": "Protected booking administration and internal notes."},
            {"name": "Admin Customers", "description": "Protected customer and saved-address management."},
            {"name": "Admin Dashboard", "description": "Operational summaries and booking analytics."},
            {"name": "Technicians", "description": "Technician profiles, workload, and assignment history."},
            {"name": "Technician Availability", "description": "Dated and weekly availability and leave."},
            {"name": "Booking Assignments", "description": "Booking assignment, reassignment, removal, and history."},
            {"name": "Bookings", "description": "Authenticated booking requests, history, and pending cancellation."},
            {"name": "Services", "description": "Active services and applicable public pricing."},
            {"name": "Service Areas", "description": "Configured coverage areas and address matching."},
            {"name": "Locations", "description": "Location validation and coverage checks."},
            {"name": "Customer Addresses", "description": "Customer-owned addresses and default selection."},
            {"name": "Business Information", "description": "Public business profile, operating hours, and closure dates."},
            {"name": "Availability", "description": "Advisory coverage and operating-date evaluation."},
        ],
        responses={
            413: {"model": ErrorResponse, "description": "Request body exceeds the configured limit."},
            503: {"model": ErrorResponse, "description": "A required dependency is temporarily unavailable."},
            422: {"model": ErrorResponse, "description": "Request validation failed."},
            500: {"model": ErrorResponse, "description": "Unexpected server error."},
        },
    )
    app.state.settings = settings
    app.state.database = None

    register_exception_handlers(app)
    app.add_middleware(RequestSizeMiddleware, max_bytes=settings.request_max_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins,
        allow_credentials=bool(settings.admin_browser_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )
    if settings.trusted_hosts:
        app.add_middleware(HostValidationMiddleware, allowed_hosts=settings.trusted_hosts)
    app.add_middleware(RequestContextMiddleware, api_prefix=settings.versioned_prefix)
    app.include_router(operations)
    app.include_router(public_web)
    app.include_router(create_api_router(settings))
    return app


app = create_app()
