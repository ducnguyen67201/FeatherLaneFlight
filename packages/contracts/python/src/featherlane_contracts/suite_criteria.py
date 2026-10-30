"""Reviewable suggestions reuse canonical check definitions, never executable rules."""

from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from featherlane_contracts import SuccessEnvelope, WireModel
from featherlane_contracts.judging import DraftJudgeRubric
from featherlane_contracts.run_detail import CheckDefinition, Description
from featherlane_contracts.suite_drafts import SuiteDraftVersionRequest
from featherlane_contracts.suites import RevisionNumber


class SuggestSuiteCriteriaRequest(SuiteDraftVersionRequest):
    mission_description: Annotated[str, Field(min_length=1, max_length=2000)]

    @field_validator("mission_description")
    @classmethod
    def nonblank_description(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A mission description is required")
        return value.strip()


class SuggestedCriteriaDraft(WireModel):
    checks: Annotated[list[CheckDefinition], Field(max_length=3)]
    unsupported_requirements: Annotated[list[Description], Field(max_length=5)]

    @model_validator(mode="after")
    def unique_checks(self) -> "SuggestedCriteriaDraft":
        if len({check.id for check in self.checks}) != len(self.checks):
            raise ValueError("Suggestion identifiers must be unique")
        if not self.checks and not self.unsupported_requirements:
            raise ValueError("Return supported suggestions or explain missing support")
        return self


class SuiteCriteriaSuggestions(SuggestedCriteriaDraft):
    draft_version: RevisionNumber
    provider: Literal["openai"]
    model: Annotated[str, Field(min_length=1, max_length=128)]


class SuiteCriteriaSuggestionStatus(WireModel):
    available: bool
    provider: Literal["openai"]
    model: Annotated[str, Field(min_length=1, max_length=128)] | None


class SuiteCriteriaSuggestionsEnvelope(SuccessEnvelope[SuiteCriteriaSuggestions]):
    pass


class SuiteCriteriaSuggestionStatusEnvelope(
    SuccessEnvelope[SuiteCriteriaSuggestionStatus]
):
    pass


class SuggestedJudgeCriteriaDraft(SuggestedCriteriaDraft):
    rubric: "DraftJudgeRubric"

    @model_validator(mode="after")
    def rubric_coverage(self) -> "SuggestedJudgeCriteriaDraft":
        if {(c.check_id, c.check_version) for c in self.rubric.criteria} != {
            (c.id, c.version) for c in self.checks
        }:
            raise ValueError("Suggested rubric must match suggested checks")
        if any(
            not (c.pass_when or "").strip() or not (c.fail_when or "").strip()
            for c in self.rubric.criteria
        ):
            raise ValueError("Suggested PASS and FAIL conditions are required")
        return self


class JudgeSuiteCriteriaSuggestions(SuggestedJudgeCriteriaDraft):
    draft_version: RevisionNumber
    provider: Literal["openai"]
    model: Annotated[str, Field(min_length=1, max_length=128)]


class JudgeSuiteCriteriaSuggestionsEnvelope(
    SuccessEnvelope[JudgeSuiteCriteriaSuggestions]
):
    pass
