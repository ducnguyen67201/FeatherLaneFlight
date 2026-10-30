"""Durable packet preparation, judge invocation and strict evidence citation guards."""

import asyncio
import hashlib
import json

from featherlane_contracts import CheckOutcome, EvaluationOutcome, TrialExecutionState
from featherlane_contracts.finalization import FinalizedTrial
from featherlane_contracts.judging import JudgeResponse, PublishedJudgeRubric
from featherlane_contracts.registration import metadata_digest
from featherlane_contracts.run_detail import CheckResult, ExecutionManifest, TrialView
from featherlane_contracts.suites import SuiteRevisionView
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.infrastructure.database import Database
from featherlane_api.modules.evaluation.evidence import (
    ValidatedArtifact,
    contains_observation,
    validate_artifact,
)
from featherlane_api.modules.evaluation.judge_prompt import INSTRUCTIONS, PROMPT_VERSION
from featherlane_api.modules.evaluation.judge_provider import (
    JudgeProvider,
    JudgeUnavailable,
)
from featherlane_api.modules.evaluation.judge_store import JudgeRecord
from featherlane_api.modules.evaluation.rules import aggregate
from featherlane_api.modules.evidence.persistence import EvidenceStore
from featherlane_api.modules.evidence.storage import LocalPrivateArtifactStorage
from featherlane_api.modules.finalization.persistence import FinalizationRecord
from featherlane_api.modules.leases.persistence import AttemptRecord
from featherlane_api.modules.runners.persistence import RunnerStore
from featherlane_api.modules.runs.persistence import RunRecord, RunStore
from featherlane_api.modules.runs.snapshots import admission_snapshot


def digest(value: dict) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
        ).encode()
    ).hexdigest()


def packet_for(
    saved: FinalizationRecord,
    suite: SuiteRevisionView,
    manifest: ExecutionManifest,
    trial: TrialView,
    submitted: FinalizedTrial,
    artifacts: dict[str, ValidatedArtifact],
) -> dict:
    rubric = PublishedJudgeRubric.model_validate(saved.inputs["judgePolicy"]["rubric"])
    if (
        metadata_digest(rubric) != saved.inputs["judgePolicy"]["digest"]
        or rubric.definition_digest != suite.digest
    ):
        raise JudgeUnavailable("Rubric identity mismatch")
    scenario = next(s for s in suite.scenarios if s.id == trial.scenario_id)
    checks = [c for c in suite.checks if c.id in scenario.check_ids]
    if {(c.check_id, c.check_version) for c in rubric.criteria} != {
        (c.id, c.version) for c in suite.checks
    }:
        raise JudgeUnavailable("Rubric coverage mismatch")
    events = [e for e in saved.inputs["events"] if e["trialId"] == trial.id]
    observations, gaps = [], {}
    applicable = [
        artifacts[i]
        for i in submitted.artifact_ids
        if i in artifacts and artifacts[i].trial_id == trial.id
    ]
    kinds = {a.kind for a in applicable}
    for check in checks:
        candidates = [o for o in trial.observation_summary if o.check_id == check.id]
        observation = candidates[0] if len(candidates) == 1 else None
        valid = (
            manifest.runtime_family == "SYNTHETIC"
            and observation is not None
            and observation.check_version == check.version
            and observation.unit == check.unit
            and observation.key == check.id
            and observation.source_clock == "MONOTONIC"
            and observation.sample_count == 1
            and observation.artifact_ids
            and all(i in artifacts for i in observation.artifact_ids)
            and set(check.required_evidence_kinds).union(manifest.evidence_policy)
            <= kinds
            and any(
                a.id in observation.artifact_ids
                and contains_observation(a, observation)
                for a in applicable
                if a.kind == "OBSERVATIONS"
            )
        )
        if valid:
            observations.append(observation.model_dump(mode="json"))
        else:
            gaps[check.id] = (
                "Required same-trial observation or evidence is unavailable."
            )
    return dict(
        version=1,
        attemptId=trial.attempt_id,
        trialId=trial.id,
        mission=dict(
            title=suite.title,
            description=suite.description,
            scenario=scenario.model_dump(mode="json"),
        ),
        rubric=rubric.model_dump(mode="json"),
        checks=[c.model_dump(mode="json") for c in checks],
        observations=observations,
        events=events,
        artifacts=[dict(id=a.id, kind=a.kind, sha256=a.sha256) for a in applicable],
        evidenceGaps=gaps,
        omissions=["Raw ULog and raw process logs are not supplied or interpreted."],
    )


