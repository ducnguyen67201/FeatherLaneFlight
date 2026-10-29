"""Cleanup diagnostics cannot revive attempts or grant execution capability."""

import json
from datetime import datetime

from featherlane_contracts import ErrorCode, ExecutionState, RunnerCapacityState
from featherlane_contracts.cleanup import (
    AttemptCleanupReceipt,
    AttemptCleanupRequest,
    RunnerRecoveryReceipt,
    RunnerRecoveryRequest,
)
from featherlane_contracts.registration import metadata_digest
from sqlalchemy import select

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.domain import StaleAttempt
from featherlane_api.modules.leases.persistence import CleanupReceiptRecord
from featherlane_api.modules.leases.usage_reporting import record_usage
from featherlane_api.modules.runners.domain import RunnerUnavailable


class CleanupService:
    def __init__(self, leases: LeaseService):
        self.leases = leases
        self.session = leases.session

    @staticmethod
    def fingerprint(body: AttemptCleanupRequest | RunnerRecoveryRequest) -> str:
        # Preserve pre-usage operation identity when the additive field is absent.
        fields = set(type(body).model_fields)
        if isinstance(body, AttemptCleanupRequest) and body.usage is None:
            fields.remove("usage")
        return metadata_digest(body, fields)

    async def replay(
        self,
        runner_id: str,
        attempt_id: str,
        kind: str,
        body: AttemptCleanupRequest | RunnerRecoveryRequest,
    ) -> CleanupReceiptRecord | None:
        row = await self.session.get(
            CleanupReceiptRecord, (runner_id, body.operation_id)
        )
        if row is not None and (
            row.attempt_id != attempt_id
            or row.kind != kind
            or row.request_digest != self.fingerprint(body)
        ):
            raise ApiError(
                409,
                ErrorCode.IDEMPOTENCY_CONFLICT,
                "Cleanup operation identity conflicts with its stored request.",
            )
        return row

    def save(
        self,
        runner_id: str,
        attempt_id: str,
        kind: str,
        body: AttemptCleanupRequest | RunnerRecoveryRequest,
        result: AttemptCleanupReceipt | RunnerRecoveryReceipt,
        now: datetime,
    ) -> None:
        self.session.add(
            CleanupReceiptRecord(
                runner_id=runner_id,
                operation_id=body.operation_id,
                attempt_id=attempt_id,
                kind=kind,
                request_digest=self.fingerprint(body),
                payload=result.model_dump(mode="json"),
                created_at=now,
            )
        )

    async def report(
        self, credential: str, attempt_id: str, body: AttemptCleanupRequest
    ) -> AttemptCleanupReceipt:
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            previous = await self.replay(runner.id, attempt_id, "CLEANUP", body)
            if previous is not None:
                return AttemptCleanupReceipt.model_validate_json(
                    json.dumps(previous.payload)
                )
            run, attempt = await self.leases.load_attempt(runner, attempt_id)
            if (
                body.lease_id != attempt.lease_id
                or body.fencing_number != attempt.fencing_number
                or runner.fencing_number != attempt.fencing_number
            ):
                raise StaleAttempt()
            now = await self.leases.now()
            failure = self.leases.current_error(runner, run, attempt, now)
            diagnostic_only = attempt.finished_at is not None
            if not diagnostic_only and failure is not None:
                raise failure
            if not diagnostic_only:
                canceled = run.cancellation_requested_at is not None
                if canceled:
                    code = (
                        "CANCELED_CONFIRMED"
                        if body.cleanup_confirmed
                        else "CANCELLATION_UNCONFIRMED"
                    )
                else:
                    code = body.reason
                reason = {
                    "code": code,
                    "message": "Owned child and process-group cleanup reported."
                    if body.cleanup_confirmed
                    else "Owned process cleanup is unconfirmed.",
                }
                attempt.finished_at, attempt.terminal_reason = now, reason
                run.execution_state = (
                    "CANCELED" if canceled and body.cleanup_confirmed else "ERROR"
                )
                run.evaluation_outcome = "NOT_EVALUATED"
                run.finished_at, run.terminal_reason = now, reason
                # A fixed stand-in/protocol declaration never establishes readiness.
                runner.capacity_state = (
                    "DISABLED" if body.cleanup_confirmed else "NEEDS_CLEANUP"
                )
            result = AttemptCleanupReceipt(
                operationId=body.operation_id,
                attemptId=attempt.id,
                executionState=ExecutionState(run.execution_state),
                capacityState=RunnerCapacityState(runner.capacity_state),
                cleanupConfirmed=body.cleanup_confirmed,
                diagnosticOnly=diagnostic_only,
                usage=await record_usage(self.session, runner, attempt, body, now),
            )
            self.save(runner.id, attempt.id, "CLEANUP", body, result, now)
            await self.session.flush()
            return result

    async def recover(
        self, credential: str, body: RunnerRecoveryRequest
    ) -> RunnerRecoveryReceipt:
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            previous = await self.replay(runner.id, body.attempt_id, "RECOVERY", body)
            if previous is not None:
                return RunnerRecoveryReceipt.model_validate_json(
                    json.dumps(previous.payload)
                )
            _, attempt = await self.leases.load_attempt(runner, body.attempt_id)
            if (
                body.lease_id != attempt.lease_id
                or body.fencing_number != attempt.fencing_number
                or runner.fencing_number != attempt.fencing_number
            ):
                raise StaleAttempt()
            proof = await self.session.get(
                CleanupReceiptRecord, (runner.id, body.cleanup_operation_id)
            )
            latest = await self.session.scalar(
                select(CleanupReceiptRecord.operation_id)
                .where(
                    CleanupReceiptRecord.runner_id == runner.id,
                    CleanupReceiptRecord.attempt_id == attempt.id,
                    CleanupReceiptRecord.kind == "CLEANUP",
                )
                .order_by(
                    CleanupReceiptRecord.created_at.desc(),
                    CleanupReceiptRecord.operation_id.desc(),
                )
                .limit(1)
            )
            if (
                proof is None
                or latest != body.cleanup_operation_id
                or proof.kind != "CLEANUP"
                or proof.attempt_id != attempt.id
                or not AttemptCleanupReceipt.model_validate_json(
                    json.dumps(proof.payload)
                ).cleanup_confirmed
                or attempt.finished_at is None
                or runner.capacity_state != "NEEDS_CLEANUP"
                or await self.leases.store.active_for_runner(runner.id) is not None
            ):
                raise RunnerUnavailable()
            # Recover capacity only; terminal records are protected by DB trigger.
            runner.capacity_state = "DISABLED"
            runner.last_seen_at = await self.leases.now()
            result = RunnerRecoveryReceipt(
                operationId=body.operation_id,
                attemptId=attempt.id,
                runnerId=runner.id,
                capacityState="DISABLED",
            )
            self.save(
                runner.id, attempt.id, "RECOVERY", body, result, runner.last_seen_at
            )
            await self.session.flush()
            return result
