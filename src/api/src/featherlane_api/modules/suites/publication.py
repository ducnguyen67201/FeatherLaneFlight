"""Shared publication policy inside the caller-owned authorized transaction."""

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from featherlane_contracts import ErrorCode
from featherlane_contracts.registration import SyntheticIntegrationProfileView
from featherlane_contracts.suites import (
    PublishedSuiteDefinition,
    SuiteRevisionView,
    suite_digest,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.access.persistence import AccessStore, ProjectRecord
from featherlane_api.modules.registration.application import require_integration_profile
from featherlane_api.modules.suites.persistence import (
    SuiteAuditRecord,
    SuiteStore,
    SyntheticQualificationRecord,
    revision_view,
)
from featherlane_api.modules.suites.qualification import qualify_reference, sha256


async def validate_publication(
    session: AsyncSession, *, project_id: str, definition: PublishedSuiteDefinition
) -> dict:
    """Resolve exact profile and rerun bounded qualification without writing.

    Caller must first authorize the project within its active transaction.
    """
    if not session.in_transaction():
        raise RuntimeError("Publication validation requires a caller transaction.")
    profile = await require_integration_profile(
        session,
        project_id=project_id,
        profile_id=definition.integration_profile_id,
        expected_revision=definition.integration_profile_revision,
        expected_digest=definition.integration_profile_digest,
    )
    if not isinstance(profile, SyntheticIntegrationProfileView):
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "Synthetic qualification requires an explicitly synthetic profile.",
        )
    return qualify_reference(definition, profile)


async def publish_definition(
    session: AsyncSession,
    *,
    actor_id: str,
    project_id: str,
    definition: PublishedSuiteDefinition,
    action: Literal["SUITE_IMPORTED", "SUITE_PUBLISHED"],
) -> SuiteRevisionView:
    """Share validation/qualification/append/audit, never establish a login.

    Browser callers require a live session/CSRF first; the operator caller resolves
    its real identity first. This helper rechecks both memberships and project
    serialization, and never begins or commits the caller's transaction.
    """
    if not session.in_transaction():
        raise RuntimeError("Publication requires a caller-owned transaction.")
    await AccessStore(session).require_project(actor_id, project_id)
    definition = PublishedSuiteDefinition.model_validate(definition.model_dump())
    # One lock order for import/replay, before exact profile binding.
    await session.scalar(
        select(ProjectRecord).where(ProjectRecord.id == project_id).with_for_update()
    )
    report = await validate_publication(
        session, project_id=project_id, definition=definition
    )
    digest = suite_digest(definition)
    report_digest = sha256(report)
    record = await session.scalar(
        select(SyntheticQualificationRecord).where(
            SyntheticQualificationRecord.project_id == project_id,
            SyntheticQualificationRecord.suite_digest == digest,
        )
    )
    created = record is None
    if record is None:
        record = SyntheticQualificationRecord(
            id="synthetic_qualification_" + uuid4().hex,
            project_id=project_id,
            suite_digest=digest,
            profile_id=definition.integration_profile_id,
            profile_revision=definition.integration_profile_revision,
            profile_digest=definition.integration_profile_digest,
            report_sha256=report_digest,
            report=report,
            verified_at=datetime.now(UTC),
        )
        session.add(record)
        await session.flush()
    elif (
        record.report_sha256 != report_digest or sha256(record.report) != report_digest
    ):
        raise RuntimeError("Immutable synthetic qualification report conflict.")
    row = await SuiteStore(session).append(project_id, definition, record)
    if created:
        session.add(
            SuiteAuditRecord(
                id=uuid4().hex,
                project_id=project_id,
                actor_id=actor_id,
                suite_revision_id=row.id,
                qualification_id=record.id,
                action=action,
                created_at=datetime.now(UTC),
            )
        )
        await session.flush()
    return revision_view(row)
