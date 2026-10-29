"""Append-only authenticated observations; summaries never add repeated counters."""

import json
from datetime import datetime

from featherlane_contracts import ErrorCode
from featherlane_contracts.cleanup import AttemptCleanupRequest
from featherlane_contracts.usage import AttemptUsageObservation, AttemptUsageSummary
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.leases.persistence import AttemptRecord, UsageReportRecord
from featherlane_api.modules.runners.application import stamp
from featherlane_api.modules.runners.persistence import RunnerRecord


def observation(row: UsageReportRecord) -> AttemptUsageObservation:
    value = AttemptUsageObservation.model_validate_json(json.dumps(row.payload))
    if (
        value.generation != row.generation
        or value.clock_session_id != row.clock_session_id
        or value.observed_elapsed_ms != row.observed_elapsed_ms
    ):
        raise RuntimeError("Stored usage provenance is inconsistent")
    return value


def summarize(
    latest: UsageReportRecord, best: UsageReportRecord | None
) -> AttemptUsageSummary:
    return AttemptUsageSummary(
        attemptId=latest.attempt_id,
        operationId=latest.operation_id,
        serverReceivedAt=stamp(latest.received_at),
        observation=observation(latest),
        maxObservedElapsedMs=best.observed_elapsed_ms if best else None,
        maxElapsedOperationId=best.operation_id if best else None,
    )


async def record_usage(
    session: AsyncSession,
    runner: RunnerRecord,
    attempt: AttemptRecord,
    body: AttemptCleanupRequest,
    now: datetime,
) -> AttemptUsageSummary | None:
    """Caller holds current runner/run/attempt locks and saves the cleanup receipt."""
    if body.usage is None:
        return None
    value = body.usage
    query = select(UsageReportRecord).where(UsageReportRecord.attempt_id == attempt.id)
    latest = await session.scalar(
        query.order_by(
            UsageReportRecord.received_at.desc(), UsageReportRecord.operation_id.desc()
        ).limit(1)
    )
    anchor = await session.scalar(
        query.where(UsageReportRecord.clock_session_id.is_not(None))
        .order_by(
            UsageReportRecord.received_at.desc(), UsageReportRecord.operation_id.desc()
        )
        .limit(1)
    )
    best = await session.scalar(
        query.where(UsageReportRecord.observed_elapsed_ms.is_not(None))
        .order_by(
            UsageReportRecord.observed_elapsed_ms.desc(),
            UsageReportRecord.received_at.desc(),
            UsageReportRecord.operation_id.desc(),
        )
        .limit(1)
    )
    conflict = latest is not None and latest.generation != value.generation
    if anchor is not None:
        previous = observation(anchor)
        conflict = (
            conflict
            or (
                value.clock_session_id is not None
                and value.clock_session_id != previous.clock_session_id
            )
            or (
                value.observed_started_at is not None
                and value.observed_started_at != previous.observed_started_at
            )
        )
    if (
        best is not None
        and value.interval_status == "CONFIRMED"
        and value.observed_elapsed_ms < best.observed_elapsed_ms
    ):
        conflict = True
    if conflict:
        raise ApiError(
            409,
            ErrorCode.IDEMPOTENCY_CONFLICT,
            "Usage generation, clock or confirmed interval conflicts.",
        )
    row = UsageReportRecord(
        runner_id=runner.id,
        operation_id=body.operation_id,
        attempt_id=attempt.id,
        project_id=runner.project_id,
        lease_id=attempt.lease_id,
        fencing_number=attempt.fencing_number,
        generation=value.generation,
        clock_session_id=value.clock_session_id,
        observed_elapsed_ms=value.observed_elapsed_ms,
        payload=value.model_dump(mode="json"),
        received_at=now,
    )
    session.add(row)
    if value.observed_elapsed_ms is not None and (
        best is None or value.observed_elapsed_ms >= best.observed_elapsed_ms
    ):
        best = row
    return summarize(row, best)


async def usage_summaries(
    session: AsyncSession,
    attempt_ids: list[str],
) -> dict[str, AttemptUsageSummary]:
    """Use only after existing run authorization; at most ten attempt summaries."""
    if not attempt_ids:
        return {}
    if len(attempt_ids) > 10:
        raise ValueError("Usage inspection is bounded to the run's attempt page")
    query = (
        select(UsageReportRecord)
        .where(UsageReportRecord.attempt_id.in_(attempt_ids))
        .distinct(UsageReportRecord.attempt_id)
    )
    latest = (
        await session.scalars(
            query.order_by(
                UsageReportRecord.attempt_id,
                UsageReportRecord.received_at.desc(),
                UsageReportRecord.operation_id.desc(),
            )
        )
    ).all()
    best = {
        row.attempt_id: row
        for row in (
            await session.scalars(
                query.where(
                    UsageReportRecord.observed_elapsed_ms.is_not(None)
                ).order_by(
                    UsageReportRecord.attempt_id,
                    UsageReportRecord.observed_elapsed_ms.desc(),
                    UsageReportRecord.received_at.desc(),
                    UsageReportRecord.operation_id.desc(),
                )
            )
        ).all()
    }
    return {row.attempt_id: summarize(row, best.get(row.attempt_id)) for row in latest}
