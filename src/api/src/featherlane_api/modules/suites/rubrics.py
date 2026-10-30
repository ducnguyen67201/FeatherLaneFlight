"""Rubric draft binding and publication validation; called inside draft transactions."""

from featherlane_contracts import ErrorCode, FieldError
from featherlane_contracts.judging import DraftJudgeRubric, PublishedJudgeRubric
from featherlane_contracts.suite_drafts import SuiteDraftContent
from featherlane_contracts.suites import PublishedSuiteDefinition, suite_digest
from pydantic import ValidationError

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.suites.rubric_store import DraftRubricRecord


def draft_rubric(row, saved: DraftRubricRecord | None) -> DraftJudgeRubric:
    if saved is not None:
        return DraftJudgeRubric.model_validate(saved.rubric)
    content = SuiteDraftContent.model_validate(row.content)
    return DraftJudgeRubric(
        version=1,
        criteria=[
            dict(checkId=c.id, checkVersion=c.version, passWhen=None, failWhen=None)
            for c in content.checks or []
            if c.id and c.version
        ],
    )


def publish_rubric(
    definition: PublishedSuiteDefinition, draft: DraftJudgeRubric
) -> PublishedJudgeRubric:
    expected = {(c.id, c.version) for c in definition.checks}
    if {(c.check_id, c.check_version) for c in draft.criteria} != expected:
        raise ApiError(
            422,
            ErrorCode.VALIDATION_FAILED,
            "Rubric must cover every criterion and version.",
        )
    try:
        return PublishedJudgeRubric.model_validate(
            dict(
                version=1,
                engine="llm-judge-v1",
                definitionDigest=suite_digest(definition),
                criteria=[c.model_dump(mode="json") for c in draft.criteria],
            )
        )
    except ValidationError:
        issues = []
        for index, check in enumerate(definition.checks):
            condition = next(c for c in draft.criteria if c.check_id == check.id)
            for field in ("pass_when", "fail_when"):
                if not (getattr(condition, field) or "").strip():
                    name = "passWhen" if field == "pass_when" else "failWhen"
                    issues.append(
                        FieldError(
                            field=f"checks.{index}.{name}",
                            code="incomplete",
                            message="Complete this condition before publication.",
                        )
                    )
        raise ApiError(
            422,
            ErrorCode.VALIDATION_FAILED,
            "Complete PASS and FAIL conditions before publication.",
            issues,
        ) from None