def validate_response(packet: dict, response: JudgeResponse) -> None:
    expected = {(c["id"], c["version"]) for c in packet["checks"]}
    found = [(r.check_id, r.check_version) for r in response.results]
    if len(found) != len(set(found)) or set(found) != expected:
        raise JudgeUnavailable("Judge criterion coverage mismatch")
    events = {e["eventId"]: e for e in packet["events"]}
    artifacts = {a["id"] for a in packet["artifacts"]}
    starts = [
        e["monotonicElapsedMs"] for e in events.values() if e["type"] == "TRIAL_STARTED"
    ]
    ends = [
        e["monotonicElapsedMs"]
        for e in events.values()
        if e["type"] == "TRIAL_FINISHED"
    ]
    for result in response.results:
        if not result.finding.strip():
            raise JudgeUnavailable("Empty judge finding")
        if result.outcome != CheckOutcome.INCONCLUSIVE and (
            result.check_id in packet["evidenceGaps"] or not result.references
        ):
            raise JudgeUnavailable("Unsupported judge verdict")
        observation = next(
            (o for o in packet["observations"] if o["checkId"] == result.check_id), None
        )
        for ref in result.references:
            if (
                not set(ref.event_ids) <= events.keys()
                or not set(ref.artifact_ids) <= artifacts
            ):
                raise JudgeUnavailable("Unbound judge citation")
            if (
                len(starts) != 1
                or len(ends) != 1
                or not starts[0] <= ref.from_ms <= ref.to_ms <= ends[0]
            ):
                raise JudgeUnavailable("Judge citation outside trial bounds")
            if ref.kind == "FAILURE_WINDOW" and result.outcome != CheckOutcome.FAIL:
                raise JudgeUnavailable("Failure window requires failed criterion")
            cited = [events[i] for i in ref.event_ids]
            if ref.kind == "EVENT" and any(
                e["monotonicElapsedMs"] != ref.from_ms for e in cited
            ):
                raise JudgeUnavailable("Event citation clock mismatch")
            if not any(
                ref.from_ms <= e["monotonicElapsedMs"] <= ref.to_ms for e in cited
            ):
                raise JudgeUnavailable("No cited event supports interval")
            supports_criterion = (
                observation is not None
                and ref.from_ms <= observation["monotonicElapsedMs"] <= ref.to_ms
                and (
                    any(
                        e["type"] == "OBSERVATION_RECORDED"
                        and e["payload"]["observationId"] == observation["id"]
                        and ref.from_ms <= e["monotonicElapsedMs"] <= ref.to_ms
                        for e in cited
                    )
                    or set(ref.artifact_ids).intersection(observation["artifactIds"])
                )
            )
            # Each verdict citation needs temporal support; another valid
            # reference cannot legitimize an unsupported highlighted window.
            if result.outcome != CheckOutcome.INCONCLUSIVE and not supports_criterion:
                raise JudgeUnavailable(
                    "Missing criterion evidence in citation interval"
                )


