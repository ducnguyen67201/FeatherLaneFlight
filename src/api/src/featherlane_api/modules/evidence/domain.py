"""Bounded declaration and content policy, separate from result evaluation."""

from featherlane_contracts import ErrorCode
from featherlane_contracts.evidence import ArtifactDeclaration, EvidenceUploadPolicy
from featherlane_contracts.run_detail import ArtifactKind

from featherlane_api.http.errors import ApiError

SERVER_POLICY = EvidenceUploadPolicy(
    uploadKinds=["OBSERVATIONS", "REDACTED_PROCESS_LOG", "PX4_ULOG"]
)
KINDS: dict[ArtifactKind, tuple[str, str, str]] = {
    "OBSERVATIONS": (
        "Normalized observations",
        "application/json",
        "observations.json",
    ),
    "REDACTED_PROCESS_LOG": (
        "Redacted process diagnostics",
        "text/plain",
        "process-diagnostics.txt",
    ),
    "PX4_ULOG": ("PX4 ULog", "application/octet-stream", "flight.ulg"),
}


def invalid(message: str = "Artifact content or declaration is invalid.") -> ApiError:
    return ApiError(422, ErrorCode.ARTIFACT_INVALID, message)


def conflict() -> ApiError:
    return ApiError(
        409, ErrorCode.IDEMPOTENCY_CONFLICT, "The artifact operation conflicts."
    )


def require_declaration(body: ArtifactDeclaration, allowed: list[ArtifactKind]) -> None:
    if body.kind not in allowed:
        raise invalid("The admitted manifest does not allow this evidence kind.")
    if body.byte_length is not None and body.byte_length > SERVER_POLICY.byte_limit(
        body.kind
    ):
        raise invalid("Artifact exceeds its evidence-kind limit.")
