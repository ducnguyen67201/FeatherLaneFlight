"""Live browser authorization, draft CAS, and atomic publication orchestration."""

from datetime import UTC, datetime
from uuid import uuid4

from featherlane_contracts import CursorMeta, ErrorCode, FieldError
from featherlane_contracts.judging import (
    EditJudgeSuiteDraftRequest,
    JudgeSuiteDraftEnvelope,
    JudgeSuiteDraftView,
)
from featherlane_contracts.registration import metadata_digest
from featherlane_contracts.suite_drafts import (
    CreateSuiteDraftRequest,
    EditSuiteDraftRequest,
    SuiteDraftContent,
    SuiteDraftEnvelope,
    SuiteDraftListEnvelope,
    SuiteDraftSummary,
    SuiteDraftValidation,
    SuiteDraftValidationEnvelope,
    SuiteDraftView,
)
from featherlane_contracts.suites import (
    PublishedSuiteDefinition,
    SuiteRevisionEnvelope,
    suite_digest,
)
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.access.persistence import AccessStore
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.suites.builtin import synthetic_nominal
from featherlane_api.modules.suites.draft_store import (
    SuiteDraftAuditRecord,
    SuiteDraftCreationRecord,
    SuiteDraftPublicationRecord,
    SuiteDraftRecord,
    SuiteDraftStore,
)
from featherlane_api.modules.suites.persistence import (
    SuiteRevisionConflict,
    SuiteStore,
    revision_view,
)
from featherlane_api.modules.suites.publication import (
    publish_definition,
    validate_publication,
)
from featherlane_api.modules.suites.qualification import sha256
from featherlane_api.modules.suites.rubric_store import (
    DraftRubricRecord,
    PublishedRubricRecord,
)
from featherlane_api.modules.suites.rubrics import draft_rubric, publish_rubric


def prepare_definition(
    content: SuiteDraftContent, suite_id: str, revision: int | None
) -> tuple[PublishedSuiteDefinition | None, list[FieldError]]:
    if revision is None:
        return None, [
            FieldError(
                field="revision",
                code="revision_exhausted",
                message="This suite has reached its revision limit.",
            )
        ]
    try:
        return PublishedSuiteDefinition.model_validate(
            {
                **content.model_dump(mode="json"),
                "suiteId": suite_id,
                "revision": revision,
            }
        ), []
    except ValidationError as error:
        issues = []
        for item in error.errors(include_url=False, include_context=False)[:50]:
            # Draft input is already a strict schema with no arbitrary keys.
            # Drop union discriminator markers; never echo input or validator text.
            parts = [
                str(part)
                for part in item["loc"]
                if part
                not in {
                    "MISSION_COMPLETION",
                    "LANDING_DISARM",
                    "METRIC_THRESHOLD",
                }
            ]
            field = ".".join(parts) or "definition"
            incomplete = item.get("input") is None
            issues.append(
                FieldError(
                    field=field[:256],
                    code="incomplete" if incomplete else "invalid_definition",
                    message=(
                        "Complete this field before publication."
                        if incomplete
                        else "Correct this field and its references."
                    ),
                )
            )
        return None, issues


def publication_issue(error: ApiError) -> FieldError:
    return FieldError(
        field="integrationProfileId"
        if error.code == ErrorCode.PROFILE_MISMATCH
        else "checks",
        code="publication_policy",
        message=error.message,
    )


def require_version(row: SuiteDraftRecord, expected_version: int) -> None:
    if row.draft_version != expected_version:
        raise ApiError(
            409,
            ErrorCode.SUITE_DRAFT_CONFLICT,
            "The draft changed. Load the latest version before continuing.",
            [
                FieldError(
                    field="expectedDraftVersion",
                    code="stale_draft",
                    message="Load the latest draft; local edits were not saved.",
                )
            ],
        )


