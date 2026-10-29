"""One authenticated route negotiates JSON pages or bounded resumable SSE."""

import asyncio
import time
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request
from featherlane_contracts import (
    ContractVersion,
    Cursor,
    ErrorCode,
    ErrorEnvelope,
    Identifier,
)
from featherlane_contracts.events import (
    MAX_BATCH_BYTES,
    RUNNER_ATTEMPT_EVENTS_PATH,
    EventBatchEnvelope,
    RunEventMessage,
    RunnerEventBatch,
    StreamResetMessage,
)
from featherlane_contracts.run_detail import RunEventPage
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse
from starlette.types import Receive, Scope, Send

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES, ApiError
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.events.application import EventService
from featherlane_api.modules.events.domain import EventCursors
from featherlane_api.modules.identity.dependencies import get_principal, session_handle
from featherlane_api.modules.identity.domain import (
    AuthenticationRequired,
    Principal,
    SessionExpired,
)
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.http import get_service as get_lease_service
from featherlane_api.modules.runners.http import machine_credential
from featherlane_api.modules.runs.application import RunService
from featherlane_api.modules.runs.http import get_service as get_run_service

router = APIRouter(responses=ERROR_RESPONSES)


class EventStreamResponse(StreamingResponse):
    """Release capacity even if cancellation precedes the generator's first read."""

    def __init__(self, content: AsyncIterator[str], slots: asyncio.BoundedSemaphore):
        super().__init__(
            content,
            media_type="text/event-stream",
            headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
        )
        self.slots = slots

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            self.slots.release()


def get_service(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    leases: Annotated[LeaseService, Depends(get_lease_service)],
    runs: Annotated[RunService, Depends(get_run_service)],
) -> EventService:
    return EventService(
        session,
        leases,
        runs,
        EventCursors(request.app.state.settings.session_hash_key.get_secret_value()),
    )


Service = Annotated[EventService, Depends(get_service)]
Contract = Annotated[ContractVersion, Header(alias="x-flf-contract-version")]
RunId = Annotated[Identifier, Path(alias="runId")]
AttemptId = Annotated[Identifier, Path(alias="attemptId")]


@router.post(
    RUNNER_ATTEMPT_EVENTS_PATH,
    operation_id="appendRunnerEvents",
    response_model=EventBatchEnvelope,
)
async def append_events(
    request: Request,
    attempt_id: AttemptId,
    body: RunnerEventBatch,
    credential: Annotated[str, Depends(machine_credential)],
    service: Service,
    contract: Contract,
) -> EventBatchEnvelope:
    if len(await request.body()) > MAX_BATCH_BYTES:
        raise ApiError(413, ErrorCode.PAYLOAD_TOO_LARGE, "Event batch exceeds 256 KiB.")
    return EventBatchEnvelope(data=await service.ingest(credential, attempt_id, body))


@router.get(
    "/api/v1/runs/{runId}/events",
    operation_id="getRunEvents",
    response_model=RunEventPage,
    responses={
        410: {"model": ErrorEnvelope, "description": "Resume cursor expired"},
        429: {"model": ErrorEnvelope, "description": "Stream connection limit reached"},
    },
    openapi_extra={
        "x-flf-stream-accept": "text/event-stream",
        "x-flf-stream-message": {"$ref": "#/components/schemas/BrowserStreamMessage"},
    },
)
async def get_events(
    request: Request,
    run_id: RunId,
    principal: Annotated[Principal, Depends(get_principal)],
    service: Service,
    contract: Contract,
    after: Annotated[Cursor | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    last_event_id: Annotated[Cursor | None, Header(alias="Last-Event-ID")] = None,
):
    qualities = {"application/json": 0.0, "text/event-stream": 0.0}
    for part in request.headers.get("accept", "application/json").split(","):
        media, *parameters = part.strip().lower().split(";")
        quality = 1.0
        for parameter in parameters:
            if parameter.strip().startswith("q="):
                try:
                    quality = float(parameter.strip()[2:])
                except ValueError:
                    quality = 0.0
        if not 0 <= quality <= 1:
            quality = 0.0
        for supported in qualities:
            if media.strip() in (supported, "*/*"):
                qualities[supported] = max(qualities[supported], quality)
    streaming = qualities["text/event-stream"] > qualities["application/json"]
    if len(request.headers.getlist("Last-Event-ID")) > 1 or (
        after and last_event_id and after != last_event_id
    ):
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, "Conflicting resume cursors.")
    cursor = after or (last_event_id if streaming else None)
    handle = session_handle(request)
    page, resume = await service.read(principal, handle, run_id, cursor, limit)
    if not streaming:
        return page
    slots: asyncio.BoundedSemaphore = request.app.state.event_stream_slots
    if slots.locked():
        raise ApiError(429, ErrorCode.RATE_LIMITED, "Retry the bounded stream shortly.")
    await slots.acquire()

    async def messages():
        nonlocal page, resume
        started = time.monotonic()
        while True:
            for record in page.data:
                if await request.is_disconnected():
                    return
                message = RunEventMessage(
                    schemaVersion=1, type="RUN_EVENT", record=record
                )
                yield f"id: {record.cursor}\ndata: {message.model_dump_json()}\n\n"
            if await request.is_disconnected() or time.monotonic() - started >= 30:
                return
            if page.meta.next_cursor is None:
                yield ": heartbeat\n\n"
                await asyncio.sleep(1)
            try:
                # Reauthorize every read; no DB transaction or auth lock is
                # held while sleeping or waiting on a slow stream consumer.
                page, resume = await service.read(
                    principal, handle, run_id, resume, limit
                )
            except ApiError as error:
                if error.code == ErrorCode.CURSOR_EXPIRED:
                    reset = StreamResetMessage(
                        schemaVersion=1,
                        type="STREAM_RESET",
                        reason="CURSOR_EXPIRED",
                    )
                    yield f"data: {reset.model_dump_json()}\n\n"
                return
            except (AuthenticationRequired, SessionExpired, AccessNotFound):
                # Never emit resource data after access loss. Reconnect gets
                # the canonical HTTP auth response before the next stream.
                return

    return EventStreamResponse(messages(), slots)
