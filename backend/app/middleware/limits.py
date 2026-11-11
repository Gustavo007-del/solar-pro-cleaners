from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.exceptions import error_response


class HostValidationMiddleware:
    def __init__(self, app: ASGIApp, allowed_hosts: list[str]) -> None:
        self.app = app
        self.allowed_hosts = frozenset(allowed_hosts)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            values = Headers(scope=scope).getlist("host")
            host, separator, port = (values[0] if len(values) == 1 else "").lower().partition(":")
            if host not in self.allowed_hosts or (separator and not (port.isascii() and port.isdecimal())):
                await error_response(scope, 400, "invalid_host", "The request host is not allowed.")(
                    scope, receive, send,
                )
                return
        await self.app(scope, receive, send)


class RequestSizeMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        lengths = Headers(scope=scope).getlist("content-length")
        if lengths:
            length = lengths[0]
            if len(lengths) != 1 or not length.isascii() or not length.isdecimal() or len(length) > 18:
                await error_response(scope, 400, "invalid_content_length", "Invalid request body length.")(
                    scope, receive, send,
                )
                return
            if int(length) > self.max_bytes:
                await self.reject(scope, receive, send)
                return

        # Hold a bounded body before routing so oversized streaming requests never run writes.
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                scope["state"]["client_disconnected"] = True
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_bytes:
                await self.reject(scope, receive, send)
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        buffered: Message | None = {"type": "http.request", "body": bytes(body), "more_body": False}

        async def replay() -> Message:
            nonlocal buffered
            if buffered is not None:
                message, buffered = buffered, None
                return message
            return await receive()

        await self.app(scope, replay, send)

    @staticmethod
    async def reject(scope: Scope, receive: Receive, send: Send) -> None:
        await error_response(scope, 413, "request_too_large", "The request body exceeds the size limit.")(
            scope, receive, send,
        )

