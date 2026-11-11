import re
from collections.abc import Mapping

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DisconnectionError, IntegrityError, OperationalError, SQLAlchemyError, TimeoutError
from starlette.exceptions import HTTPException
from starlette.types import Scope

from app.schemas.common import ErrorDetail, ErrorResponse, ValidationIssue

HTTP_ERRORS = {
    400: ("bad_request", "The request could not be processed."),
    401: ("authentication_required", "Authentication is required."),
    403: ("forbidden", "You do not have permission to perform this action."),
    404: ("not_found", "The requested resource was not found."),
    405: ("method_not_allowed", "This method is not allowed for the resource."),
    409: ("conflict", "The request conflicts with the current state of the resource."),
    429: ("rate_limited", "Too many requests. Please try again later."),
}
FIELD_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_-]{0,63}")
VALIDATION_SOURCES = {"body", "query", "path", "header", "cookie"}


class AppError(Exception):
    """An intentional API failure with a static, client-safe message."""

    def __init__(
        self, status_code: int, code: str, message: str, *, headers: Mapping[str, str] | None = None
    ) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers


def error_response(
    scope: Scope,
    status_code: int,
    code: str,
    message: str,
    *,
    headers: Mapping[str, str] | None = None,
    details: list[ValidationIssue] | None = None,
) -> JSONResponse:
    state = scope.setdefault("state", {})
    state["error_code"] = code
    payload = ErrorResponse(error=ErrorDetail(
        code=code,
        message=message,
        request_id=state.get("request_id"),
        details=details,
    ))
    response_headers = {**(headers or {}), "Cache-Control": "no-store"}
    return JSONResponse(payload.model_dump(exclude_none=True), status_code=status_code, headers=response_headers)


def unexpected_error_response(scope: Scope) -> JSONResponse:
    return error_response(scope, 500, "internal_error", "An unexpected error occurred.")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError) -> JSONResponse:
        return error_response(request.scope, exc.status_code, exc.code, exc.message, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        issues = []
        for error in exc.errors()[:20]:
            location = error.get("loc", ())
            source = location[0] if location and location[0] in VALIDATION_SOURCES else "request"
            code = "required" if error.get("type") == "missing" else "invalid"
            field = None
            if source in {"body", "query", "path", "header"} and error.get("type") != "extra_forbidden":
                parts = location[1:]
                if parts and len(parts) <= 5 and all(
                    isinstance(part, int) or isinstance(part, str) and FIELD_NAME.fullmatch(part)
                    for part in parts
                ):
                    field = ".".join(map(str, parts))
            issues.append(ValidationIssue(source=source, code=code, field=field))
        return error_response(
            request.scope, 422, "validation_error",
            "Check the required fields and the format of your request.", details=issues,
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        code, message = HTTP_ERRORS.get(exc.status_code, ("http_error", "The request could not be completed."))
        return error_response(request.scope, exc.status_code, code, message, headers=exc.headers)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        if isinstance(exc, IntegrityError):
            return error_response(request.scope, 409, "conflict", "The request conflicts with existing data.")
        if isinstance(exc, (OperationalError, DisconnectionError, TimeoutError)):
            return error_response(request.scope, 503, "database_unavailable", "The database is temporarily unavailable.")
        return error_response(request.scope, 500, "database_error", "The database operation could not be completed.")
