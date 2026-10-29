"""HTTP error translation; never echo request input or exception context."""

import logging
import re
from collections.abc import Sequence

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from featherlane_contracts import ErrorBody, ErrorCode, ErrorEnvelope, FieldError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

ERROR_RESPONSES = {
    status: {"model": ErrorEnvelope, "description": description}
    for status, description in {
        400: "Invalid JSON or unsupported contract version",
        401: "Authentication required",
        403: "Access forbidden",
        404: "Resource not found",
        405: "Method not allowed",
        409: "State conflict",
        413: "JSON body exceeds configured limit",
        415: "JSON content type required",
        422: "Request validation failed",
        500: "Internal error",
    }.items()
}


class ApiError(Exception):
    """Messages/details must be application-owned text, never raw exception text."""

    def __init__(
        self,
        status: int,
        code: ErrorCode,
        message: str,
        details: Sequence[FieldError] = (),
    ) -> None:
        self.status = status
        self.code = code
        self.message = message
        self.details = list(details)


def error_response(request: Request, error: ApiError) -> JSONResponse:
    request_id: str = request.state.request_id
    envelope = ErrorEnvelope(
        error=ErrorBody(
            code=error.code,
            message=error.message,
            details=error.details,
            requestId=request_id,
        )
    )
    headers = {"X-Request-ID": request_id, "Cache-Control": "no-store"}
    if error.status == 429:
        headers["Retry-After"] = "5"
    return JSONResponse(
        status_code=error.status,
        content=envelope.model_dump(mode="json"),
        headers=headers,
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        return error_response(request, exc)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        if any(error["type"] == "json_invalid" for error in errors):
            return error_response(
                request,
                ApiError(
                    400, ErrorCode.INVALID_JSON, "The request body must be valid JSON."
                ),
            )
        details = []
        for error in errors[:50]:
            location = error.get("loc", ())
            # Dynamic keys/custom validator locations can contain input values.
            # Report only the known request section, never untrusted field paths.
            section = location[0] if location else "request"
            path = (
                section
                if section in {"body", "path", "query", "header", "cookie"}
                else "request"
            )
            code = re.sub(r"[^a-z0-9_]", "_", error["type"])[:64] or "invalid"
            details.append(
                FieldError(
                    field=path, code=code, message="The field is missing or invalid."
                )
            )
        return error_response(
            request,
            ApiError(
                422, ErrorCode.VALIDATION_FAILED, "Request validation failed.", details
            ),
        )

    @app.exception_handler(HTTPException)
    async def handle_http(request: Request, exc: HTTPException) -> JSONResponse:
        code, message = {
            401: (ErrorCode.UNAUTHENTICATED, "Authentication is required."),
            403: (ErrorCode.FORBIDDEN, "Access is forbidden."),
            404: (ErrorCode.NOT_FOUND, "The resource was not found."),
            405: (ErrorCode.METHOD_NOT_ALLOWED, "The method is not allowed."),
            413: (ErrorCode.PAYLOAD_TOO_LARGE, "The request body is too large."),
            415: (ErrorCode.UNSUPPORTED_MEDIA_TYPE, "A JSON content type is required."),
        }.get(
            exc.status_code,
            (ErrorCode.INTERNAL_ERROR, "The request could not be completed."),
        )
        response = error_response(request, ApiError(exc.status_code, code, message))
        for header in ("Allow", "WWW-Authenticate", "Retry-After"):
            if exc.headers and header in exc.headers:
                response.headers[header] = exc.headers[header]
        return response

    @app.exception_handler(ResponseValidationError)
    @app.exception_handler(Exception)
    async def handle_internal(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Request failed request_id=%s", request.state.request_id)
        return error_response(
            request,
            ApiError(
                500, ErrorCode.INTERNAL_ERROR, "The request could not be completed."
            ),
        )
