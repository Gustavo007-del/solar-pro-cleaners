import json
import logging
from datetime import UTC, datetime
from logging.config import dictConfig

from app.core.config import Settings

SAFE_EVENTS = {
    "startup", "shutdown", "request", "request_failed", "migration_failed", "database_issue",
    "authentication_failed", "authorization_failed", "rate_limited", "booking_create", "booking_cancel",
    "booking_admin_cancel", "booking_status", "booking_assign", "booking_reassign", "booking_unassign",
    "notification_worker_started", "notification_worker_stopped", "notification_campaigns_claimed",
    "notification_executions_finished", "notification_expo_send_failed", "notification_expo_receipt_failed",
    "notification_database_issue", "notification_cycle_failed",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        event = getattr(record, "event", None)

        payload = {
            "timestamp": datetime.fromtimestamp(
                record.created, UTC
            ).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "event": event if record.name.startswith("app.") and event in SAFE_EVENTS else "runtime",
            "message": record.getMessage(),
        }

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        if record.name.startswith("app."):
            for key in (
                "request_id",
                "method",
                "route",
                "status_code",
                "error_code",
                "duration_ms",
                "count",
            ):
                value = getattr(record, key, None)
                if value is not None:
                    payload[key] = value

        return json.dumps(payload, separators=(",", ":"))

def configure_logging(settings: Settings) -> None:
    dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"json": {"()": JsonFormatter}},
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "json"},
            "discard": {"class": "logging.NullHandler"},
        },
        "root": {"level": "WARNING", "handlers": ["console"]},
        "loggers": {
            "app": {
                "level": settings.log_level or ("DEBUG" if settings.debug else "INFO"),
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn": {"level": "INFO", "handlers": ["console"], "propagate": False},
            "uvicorn.error": {"level": "INFO", "handlers": ["console"], "propagate": False},
            "uvicorn.access": {"handlers": ["discard"], "propagate": False},
            "sqlalchemy": {"level": "WARNING", "handlers": ["console"], "propagate": False},
        },
    })