class JudgeEvaluator:
    def __init__(
        self,
        database: Database,
        storage: LocalPrivateArtifactStorage,
        provider: JudgeProvider | None = None,
    ):
        self.database, self.storage = database, storage
        self.provider = provider or JudgeProvider()

    async def eligible(
        self,
        session: AsyncSession,
        saved: FinalizationRecord,
        attempt: AttemptRecord,
        run: RunRecord,
    ) -> bool:
        now = await session.scalar(select(func.clock_timestamp()))
        runner = await RunnerStore(session).by_id(attempt.runner_id)
        return (
            saved.terminal is None
            and saved.deadline_at > now
            and run.cancellation_requested_at is None
            and run.execution_state == "FINALIZING"
            and attempt.finished_at is None
            and runner is not None
            and runner.revoked_at is None
            and runner.fencing_number == attempt.fencing_number
        )

    async def prepare(self, attempt_id: str) -> None:
        from featherlane_contracts.finalization import FinalizationRequest

        from featherlane_api.modules.finalization.processing import TRIALS

        config = self.provider.config
        if config is None or not config.enabled:
            raise JudgeUnavailable("LLM judge is disabled or unconfigured")
        async with self.database.session_factory() as session, session.begin():
            saved = await session.get(FinalizationRecord, attempt_id)
            if saved is None or "judgePolicy" not in saved.inputs:
                raise JudgeUnavailable("Missing sealed judge policy")
            attempt = await session.get(AttemptRecord, attempt_id)
            run = await RunStore(session).exact(attempt.run_id)
            if not await self.eligible(session, saved, attempt, run):
                return
            manifest, suite, _ = admission_snapshot(run)
            body = FinalizationRequest.model_validate(saved.inputs["request"])
            trials = TRIALS.validate_json(json.dumps(saved.inputs["trials"]))
            if len(trials) > config.max_judged_trials:
                raise JudgeUnavailable("Judge trial budget exceeded")
            now = await session.scalar(select(func.clock_timestamp()))
            records = {}
            for item in body.trials:
                for identity in item.artifact_ids:
                    artifact = await EvidenceStore(session).exact(identity)
                    if artifact and (
                        artifact.project_id,
                        artifact.run_id,
                        artifact.attempt_id,
                        artifact.runner_id,
                        artifact.trial_id,
                    ) == (
                        run.project_id,
                        run.id,
                        attempt.id,
                        attempt.runner_id,
                        item.id,
                    ):
                        records[identity] = artifact
        validated = {}
        for identity, artifact in records.items():
            value = await asyncio.to_thread(
                validate_artifact, artifact, self.storage, now
            )
            if value is not None:
                validated[identity] = value
        submitted = {t.id: t for t in body.trials}
        packets = [
            packet_for(saved, suite, manifest, t, submitted[t.id], validated)
            for t in trials
            if t.execution_state == TrialExecutionState.COMPLETED
        ]
        if any(len(json.dumps(p).encode()) > config.max_packet_bytes for p in packets):
            raise JudgeUnavailable("Judge input byte budget exceeded")
        async with self.database.session_factory() as session, session.begin():
            current = await session.scalar(
                select(FinalizationRecord)
                .where(FinalizationRecord.attempt_id == attempt_id)
                .with_for_update()
            )
            attempt = await session.get(AttemptRecord, attempt_id)
            run = await RunStore(session).exact(attempt.run_id)
            if not await self.eligible(session, current, attempt, run):
                return
            for packet in packets:
                existing = await session.get(
                    JudgeRecord, (packet["trialId"], attempt_id)
                )
                if existing is None:
                    identity = dict(
                        attemptId=attempt_id,
                        trialId=packet["trialId"],
                        engine="llm-judge-v1",
                        rubricDigest=current.inputs["judgePolicy"]["digest"],
                        packetDigest=digest(packet),
                        promptVersion=PROMPT_VERSION,
                        promptDigest=hashlib.sha256(INSTRUCTIONS.encode()).hexdigest(),
                        provider=config.provider,
                        model=config.model,
                    )
                    session.add(
                        JudgeRecord(
                            trial_id=packet["trialId"],
                            attempt_id=attempt_id,
                            packet=packet,
                            identity={
                                **identity,
                                "configuration": config.model_dump(
                                    exclude={"enabled", "api_key_file"}
                                ),
                            },
                            response=None,
                        )
                    )

    async def invoke(self, attempt_id: str) -> None:
        async with self.database.session_factory() as session, session.begin():
            rows = list(
                await session.scalars(
                    select(JudgeRecord)
                    .where(JudgeRecord.attempt_id == attempt_id)
                    .order_by(JudgeRecord.trial_id)
                )
            )
        for row in rows:
            if row.response is not None:
                continue
            async with self.database.session_factory() as session, session.begin():
                saved = await session.get(FinalizationRecord, attempt_id)
                attempt = await session.get(AttemptRecord, attempt_id)
                run = await RunStore(session).exact(attempt.run_id)
                if not await self.eligible(session, saved, attempt, run):
                    return
                now = await session.scalar(select(func.clock_timestamp()))
                if (
                    self.provider.config is None
                    or (saved.deadline_at - now).total_seconds()
                    < self.provider.config.timeout_seconds
                ):
                    raise JudgeUnavailable("Insufficient judge processing budget")
            if (
                row.identity["packetDigest"] != digest(row.packet)
                or row.identity["promptDigest"]
                != hashlib.sha256(INSTRUCTIONS.encode()).hexdigest()
            ):
                raise JudgeUnavailable("Judge input identity mismatch")
            response = await self.provider.judge(
                row.packet, row.identity["configuration"]
            )
            validate_response(row.packet, response)
            async with self.database.session_factory() as session, session.begin():
                current = await session.scalar(
                    select(JudgeRecord)
                    .where(
                        JudgeRecord.attempt_id == attempt_id,
                        JudgeRecord.trial_id == row.trial_id,
                    )
                    .with_for_update()
                )
                if current.response is None:
                    current.response = response.model_dump(mode="json")


async def apply_judgments(
    session: AsyncSession,
    attempt_id: str,
    trials: list[TrialView],
    artifacts: dict[str, ValidatedArtifact],
    *,
    stale: bool = False,
) -> list[TrialView]:
    for trial in trials:
        if trial.execution_state != TrialExecutionState.COMPLETED:
            continue
        row = await session.get(JudgeRecord, (trial.id, attempt_id))
        if row is None or row.response is None:
            raise JudgeUnavailable("Missing accepted judge response")
        if row.identity["packetDigest"] != digest(row.packet):
            raise JudgeUnavailable("Judge packet digest mismatch")
        response = JudgeResponse.model_validate_json(json.dumps(row.response))
        validate_response(row.packet, response)
        trial_stale = stale or any(
            a["id"] not in artifacts or artifacts[a["id"]].sha256 != a["sha256"]
            for a in row.packet["artifacts"]
        )
        trial.check_results = []
        for result in response.results:
            observation = next(
                (o for o in trial.observation_summary if o.check_id == result.check_id),
                None,
            )
            trial.check_results.append(
                CheckResult(
                    checkId=result.check_id,
                    outcome=CheckOutcome.INCONCLUSIVE
                    if trial_stale
                    else result.outcome,
                    observationId=observation.id if observation else None,
                    artifactIds=observation.artifact_ids if observation else [],
                    summary="Evidence became unavailable before commit."
                    if trial_stale
                    else result.finding,
                )
            )
        trial.evaluation_outcome = EvaluationOutcome(
            aggregate([r.outcome.value for r in trial.check_results])
        )
    return trials
