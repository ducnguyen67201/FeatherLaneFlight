"""Versioned rubric companions and evidence-linked LLM judgments.

Legacy suite/check/result definitions intentionally retain their original bytes.
"""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from featherlane_contracts import (
    CheckOutcome,
    Digest,
    Identifier,
    SuccessEnvelope,
    WireModel,
)
from featherlane_contracts.run_detail import Description
from featherlane_contracts.suite_drafts import EditSuiteDraftRequest, SuiteDraftView
from featherlane_contracts.suites import VersionOne


class DraftRubricCriterion(WireModel):
    check_id: Identifier
    check_version: Annotated[int, Field(ge=1, le=1000000)]
    pass_when: Annotated[str, Field(max_length=512)] | None
    fail_when: Annotated[str, Field(max_length=512)] | None


class DraftJudgeRubric(WireModel):
    version: VersionOne
    criteria: Annotated[list[DraftRubricCriterion], Field(max_length=10)]

    @model_validator(mode="after")
    def unique(self) -> "DraftJudgeRubric":
        if len({c.check_id for c in self.criteria}) != len(self.criteria):
            raise ValueError("Rubric identities must be unique")
        return self


class JudgeRubricCriterion(WireModel):
    check_id: Identifier
    check_version: Annotated[int, Field(ge=1, le=1000000)]
    pass_when: Description
    fail_when: Description

    @model_validator(mode="after")
    def nonblank(self) -> "JudgeRubricCriterion":
        if not self.pass_when.strip() or not self.fail_when.strip():
            raise ValueError("PASS and FAIL conditions are required")
        return self


class PublishedJudgeRubric(WireModel):
    version: VersionOne
    engine: Literal["llm-judge-v1"]
    definition_digest: Digest
    criteria: Annotated[list[JudgeRubricCriterion], Field(min_length=1, max_length=10)]


class JudgeSuiteDraftView(SuiteDraftView):
    rubric: DraftJudgeRubric


class JudgeSuiteDraftEnvelope(SuccessEnvelope[JudgeSuiteDraftView]):
    pass


class EditJudgeSuiteDraftRequest(EditSuiteDraftRequest):
    rubric: DraftJudgeRubric


class JudgeTimeReference(WireModel):
    clock: Literal["MONOTONIC"]
    kind: Literal["EVENT", "EVIDENCE_WINDOW", "FAILURE_WINDOW"]
    event_ids: Annotated[list[Identifier], Field(min_length=1, max_length=20)]
    artifact_ids: Annotated[list[Identifier], Field(max_length=20)]
    from_ms: Annotated[float, Field(ge=0, le=86400000)]
    to_ms: Annotated[float, Field(ge=0, le=86400000)]

    @model_validator(mode="after")
    def ordered(self) -> "JudgeTimeReference":
        if self.to_ms < self.from_ms or (
            self.kind == "EVENT" and self.to_ms != self.from_ms
        ):
            raise ValueError("Invalid citation interval")
        if len(set(self.event_ids)) != len(self.event_ids) or len(
            set(self.artifact_ids)
        ) != len(self.artifact_ids):
            raise ValueError("Duplicate citation identities")
        return self


class JudgeCriterionResult(WireModel):
    check_id: Identifier
    check_version: Annotated[int, Field(ge=1, le=1000000)]
    outcome: CheckOutcome
    finding: Description
    references: Annotated[list[JudgeTimeReference], Field(max_length=5)]


class JudgeResponse(WireModel):
    results: Annotated[list[JudgeCriterionResult], Field(min_length=1, max_length=10)]


class TrialJudgment(WireModel):
    attempt_id: Identifier
    trial_id: Identifier
    engine: Literal["llm-judge-v1"]
    rubric_digest: Digest
    packet_digest: Digest
    prompt_version: Identifier
    prompt_digest: Digest
    provider: Literal["openai"]
    model: Annotated[str, Field(min_length=1, max_length=128)]
    results: Annotated[list[JudgeCriterionResult], Field(max_length=10)]


class RunJudgments(WireModel):
    state: Literal["NOT_EVALUATED", "PENDING", "FINISHED", "ERROR"]
    trials: Annotated[list[TrialJudgment], Field(max_length=100)]


class RunJudgmentsEnvelope(SuccessEnvelope[RunJudgments]):
    pass
