"""Published synthetic suite data; no scripts, launch config or eligibility."""

import hashlib
import json
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, model_validator

from featherlane_contracts import (
    ContractVersion,
    CursorMeta,
    Digest,
    DisplayName,
    Identifier,
    ProtocolVersion,
    SuccessEnvelope,
    UtcTimestamp,
    WireModel,
    _reject_boolean_constant,
    _require_true_constant,
)
from featherlane_contracts.run_detail import ArtifactKind, CheckDefinition, Description

RevisionNumber = Annotated[int, Field(ge=1, le=1_000_000)]
VersionOne = Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)]


class SuiteCapabilityRequirement(WireModel):
    key: Literal["fake.nominal"]
    version: VersionOne


class SyntheticNominalParameters(WireModel):
    duration_ms: Annotated[int, Field(ge=100, le=30_000)]
    random_seed: Annotated[int, Field(ge=0, le=2_147_483_647)]


class SuiteScenario(WireModel):
    id: Identifier
    title: DisplayName
    handler_id: Literal["fake.nominal"]
    handler_version: VersionOne
    parameters: SyntheticNominalParameters
    trigger: Literal["READINESS_CONFIRMED"]
    required_capabilities: Annotated[
        list[SuiteCapabilityRequirement], Field(min_length=1, max_length=1)
    ]
    check_ids: Annotated[list[Identifier], Field(min_length=1, max_length=10)]
    required_evidence_kinds: Annotated[
        list[ArtifactKind], Field(min_length=1, max_length=2)
    ]


class SuiteEvidencePolicy(WireModel):
    required_kinds: Annotated[list[ArtifactKind], Field(min_length=1, max_length=2)]
    maximum_artifact_bytes: Annotated[int, Field(ge=1, le=1_048_576)]
    missing_evidence_outcome: Literal["INCONCLUSIVE"]


class SuiteVersionRequirements(WireModel):
    contract_version: ContractVersion
    protocol_version: ProtocolVersion
    evaluator_version: Literal["1"]


class PublishedSuiteDefinition(WireModel):
    suite_id: Identifier
    title: DisplayName
    description: Description
    revision: RevisionNumber
    synthetic: Annotated[Literal[True], BeforeValidator(_require_true_constant)]
    integration_profile_id: Identifier
    integration_profile_revision: RevisionNumber
    integration_profile_digest: Digest
    scenarios: Annotated[list[SuiteScenario], Field(min_length=1, max_length=10)]
    checks: Annotated[list[CheckDefinition], Field(min_length=1, max_length=10)]
    required_capabilities: Annotated[
        list[SuiteCapabilityRequirement], Field(min_length=1, max_length=1)
    ]
    evidence_policy: SuiteEvidencePolicy
    version_requirements: SuiteVersionRequirements

    @model_validator(mode="after")
    def validate_references(self) -> "PublishedSuiteDefinition":
        check_ids = {check.id for check in self.checks}
        if len(check_ids) != len(self.checks):
            raise ValueError("Check identifiers must be unique")
        if len({scenario.id for scenario in self.scenarios}) != len(self.scenarios):
            raise ValueError("Scenario identifiers must be unique")
        policy = set(self.evidence_policy.required_kinds)
        if len(policy) != len(self.evidence_policy.required_kinds):
            raise ValueError("Evidence kinds must be unique")
        if not policy <= {"OBSERVATIONS", "REDACTED_PROCESS_LOG"}:
            raise ValueError("Synthetic suites cannot require real PX4 evidence")
        referenced = set()
        for scenario in self.scenarios:
            if len(set(scenario.check_ids)) != len(scenario.check_ids):
                raise ValueError("Scenario check references must be unique")
            if not set(scenario.check_ids) <= check_ids:
                raise ValueError("Scenario references an undefined check")
            if scenario.required_capabilities != self.required_capabilities:
                raise ValueError("Scenario capabilities must match suite requirements")
            kinds = set(scenario.required_evidence_kinds)
            if (
                len(kinds) != len(scenario.required_evidence_kinds)
                or not kinds <= policy
            ):
                raise ValueError(
                    "Scenario evidence must be unique and covered by policy"
                )
            for check in self.checks:
                if (
                    check.id in scenario.check_ids
                    and not set(check.required_evidence_kinds) <= kinds
                ):
                    raise ValueError("Scenario evidence must cover its checks")
            referenced.update(scenario.check_ids)
        if referenced != check_ids:
            raise ValueError("Every check must be used by a scenario")
        if any(check.version != 1 for check in self.checks):
            raise ValueError("Only check version 1 is supported")
        return self


class SyntheticReferenceObservation(WireModel):
    scenario_id: Identifier
    handler_id: Literal["fake.nominal"]
    handler_version: VersionOne
    random_seed: Annotated[int, Field(ge=0, le=2_147_483_647)]
    mission_completed: bool
    landed: bool
    disarmed: bool
    elapsed_monotonic_ms: Annotated[int, Field(ge=100, le=30_000)]
    elapsed_simulation_ms: Annotated[int, Field(ge=100, le=30_000)]


class SyntheticQualificationView(WireModel):
    id: Identifier
    project_id: Identifier
    runtime_family: Literal["SYNTHETIC"]
    support_level: Literal["VERIFIED"]
    integration_profile_id: Identifier
    integration_profile_revision: RevisionNumber
    integration_profile_digest: Digest
    suite_digest: Digest
    verifier_id: Literal["fake.nominal.reference"]
    verifier_version: VersionOne
    report_sha256: Digest
    verified_at: UtcTimestamp
    limitation: Literal[
        "Synthetic reference handler only; does not qualify runner processes or PX4."
    ]


class SuiteRevisionView(PublishedSuiteDefinition):
    id: Identifier
    project_id: Identifier
    status: Literal["PUBLISHED"]
    digest: Digest
    created_at: UtcTimestamp
    qualification: SyntheticQualificationView


class SuiteRevisionEnvelope(SuccessEnvelope[SuiteRevisionView]):
    pass


class SuiteCatalogEnvelope(WireModel):
    data: Annotated[list[SuiteRevisionView], Field(max_length=100)]
    meta: CursorMeta


def suite_digest(definition: PublishedSuiteDefinition) -> str:
    content = definition.model_dump(
        mode="json", include=set(PublishedSuiteDefinition.model_fields)
    )
    return hashlib.sha256(
        json.dumps(content, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
