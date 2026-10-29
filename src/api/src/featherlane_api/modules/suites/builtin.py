"""One bounded synthetic preset; profile identities come from P09 registration."""

from featherlane_contracts.suites import PublishedSuiteDefinition


def synthetic_nominal(
    profile_id: str, profile_revision: int, profile_digest: str
) -> PublishedSuiteDefinition:
    return PublishedSuiteDefinition.model_validate(
        {
            "suiteId": "builtin_synthetic_nominal",
            "title": "Synthetic nominal mission",
            "description": (
                "Exercises the fake-runner pipeline with synthetic observations. "
                "Does not qualify PX4, SIH, or real flight behavior."
            ),
            "revision": 1,
            "synthetic": True,
            "integrationProfileId": profile_id,
            "integrationProfileRevision": profile_revision,
            "integrationProfileDigest": profile_digest,
            "scenarios": [
                {
                    "id": "nominal",
                    "title": "Nominal mission and landing",
                    "handlerId": "fake.nominal",
                    "handlerVersion": 1,
                    "parameters": {"durationMs": 5000, "randomSeed": 42},
                    "trigger": "READINESS_CONFIRMED",
                    "requiredCapabilities": [{"key": "fake.nominal", "version": 1}],
                    "checkIds": ["mission_complete", "landed_disarmed", "duration"],
                    "requiredEvidenceKinds": ["OBSERVATIONS", "REDACTED_PROCESS_LOG"],
                }
            ],
            "checks": [
                {
                    "id": "mission_complete",
                    "version": 1,
                    "title": "Mission completion",
                    "kind": "MISSION_COMPLETION",
                    "unit": "boolean",
                    "threshold": None,
                    "expected": "Synthetic mission completion observation is true.",
                    "requiredEvidenceKinds": ["OBSERVATIONS"],
                    "inconclusiveWhen": "Completion observation is missing or invalid.",
                },
                {
                    "id": "landed_disarmed",
                    "version": 1,
                    "title": "Landing and disarm",
                    "kind": "LANDING_DISARM",
                    "unit": "boolean",
                    "threshold": None,
                    "expected": "Synthetic landed and disarmed observations are true.",
                    "requiredEvidenceKinds": ["OBSERVATIONS"],
                    "inconclusiveWhen": "Landed or disarmed observation is missing.",
                },
                {
                    "id": "duration",
                    "version": 1,
                    "title": "Mission duration",
                    "kind": "METRIC_THRESHOLD",
                    "unit": "s",
                    "threshold": 10.0,
                    "expected": "Synthetic mission duration is at most 10 seconds.",
                    "requiredEvidenceKinds": ["OBSERVATIONS"],
                    "inconclusiveWhen": "Duration or clock observation is missing.",
                },
            ],
            "requiredCapabilities": [{"key": "fake.nominal", "version": 1}],
            "evidencePolicy": {
                "requiredKinds": ["OBSERVATIONS", "REDACTED_PROCESS_LOG"],
                "maximumArtifactBytes": 1_048_576,
                "missingEvidenceOutcome": "INCONCLUSIVE",
            },
            "versionRequirements": {
                "contractVersion": "0.1.0",
                "protocolVersion": "1",
                "evaluatorVersion": "1",
            },
        }
    )
