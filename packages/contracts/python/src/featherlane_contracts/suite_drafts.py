"""Incomplete authoring shapes derived from the canonical published schemas."""

from typing import Annotated, Literal

from annotated_types import MinLen
from pydantic import Field, create_model

from featherlane_contracts import (
    CursorMeta,
    Digest,
    FieldError,
    Identifier,
    SuccessEnvelope,
    UtcTimestamp,
    WireModel,
)
from featherlane_contracts.run_detail import (
    LandingDisarmCheck,
    MetricThresholdCheck,
    MissionCompletionCheck,
)
from featherlane_contracts.suites import (
    PublishedSuiteDefinition,
    RevisionNumber,
    SuiteEvidencePolicy,
    SuiteScenario,
    SuiteVersionRequirements,
    SyntheticNominalParameters,
)


def _incomplete(
    name: str, model: type[WireModel], **replacements: object
) -> type[WireModel]:
    """Keep canonical bounds/aliases; allow missing values and empty draft lists.

    Published cross-field validation runs on the final canonical definition.
    Discriminator kinds stay required so unsupported check types never enter a
    draft. Suite identity and published revision are always server-owned.
    """
    fields = {}
    for key, field in model.model_fields.items():
        if key in {"suite_id", "revision"}:
            continue
        if key == "kind":
            fields[key] = (field.rebuild_annotation(), ...)
            continue
        data = field.asdict()
        annotation = replacements.get(key, data["annotation"])
        metadata = [item for item in data["metadata"] if not isinstance(item, MinLen)]
        # Canonical BeforeValidators apply only to supplied values. In particular,
        # the synthetic=true validator must not reject an explicitly incomplete
        # null after the draft has been serialized to JSON and loaded again.
        bounded = Annotated[annotation, *metadata] if metadata else annotation
        fields[key] = (
            Annotated[bounded | None, Field(**data["attributes"])],
            None,
        )
    return create_model(name, __base__=WireModel, __module__=__name__, **fields)


DraftNominalParameters = _incomplete(
    "DraftNominalParameters", SyntheticNominalParameters
)
DraftScenario = _incomplete(
    "DraftScenario", SuiteScenario, parameters=DraftNominalParameters
)
DraftMissionCompletionCheck = _incomplete(
    "DraftMissionCompletionCheck", MissionCompletionCheck
)
DraftLandingDisarmCheck = _incomplete("DraftLandingDisarmCheck", LandingDisarmCheck)
DraftMetricThresholdCheck = _incomplete(
    "DraftMetricThresholdCheck", MetricThresholdCheck
)
DraftCheck = Annotated[
    DraftMissionCompletionCheck | DraftLandingDisarmCheck | DraftMetricThresholdCheck,
    Field(discriminator="kind"),
]
DraftEvidencePolicy = _incomplete("DraftEvidencePolicy", SuiteEvidencePolicy)
DraftVersionRequirements = _incomplete(
    "DraftVersionRequirements", SuiteVersionRequirements
)
SuiteDraftContent = _incomplete(
    "SuiteDraftContent",
    PublishedSuiteDefinition,
    scenarios=list[DraftScenario],
    checks=list[DraftCheck],
    evidence_policy=DraftEvidencePolicy,
    version_requirements=DraftVersionRequirements,
)


class CreateSuiteDraftRequest(WireModel):
    source_revision_id: Identifier | None = None


class EditSuiteDraftRequest(WireModel):
    expected_draft_version: RevisionNumber
    content: SuiteDraftContent


class SuiteDraftVersionRequest(WireModel):
    expected_draft_version: RevisionNumber


class PublishSuiteDraftRequest(SuiteDraftVersionRequest):
    expected_definition_digest: Digest | None = None


class SuiteDraftSummary(WireModel):
    suite_id: Identifier
    project_id: Identifier
    status: Literal["DRAFT"]
    draft_version: RevisionNumber
    title: Annotated[str, Field(max_length=128)] | None
    last_published_revision_id: Identifier | None
    updated_at: UtcTimestamp


class SuiteDraftView(SuiteDraftSummary):
    published_revision_id: Identifier | None
    next_published_revision: RevisionNumber | None
    content: SuiteDraftContent
    issues: Annotated[list[FieldError], Field(max_length=50)]


class SuiteDraftValidation(WireModel):
    next_published_revision: RevisionNumber | None
    draft_version: RevisionNumber
    valid: bool
    issues: Annotated[list[FieldError], Field(max_length=50)]
    definition_digest: Digest | None


class SuiteDraftEnvelope(SuccessEnvelope[SuiteDraftView]):
    pass


class SuiteDraftListEnvelope(WireModel):
    data: Annotated[list[SuiteDraftSummary], Field(max_length=100)]
    meta: CursorMeta


class SuiteDraftValidationEnvelope(SuccessEnvelope[SuiteDraftValidation]):
    pass
