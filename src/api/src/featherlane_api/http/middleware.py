"""Bound untrusted JSON before parsing and keep correlation IDs server-owned."""

import json
import logging
import math
import re
from uuid import uuid4

from featherlane_contracts import CONTRACT_VERSION, ErrorCode
from featherlane_contracts.evidence import RUNNER_ARTIFACT_CONTENT_PATH
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from featherlane_api.config import ApiSettings
from featherlane_api.http.errors import ApiError, error_response

logger = logging.getLogger(__name__)
MAX_SAFE_INTEGER = 9_007_199_254_740_991
BINARY_UPLOAD = re.compile(
    re.escape(RUNNER_ARTIFACT_CONTENT_PATH).replace(
        re.escape("{artifactId}"), r"[A-Za-z0-9_-]{1,128}"
    )
)


def _integer(value: str) -> int:
    number = int(value)
    if abs(number) > MAX_SAFE_INTEGER:
        raise ValueError("Unsafe JSON integer")
    return number


def _float(value: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Non-finite JSON number")
    return number


def _constant(value: str) -> None:
    raise ValueError("Non-JSON numeric constant")


def _object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        key.encode("utf-8")
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def validate_json(body: bytes, max_depth: int) -> None:
    value = json.loads(
        body.decode("utf-8"),
        parse_int=_integer,
        parse_float=_float,
        parse_constant=_constant,
        object_pairs_hook=_object,
    )
    pending = [(value, 0)]
    while pending:
        item, depth = pending.pop()
        if isinstance(item, (dict, list)):
            if depth >= max_depth:
                raise ValueError("JSON nesting limit exceeded")
            children = item.values() if isinstance(item, dict) else item
            pending.extend((child, depth + 1) for child in children)
        elif isinstance(item, str):
            # Reject lone Unicode surrogates, which cannot be emitted as UTF-8 JSON.
            item.encode("utf-8")


class HttpBoundary:
    def __init__(self, app: ASGIApp, settings: ApiSettings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        request.state.request_id = uuid4().hex
        started = False

        async def send_response(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = [
                    (key, value)
                    for key, value in message.get("headers", [])
                    if key.lower() not in (b"x-request-id", b"cache-control")
                ]
                headers.extend(
                    [
                        (b"x-request-id", request.state.request_id.encode("ascii")),
                        (b"cache-control", b"no-store"),
                    ]
                )
                message = {**message, "headers": headers}
            await send(message)

        try:
            is_json_api = request.url.path.startswith("/api/v1/")
            is_meta = request.url.path == "/api/v1/meta"
            if is_json_api and not is_meta:
                versions = request.headers.getlist("x-flf-contract-version")
                if versions != [CONTRACT_VERSION]:
                    raise ApiError(
                        400,
                        ErrorCode.CONTRACT_VERSION_UNSUPPORTED,
                        "Refresh or upgrade to the supported contract version.",
                    )
            # Later binary/SSE routes retain stream ownership. Only JSON is buffered.
            media_type = (
                request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            )
            is_json = media_type == "application/json" or media_type.endswith("+json")
            has_body = (
                bool(request.headers.get("transfer-encoding"))
                or request.headers.get("content-length", "0") != "0"
            )
            binary_upload = request.method == "PUT" and BINARY_UPLOAD.fullmatch(
                request.url.path
            )
            if is_json_api and has_body and not is_json and not binary_upload:
                raise ApiError(
                    415,
                    ErrorCode.UNSUPPORTED_MEDIA_TYPE,
                    "A JSON content type is required.",
                )
            if is_json:
                receive = await self.buffer_json(request, receive)
            await self.app(scope, receive, send_response)
        except ApiError as exc:
            if started:
                raise RuntimeError("Response stream failed") from None
            await error_response(request, exc)(scope, receive, send_response)
        except Exception:
            # Do not log exception text/tracebacks: adapters can include SQL, secrets
            # or invalid response values. Log only the safe correlation information.
            logger.error("Request failed request_id=%s", request.state.request_id)
            if started:
                raise RuntimeError("Response stream failed") from None
            await error_response(
                request,
                ApiError(
                    500, ErrorCode.INTERNAL_ERROR, "The request could not be completed."
                ),
            )(scope, receive, send_response)

    async def buffer_json(self, request: Request, receive: Receive) -> Receive:
        lengths = request.headers.getlist("content-length")
        if len(lengths) > 1 or (lengths and not lengths[0].isascii()):
            raise ApiError(400, ErrorCode.INVALID_JSON, "Invalid JSON request framing.")
        if lengths:
            try:
                length = int(lengths[0])
            except ValueError:
                raise ApiError(
                    400, ErrorCode.INVALID_JSON, "Invalid JSON request framing."
                ) from None
            if length < 0:
                raise ApiError(
                    400, ErrorCode.INVALID_JSON, "Invalid JSON request framing."
                )
            if length > self.settings.max_json_bytes:
                raise ApiError(
                    413, ErrorCode.PAYLOAD_TOO_LARGE, "The JSON body is too large."
                )
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                raise ApiError(
                    400, ErrorCode.INVALID_JSON, "The JSON body was incomplete."
                )
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.settings.max_json_bytes:
                raise ApiError(
                    413, ErrorCode.PAYLOAD_TOO_LARGE, "The JSON body is too large."
                )
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        raw = bytes(body)
        try:
            validate_json(raw, self.settings.max_json_depth)
        except (ValueError, UnicodeError, RecursionError):
            raise ApiError(
                400,
                ErrorCode.INVALID_JSON,
                "The request body must be valid bounded UTF-8 JSON.",
            ) from None
        delivered = False

        async def replay() -> Message:
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": raw, "more_body": False}
            return await receive()

        return replay
