import logging
from time import perf_counter
from uuid import uuid4

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.exceptions import unexpected_error_response
from app.core.request_id import request_id_context

logger = logging.getLogger(__name__)
STANDARD_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT"}


BOOKING_EVENTS = {
    ("POST", "/bookings"): "booking_create",
    ("POST", "/bookings/{booking_id}/cancel"): "booking_cancel",
    ("POST", "/admin/bookings/{booking_id}/cancel"): "booking_admin_cancel",
    ("PATCH", "/admin/bookings/{booking_id}/status"): "booking_status",
    ("POST", "/admin/bookings/{booking_id}/assign"): "booking_assign",
    ("POST", "/admin/bookings/{booking_id}/reassign"): "booking_reassign",
    ("POST", "/admin/bookings/{booking_id}/unassign"): "booking_unassign",
}


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp, api_prefix: str) -> None:
        self.app = app
        self.api_prefix = api_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        context_token = request_id_context.set(request_id)
        start = perf_counter()
        status_code = 500
        response_started = False

        async def send_response(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Referrer-Policy"] = "no-referrer"
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_response)
        except Exception:
            logger.error("request_failed", extra={"event": "request_failed", "request_id": request_id})
            if response_started:
                raise RuntimeError("Response transmission failed.") from None
            await unexpected_error_response(scope)(scope, receive, send_response)
        finally:
            request_id_context.reset(context_token)
            if scope["state"].get("client_disconnected"):
                status_code = 499
            route = scope.get("route")
            template = getattr(route, "path_format", None)
            prefix = f"{self.api_prefix}/"
            if template and scope["path"].startswith(prefix) and not template.startswith(prefix):
                template = self.api_prefix + template
            method = scope.get("method")
            error_code = scope["state"].get("error_code")
            booking_event = BOOKING_EVENTS.get((method, template.removeprefix(self.api_prefix))) if template else None
            event = "request"
            level = logging.INFO
            if error_code and error_code.startswith("database_"):
                event, level = "database_issue", logging.ERROR
            elif status_code >= 500:
                level = logging.ERROR
            elif status_code == 401:
                event, level = "authentication_failed", logging.WARNING
            elif status_code == 403:
                event, level = "authorization_failed", logging.WARNING
            elif status_code == 429:
                event, level = "rate_limited", logging.WARNING
            elif status_code < 300 and booking_event:
                event = booking_event
            logger.log(level, event, extra={
                "event": event,
                "request_id": request_id,
                "method": method if method in STANDARD_METHODS else "OTHER",
                "route": template or "unmatched",
                "status_code": status_code,
                "error_code": error_code,
                "duration_ms": round((perf_counter() - start) * 1000, 2),
            })