def summary(row: SuiteDraftRecord) -> SuiteDraftSummary:
    content = SuiteDraftContent.model_validate(row.content)
    return SuiteDraftSummary(
        suiteId=row.suite_id,
        projectId=row.project_id,
        status="DRAFT",
        draftVersion=row.draft_version,
        title=content.title,
        lastPublishedRevisionId=row.last_published_revision_id,
        updatedAt=row.updated_at.isoformat().replace("+00:00", "Z"),
    )


class SuiteDraftService:
    def __init__(
        self,
        session: AsyncSession,
        identity: IdentityService,
        *,
        rubric_mode: bool = False,
    ):
        self.rubric_mode = rubric_mode
        self.session = session
        self.identity = identity
        self.store = SuiteDraftStore(session)

    async def authorize(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        csrf: str | None = None,
    ) -> None:
        await self.identity.require_live(principal, handle, csrf)
        await AccessStore(self.session).require_project(principal.user_id, project_id)

    async def view(self, row: SuiteDraftRecord) -> SuiteDraftEnvelope:
        revision = await self.store.next_revision(row.project_id, row.suite_id)
        content = SuiteDraftContent.model_validate(row.content)
        _, issues = prepare_definition(content, row.suite_id, revision)
        publication = await self.session.get(
            SuiteDraftPublicationRecord,
            (row.project_id, row.suite_id, row.draft_version),
        )
        result = SuiteDraftEnvelope(
            data=SuiteDraftView.model_validate(
                {
                    **summary(row).model_dump(),
                    "content": content.model_dump(),
                    "nextPublishedRevision": revision,
                    "publishedRevisionId": publication.suite_revision_id
                    if publication
                    else None,
                    "issues": [issue.model_dump() for issue in issues],
                }
            )
        )
        if self.rubric_mode:
            saved = await self.session.get(
                DraftRubricRecord, (row.project_id, row.suite_id)
            )
            return JudgeSuiteDraftEnvelope(
                data=JudgeSuiteDraftView.model_validate(
                    {
                        **result.data.model_dump(mode="json"),
                        "rubric": draft_rubric(row, saved).model_dump(mode="json"),
                    }
                )
            )
        return result

    def audit(self, row: SuiteDraftRecord, actor_id: str, action: str) -> None:
        self.session.add(
            SuiteDraftAuditRecord(
                id=uuid4().hex,
                project_id=row.project_id,
                suite_id=row.suite_id,
                draft_version=row.draft_version,
                actor_id=actor_id,
                action=action,
                created_at=row.updated_at,
            )
        )

    async def create(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        project_id: str,
        key: str,
        body: CreateSuiteDraftRequest,
    ) -> SuiteDraftEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id, csrf)
            await self.store.lock_project(project_id)
            digest = sha256(body.model_dump(mode="json"))
            receipt = await self.session.get(
                SuiteDraftCreationRecord, (project_id, principal.user_id, key)
            )
            if receipt is not None:
                if receipt.request_digest != digest:
                    raise ApiError(
                        409,
                        ErrorCode.IDEMPOTENCY_CONFLICT,
                        "This draft creation key was used with different inputs.",
                    )
                return await self.view(
                    await self.store.exact(project_id, receipt.suite_id)
                )
            if body.source_revision_id is not None:
                source = revision_view(
                    await SuiteStore(self.session).exact(
                        project_id, body.source_revision_id
                    )
                )
                suite_id = source.suite_id
                content = SuiteDraftContent.model_validate(
                    source.model_dump(
                        mode="json", include=set(SuiteDraftContent.model_fields)
                    )
                )
            else:
                suite_id = "suite_" + uuid4().hex
                # Reuse the real built-in authoring preset, leaving profile selection
                # explicitly incomplete. These temporary arguments never become
                # registrations or qualification evidence.
                preset = synthetic_nominal("unselected", 1, "0" * 64).model_dump(
                    mode="json", include=set(SuiteDraftContent.model_fields)
                )
                content = SuiteDraftContent.model_validate(
                    {
                        **preset,
                        "title": "Untitled synthetic suite",
                        "integrationProfileId": None,
                        "integrationProfileRevision": None,
                        "integrationProfileDigest": None,
                    }
                )
            row = await self.store.get(project_id, suite_id, lock=True)
            if row is None:
                row = SuiteDraftRecord(
                    project_id=project_id,
                    suite_id=suite_id,
                    draft_version=1,
                    content=content.model_dump(mode="json"),
                    last_published_revision_id=body.source_revision_id,
                    updated_at=datetime.now(UTC),
                )
                self.session.add(row)
                self.audit(row, principal.user_id, "DRAFT_CREATED")
                await self.session.flush()
                if body.source_revision_id is not None:
                    source_rubric = await self.session.get(
                        PublishedRubricRecord, body.source_revision_id
                    )
                    if source_rubric is not None:
                        self.session.add(
                            DraftRubricRecord(
                                project_id=project_id,
                                suite_id=suite_id,
                                rubric={
                                    "version": 1,
                                    "criteria": source_rubric.rubric["criteria"],
                                },
                            )
                        )
            # Opening an existing suite draft never overwrites another member's work.
            self.session.add(
                SuiteDraftCreationRecord(
                    project_id=project_id,
                    actor_id=principal.user_id,
                    request_key=key,
                    request_digest=digest,
                    suite_id=row.suite_id,
                )
            )
            await self.session.flush()
            return await self.view(row)

    async def detail(
        self, principal: Principal, handle: str | None, project_id: str, suite_id: str
    ) -> SuiteDraftEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id)
            return await self.view(await self.store.exact(project_id, suite_id))

    async def list(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        limit: int,
        cursor: str | None,
    ) -> SuiteDraftListEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id)
            rows = await self.store.list(project_id, limit, cursor)
            return SuiteDraftListEnvelope(
                data=[summary(row) for row in rows[:limit]],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].suite_id if len(rows) > limit else None
                ),
            )

    async def edit(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        project_id: str,
        suite_id: str,
        body: EditSuiteDraftRequest,
    ) -> SuiteDraftEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id, csrf)
            await self.store.lock_project(project_id)
            row = await self.store.exact(project_id, suite_id, lock=True)
            require_version(row, body.expected_draft_version)
            if row.draft_version == 1_000_000:
                raise ApiError(
                    409,
                    ErrorCode.SUITE_DRAFT_CONFLICT,
                    "This draft has reached its edit limit.",
                )
            row.content = body.content.model_dump(mode="json")
            companion = await self.session.get(
                DraftRubricRecord, (project_id, suite_id)
            )
            if isinstance(body, EditJudgeSuiteDraftRequest):
                if companion is None:
                    self.session.add(
                        DraftRubricRecord(
                            project_id=project_id,
                            suite_id=suite_id,
                            rubric=body.rubric.model_dump(mode="json"),
                        )
                    )
                else:
                    companion.rubric = body.rubric.model_dump(mode="json")
            elif companion is not None:
                # Legacy writers cannot keep unreviewed judge instructions.
                await self.session.delete(companion)
            row.draft_version += 1
            row.updated_at = datetime.now(UTC)
            self.audit(row, principal.user_id, "DRAFT_UPDATED")
            await self.session.flush()
            return await self.view(row)

    async def rubric_for(
        self, row: SuiteDraftRecord, definition: PublishedSuiteDefinition
    ):
        saved = await self.session.get(
            DraftRubricRecord, (row.project_id, row.suite_id)
        )
        return publish_rubric(definition, draft_rubric(row, saved))

    async def validate(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        project_id: str,
        suite_id: str,
        expected_version: int,
    ) -> SuiteDraftValidationEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id, csrf)
            await self.store.lock_project(project_id)
            row = await self.store.exact(project_id, suite_id, lock=True)
            require_version(row, expected_version)
            revision = await self.store.next_revision(project_id, suite_id)
            definition, issues = prepare_definition(
                SuiteDraftContent.model_validate(row.content),
                suite_id,
                revision,
            )
            if definition is not None:
                try:
                    await validate_publication(
                        self.session, project_id=project_id, definition=definition
                    )
                except ApiError as error:
                    if error.status not in {409, 422}:
                        raise
                    issues = [publication_issue(error)]
            if self.rubric_mode and definition is not None and not issues:
                try:
                    await self.rubric_for(row, definition)
                except ApiError as error:
                    issues = error.details or [
                        FieldError(
                            field="checks", code="incomplete", message=error.message
                        )
                    ]
            return SuiteDraftValidationEnvelope(
                data=SuiteDraftValidation(
                    draftVersion=row.draft_version,
                    nextPublishedRevision=revision,
                    valid=not issues,
                    issues=issues,
                    definitionDigest=suite_digest(definition)
                    if definition is not None and not issues
                    else None,
                )
            )

    async def publish(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        project_id: str,
        suite_id: str,
        expected_version: int,
        expected_digest: str | None = None,
    ) -> SuiteRevisionEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id, csrf)
            await self.store.lock_project(project_id)
            row = await self.store.exact(project_id, suite_id, lock=True)
            receipt = await self.session.get(
                SuiteDraftPublicationRecord, (project_id, suite_id, expected_version)
            )
            if receipt is not None:
                # A lost response recovers the exact old publication even after edits.
                recovered = revision_view(
                    await SuiteStore(self.session).exact(
                        project_id, receipt.suite_revision_id
                    )
                )
                if expected_digest is not None and expected_digest != recovered.digest:
                    raise ApiError(
                        409,
                        ErrorCode.IDEMPOTENCY_CONFLICT,
                        "Publication inputs differ from the committed result.",
                    )
                if (
                    self.rubric_mode
                    and await self.session.get(PublishedRubricRecord, recovered.id)
                    is None
                ):
                    raise ApiError(
                        409,
                        ErrorCode.SUITE_DRAFT_CONFLICT,
                        "This publication used the legacy evaluator. "
                        "Create a new draft revision for judging.",
                    )
                return SuiteRevisionEnvelope(data=recovered)
            require_version(row, expected_version)
            definition, issues = prepare_definition(
                SuiteDraftContent.model_validate(row.content),
                suite_id,
                await self.store.next_revision(project_id, suite_id),
            )
            if definition is None:
                raise ApiError(
                    422,
                    ErrorCode.VALIDATION_FAILED,
                    "Resolve the draft issues before publication.",
                    issues,
                )
            if (
                expected_digest is not None
                and suite_digest(definition) != expected_digest
            ):
                raise ApiError(
                    409,
                    ErrorCode.SUITE_DRAFT_CONFLICT,
                    "Publication inputs changed. Reload and review the draft again.",
                )
            rubric = (
                await self.rubric_for(row, definition) if self.rubric_mode else None
            )
            try:
                published = await publish_definition(
                    self.session,
                    actor_id=principal.user_id,
                    project_id=project_id,
                    definition=definition,
                    action="SUITE_PUBLISHED",
                )
            except SuiteRevisionConflict:
                raise ApiError(
                    409,
                    ErrorCode.SUITE_DRAFT_CONFLICT,
                    "The immutable revision conflicts; reload the draft.",
                ) from None
            except ApiError as error:
                if error.status not in {409, 422}:
                    raise
                raise ApiError(
                    error.status,
                    error.code,
                    error.message,
                    error.details or [publication_issue(error)],
                ) from None
            self.session.add(
                SuiteDraftPublicationRecord(
                    project_id=project_id,
                    suite_id=suite_id,
                    draft_version=expected_version,
                    suite_revision_id=published.id,
                )
            )
            if rubric is not None:
                self.session.add(
                    PublishedRubricRecord(
                        revision_id=published.id,
                        rubric=rubric.model_dump(mode="json"),
                        digest=metadata_digest(rubric),
                    )
                )
            row.last_published_revision_id = published.id
            await self.session.flush()
            return SuiteRevisionEnvelope(data=published)
