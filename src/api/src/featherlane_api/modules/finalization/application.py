"""Authenticated atomic handoff; receipt recovery never reopens runner authority."""

import json
from datetime import timedelta

from dbos import DBOSClient
from featherlane_contracts.finalization import (
    FinalizationAcceptance,
    FinalizationRequest,
    FinalizationStatus,
)
from featherlane_contracts.judging import PublishedJudgeRubric
from featherlane_contracts.registration import metadata_digest
from sqlalchemy import select

from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.events.persistence import EventRecord
from featherlane_api.modules.finalization.persistence import FinalizationRecord
from featherlane_api.modules.finalization.validation import validate_inputs
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.domain import effective_lease_expiry, require_fence
from featherlane_api.modules.runners.application import stamp
from featherlane_api.modules.runners.domain import RunnerConflict
from featherlane_api.modules.runs.persistence import RunStore
from featherlane_api.modules.suites.rubric_store import PublishedRubricRecord
from featherlane_api.workflows.runtime import enqueue

PROCESSING_SECONDS = 300


class FinalizationService:
    def __init__(self, leases: LeaseService, client: DBOSClient):
        self.leases, self.client = leases, client
        self.session = leases.session

    async def accept(
        self, credential: str, attempt_id: str, body: FinalizationRequest
    ) -> FinalizationAcceptance:
        body = FinalizationRequest.model_validate_json(body.model_dump_json())
        digest = metadata_digest(body)
        failure = None
        result = None
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            run, attempt = await self.leases.load_attempt(runner, attempt_id)
            saved = await self.session.get(FinalizationRecord, attempt_id)
            collision = await self.session.scalar(
                select(FinalizationRecord).where(
                    FinalizationRecord.runner_id == runner.id,
                    FinalizationRecord.operation_id == body.operation_id,
                )
            )
            if saved is not None:
                if (
                    saved.operation_id != body.operation_id
                    or saved.input_digest != digest
                ):
                    raise RunnerConflict()
                result = FinalizationAcceptance.model_validate(saved.acceptance)
            elif collision is not None:
                raise RunnerConflict()
            else:
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
                    trials = await validate_inputs(self.leases, run, attempt, body)
                    # Evidence row locks and history validation may wait. A stale
                    # pre-validation clock must not authorize the handoff.
                    now = await self.leases.now()
                    failure = self.leases.current_error(runner, run, attempt, now)
                    if failure is None:
                        deadline = now + timedelta(seconds=PROCESSING_SECONDS)
                        result = FinalizationAcceptance(
                            operationId=body.operation_id,
                            attemptId=attempt.id,
                            inputDigest=digest,
                            evaluatorVersion="1",
                            acceptedAt=stamp(now),
                            deadlineAt=stamp(deadline),
                        )
                        rubric_row = await self.session.get(
                            PublishedRubricRecord, run.suite_revision_id
                        )
                        policy = None
                        events = []
                        if rubric_row is not None:
                            rubric = PublishedJudgeRubric.model_validate(
                                rubric_row.rubric
                            )
                            if (
                                rubric.definition_digest != run.suite_snapshot["digest"]
                                or metadata_digest(rubric) != rubric_row.digest
                            ):
                                raise RuntimeError("Invalid published rubric binding")
                            policy = {
                                "rubric": rubric.model_dump(mode="json"),
                                "digest": rubric_row.digest,
                            }
                            events = list(
                                await self.session.scalars(
                                    select(EventRecord.payload)
                                    .where(EventRecord.attempt_id == attempt.id)
                                    .order_by(EventRecord.sequence)
                                    .limit(10001)
                                )
                            )
                            if len(events) > 10000:
                                raise RunnerConflict()
                        self.session.add(
                            FinalizationRecord(
                                attempt_id=attempt.id,
                                runner_id=runner.id,
                                operation_id=body.operation_id,
                                input_digest=digest,
                                inputs={
                                    **(
                                        {"judgePolicy": policy, "events": events}
                                        if policy is not None
                                        else {}
                                    ),
                                    "request": body.model_dump(mode="json"),
                                    "trials": [
                                        t.model_dump(mode="json") for t in trials
                                    ],
                                },
                                acceptance=result.model_dump(mode="json"),
                                accepted_at=now,
                                deadline_at=deadline,
                                terminal=None,
                            )
                        )
                        attempt.finalization_accepted_at = now
                        run.execution_state = "FINALIZING"
                        RunStore(self.session).audit(
                            run, run.actor_id, "FINALIZATION_ACCEPTED", now
                        )
                        await self.session.flush()
                        await enqueue(
                            self.client,
                            self.session,
                            attempt.id,
                            judge=policy is not None,
                        )
            await self.session.flush()
        if failure is not None:
            raise failure
        if result is None:
            raise RuntimeError("Finalization produced no acceptance")
        return result

    async def status(self, credential: str, attempt_id: str) -> FinalizationStatus:
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            await self.leases.load_attempt(runner, attempt_id)
            saved = await self.session.get(FinalizationRecord, attempt_id)
            if saved is None:
                raise AccessNotFound()
            return FinalizationStatus.model_validate_json(
                json.dumps(
                    {
                        "acceptance": saved.acceptance,
                        "state": "FINISHED" if saved.terminal else "ACCEPTED",
                        "terminal": saved.terminal,
                    }
                )
            )
