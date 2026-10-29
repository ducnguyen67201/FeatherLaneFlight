"""Current machine authority for writes; current session/project access for reads."""

import hashlib
import json

from featherlane_contracts import CursorMeta, ErrorCode, FieldError
from featherlane_contracts.events import EventBatchReceipt, RunnerEventBatch
from featherlane_contracts.run_detail import RunEvent, RunEventPage, RunEventRecord
from pydantic import TypeAdapter
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.events.domain import (
    MAX_EVENTS_PER_RUN,
    EventCursors,
    EventProgress,
    advance,
    conflict,
)
from featherlane_api.modules.events.persistence import (
    EventAttemptRecord,
    EventRecord,
    EventStore,
    EventStreamRecord,
)
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.domain import effective_lease_expiry, require_fence
from featherlane_api.modules.runs.application import RunService
from featherlane_api.modules.runs.persistence import RunStore
from featherlane_api.modules.runs.presentation import timestamp
from featherlane_api.modules.runs.snapshots import admission_snapshot

_event = TypeAdapter(RunEvent)


class EventService:
    def __init__(
        self,
        session: AsyncSession,
        leases: LeaseService,
        runs: RunService,
        cursors: EventCursors,
    ):
        self.session = session
        self.leases = leases
        self.runs = runs
        self.cursors = cursors
        self.store = EventStore(session)

    async def ingest(
        self, credential: str, attempt_id: str, body: RunnerEventBatch
    ) -> EventBatchReceipt:
        # The HTTP boundary validates JSON and raw byte limits. Revalidate for
        # direct application callers before using a mutable Pydantic instance.
        body = RunnerEventBatch.model_validate_json(body.model_dump_json())
        failure = None
        result = None
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            run, attempt = await self.leases.load_attempt(runner, attempt_id)
            now = await self.leases.now()
            failure = self.leases.current_error(runner, run, attempt, now)
            if failure is None:
                expiry = effective_lease_expiry(
                    attempt.created_at, attempt.lease_expires_at
                )
                if run.cancellation_deadline_at is not None:
                    expiry = min(expiry, run.cancellation_deadline_at)
                require_fence(
                    current_lease_id=attempt.lease_id,
                    current_fencing_number=runner.fencing_number,
                    lease_id=body.lease_id,
                    fencing_number=body.fencing_number,
                    active=True,
                    expires_at=expiry,
                    now=now,
                )
                if body.events[0].attempt_id != attempt.id:
                    raise conflict()
                if (
                    attempt.manifest_accepted_at is None
                    or attempt.observed_manifest is None
                ):
                    raise ApiError(
                        409,
                        ErrorCode.VALIDATION_FAILED,
                        "Accept the startup manifest first.",
                    )
                manifest, _, trials = admission_snapshot(run)
                stream = await self.store.stream(run.id)
                progress_row = await self.store.attempt(attempt.id)
                latest = stream.last_position if stream else 0
                acknowledged = progress_row.last_sequence if progress_row else 0
                progress = (
                    EventProgress.model_validate(progress_row.progress)
                    if progress_row
                    else EventProgress()
                )
                existing = list(
                    (
                        await self.session.scalars(
                            select(EventRecord).where(
                                EventRecord.attempt_id == attempt.id,
                                or_(
                                    EventRecord.sequence.in_(
                                        [event.sequence for event in body.events]
                                    ),
                                    EventRecord.event_id.in_(
                                        [event.event_id for event in body.events]
                                    ),
                                ),
                            )
                        )
                    ).all()
                )
                sequences = {row.sequence: row for row in existing}
                identities = {row.event_id: row for row in existing}
                pending = []
                for event in body.events:
                    encoded = _event.dump_json(event)
                    digest = hashlib.sha256(encoded).hexdigest()
                    prior = sequences.get(event.sequence)
                    if prior is not None:
                        if prior.digest != digest or prior.payload != event.model_dump(
                            mode="json"
                        ):
                            raise conflict()
                        continue
                    if event.event_id in identities:
                        raise conflict()
                    if event.sequence != acknowledged + 1:
                        raise ApiError(
                            409,
                            ErrorCode.SEQUENCE_GAP,
                            "Event batch does not follow the acknowledged sequence.",
                            [
                                FieldError(
                                    field="events.sequence",
                                    code="expected_sequence",
                                    message=str(acknowledged + 1),
                                )
                            ],
                        )
                    if latest >= MAX_EVENTS_PER_RUN:
                        raise ApiError(
                            413,
                            ErrorCode.EVIDENCE_BUFFER_FULL,
                            "The bounded run event log is full.",
                        )
                    progress = advance(progress, event, manifest, trials)
                    latest += 1
                    acknowledged = event.sequence
                    pending.append(
                        EventRecord(
                            run_id=run.id,
                            position=latest,
                            attempt_id=attempt.id,
                            sequence=event.sequence,
                            event_id=event.event_id,
                            digest=digest,
                            payload=event.model_dump(mode="json"),
                            received_at=now,
                        )
                    )
                # All validation precedes persistence. Recheck actual authority
                # after the bounded reads so expiry cannot authorize a late batch.
                now = await self.leases.now()
                failure = self.leases.current_error(runner, run, attempt, now)
                if failure is None:
                    require_fence(
                        current_lease_id=attempt.lease_id,
                        current_fencing_number=runner.fencing_number,
                        lease_id=body.lease_id,
                        fencing_number=body.fencing_number,
                        active=True,
                        expires_at=expiry,
                        now=now,
                    )
                    if pending:
                        if stream is None:
                            stream = EventStreamRecord(
                                run_id=run.id, last_position=latest, retained_after=0
                            )
                            self.session.add(stream)
                        else:
                            stream.last_position = latest
                        if progress_row is None:
                            progress_row = EventAttemptRecord(
                                attempt_id=attempt.id,
                                last_sequence=acknowledged,
                                progress=progress.model_dump(),
                            )
                            self.session.add(progress_row)
                        else:
                            progress_row.last_sequence = acknowledged
                            progress_row.progress = progress.model_dump()
                        for row in pending:
                            row.received_at = now
                            self.session.add(row)
                        # Execution observations never decide evaluation, terminal
                        # completion, cleanup or capacity. Those remain P14/P17.
                        if (
                            any(event.type == "TRIAL_STARTED" for event in body.events)
                            and run.execution_state == "STARTING"
                        ):
                            run.execution_state = "RUNNING"
                    result = EventBatchReceipt(
                        attemptId=attempt.id,
                        acknowledgedSequence=acknowledged,
                        nextSequence=acknowledged + 1,
                    )
            await self.session.flush()
        # Preserve P13's committed expiry/NEEDS_CLEANUP before returning rejection.
        if failure is not None:
            raise failure
        if result is None:
            raise RuntimeError("Event ingestion produced no acknowledgment")
        return result

    async def read(
        self,
        principal: Principal,
        handle: str | None,
        run_id: str,
        after: str | None,
        limit: int,
    ) -> tuple[RunEventPage, str]:
        if not 1 <= limit <= 100:
            raise ValueError("Event pages must be bounded")
        async with self.session.begin():
            run = await RunStore(self.session).exact(run_id)
            await self.runs.authorize(principal, handle, run.project_id)
            run = await RunStore(self.session).exact(run_id, lock=True)
            stream = await self.store.stream(run.id)
            latest = stream.last_position if stream else 0
            floor = stream.retained_after if stream else 0
            position = (
                self.cursors.decode(run_id, after, floor=floor, latest=latest)
                if after
                else floor
            )
            rows = await self.store.page(run.id, position, limit)
            records = [
                RunEventRecord(
                    cursor=self.cursors.encode(run.id, row.position),
                    receivedAt=timestamp(row.received_at),
                    event=_event.validate_json(json.dumps(row.payload)),
                )
                for row in rows[:limit]
            ]
            resume = (
                records[-1].cursor if records else self.cursors.encode(run.id, position)
            )
            return RunEventPage(
                data=records,
                meta=CursorMeta(nextCursor=resume if len(rows) > limit else None),
            ), resume
