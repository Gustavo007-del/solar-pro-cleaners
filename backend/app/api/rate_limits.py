from datetime import UTC, datetime
from ipaddress import IPv6Address, ip_address, ip_network
from typing import Literal

from fastapi import Depends, Request, params

from app.api.dependencies import AppSettings, DatabaseSession
from app.core.exceptions import AppError
from app.modules.admins.throttle import bucket_key, take_attempt
from app.schemas.common import ErrorResponse

Category = Literal[
    "customer_register", "customer_login", "customer_refresh", "admin_refresh", "booking_create",
    "booking_cancel", "admin_booking_cancel", "customer_update", "admin_customer_update", "admin_create", "admin_password",
]
RATE_LIMITED = {429: {
    "model": ErrorResponse,
    "description": "Too many requests.",
    "headers": {
        "Retry-After": {"schema": {"type": "integer", "minimum": 1}, "description": "Seconds before retrying."},
    },
}}


def client_source(request: Request) -> str:
    # The ASGI server resolves trusted proxy chains before this code runs.
    try:
        address = ip_address(request.client.host if request.client else "")
    except ValueError:
        return "unknown"
    if isinstance(address, IPv6Address):
        if address.ipv4_mapped:
            return str(address.ipv4_mapped)
        return str(ip_network((address, 64), strict=False))
    return str(address)


def rate_limit(category: Category) -> params.Depends:
    def check(request: Request, settings: AppSettings, db: DatabaseSession) -> None:
        if settings.rate_limit_secret is None:  # Optional in local development only.
            return
        limit_category = category.removeprefix("admin_") if category in {"admin_customer_update", "admin_booking_cancel"} else category
        limit = getattr(settings, f"rate_limit_{limit_category}")
        window = settings.rate_limit_window_seconds
        now = int(datetime.now(UTC).timestamp())
        elapsed = now % window
        start = datetime.fromtimestamp(now - elapsed, UTC)
        key = bucket_key(settings.rate_limit_secret.get_secret_value(), f"api:{category}:{client_source(request)}")
        # Route dependencies run before identity checks and business transactions.
        with db.begin():
            allowed = take_attempt(db, key, start, limit)
        if not allowed:
            raise AppError(429, "rate_limited", "Too many requests. Please try again later.",
                           headers={"Retry-After": str(window - elapsed)})

    return Depends(check)

