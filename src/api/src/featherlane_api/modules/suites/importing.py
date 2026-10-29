"""Operator-only bounded import through P09's actual exact-profile lookup."""

from datetime import UTC, datetime
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
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.access.persistence import AccessStore, ProjectRecord
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.registration.application import require_integration_profile
from featherlane_api.modules.suites.persistence import (
    SuiteAuditRecord,
    SuiteStore,
    SyntheticQualificationRecord,
    revision_view,
)
from featherlane_api.modules.suites.qualification import qualify_reference, sha256


class SuiteImporter:
    def __init__(self, session: AsyncSession, identity: IdentityService):
        self.session = session
        self.identity = identity

    async def import_definition(
        self,
        *,
        issuer: str,
        subject: str,
        project_id: str,
        definition: PublishedSuiteDefinition,
    ) -> SuiteRevisionView:
        async with self.session.begin():
            user = await self.identity.lookup_user(issuer, subject, lock=True)
            if user is None:
                raise AccessNotFound()
            await AccessStore(self.session).require_project(user.id, project_id)
            # One lock order for import/replay, before exact profile binding.
            await self.session.scalar(
                select(ProjectRecord)
                .where(ProjectRecord.id == project_id)
                .with_for_update()
            )
            profile = await require_integration_profile(
                self.session,
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
            report = qualify_reference(definition, profile)
            digest = suite_digest(definition)
            report_digest = sha256(report)
            record = await self.session.scalar(
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
                    profile_id=profile.id,
                    profile_revision=profile.revision,
                    profile_digest=profile.digest,
                    report_sha256=report_digest,
                    report=report,
                    verified_at=datetime.now(UTC),
                )
                self.session.add(record)
                await self.session.flush()
            elif (
                record.report_sha256 != report_digest
                or sha256(record.report) != report_digest
            ):
                raise RuntimeError("Immutable synthetic qualification report conflict.")
            row = await SuiteStore(self.session).append(project_id, definition, record)
            if created:
                self.session.add(
                    SuiteAuditRecord(
                        id=uuid4().hex,
                        project_id=project_id,
                        actor_id=user.id,
                        suite_revision_id=row.id,
                        qualification_id=record.id,
                        action="SUITE_IMPORTED",
                        created_at=datetime.now(UTC),
                    )
                )
                await self.session.flush()
            return revision_view(row)
