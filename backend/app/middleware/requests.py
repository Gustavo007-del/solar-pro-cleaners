import logging
from time import perf_counter
from uuid import uuid4

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.exceptions import unexpected_error_response

logger = logging.getLogger(__name__)
STANDARD_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT"}


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        start = perf_counter()
        status_code = 500
        response_started = False

        async def send_response(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
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
            route = getattr(scope.get("route"), "path_format", None)
            method = scope.get("method")
            logger.log(logging.ERROR if status_code >= 500 else logging.INFO, "request", extra={
                "event": "request",
                "request_id": request_id,
                "method": method if method in STANDARD_METHODS else "OTHER",
                "route": route or "unmatched",
                "status_code": status_code,
                "error_code": scope["state"].get("error_code"),
                "duration_ms": round((perf_counter() - start) * 1000, 2),
            })
