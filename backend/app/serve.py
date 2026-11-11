"""ASGI entry point for staging and production."""
import os

import uvicorn

from app.core.config import get_settings
from app.core.logging import configure_logging


def main() -> None:
    if os.environ.get("APP_ENVIRONMENT") not in {"staging", "production"}:
        raise SystemExit("Set APP_ENVIRONMENT to staging or production in the process environment.")
    settings = get_settings()
    configure_logging(settings)
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        workers=settings.web_workers,
        limit_concurrency=settings.web_concurrency,
        timeout_graceful_shutdown=settings.graceful_shutdown_seconds,
        proxy_headers=bool(settings.trusted_proxy_ips),
        forwarded_allow_ips=",".join(settings.trusted_proxy_ips),
        access_log=False,
        log_config=None,
        server_header=False,
    )


if __name__ == "__main__":
    main()

