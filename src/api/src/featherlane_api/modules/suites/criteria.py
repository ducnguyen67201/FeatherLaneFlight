"""Authorize before generation and recheck after it; never edit or publish a draft."""

from featherlane_contracts import ErrorCode
from featherlane_contracts.suite_criteria import (
    JudgeSuiteCriteriaSuggestions,
    JudgeSuiteCriteriaSuggestionsEnvelope,
    SuggestSuiteCriteriaRequest,
    SuiteCriteriaSuggestions,
    SuiteCriteriaSuggestionsEnvelope,
    SuiteCriteriaSuggestionStatusEnvelope,
)
from featherlane_contracts.suite_drafts import SuiteDraftContent

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.suites.criteria_provider import CriteriaSuggestionProvider
from featherlane_api.modules.suites.drafts import SuiteDraftService, require_version
from featherlane_api.modules.suites.qualification import CHECK_KINDS


class SuiteCriteriaService:
    def __init__(self, drafts: SuiteDraftService, provider: CriteriaSuggestionProvider):
        self.drafts = drafts
        self.provider = provider

    async def status(
        self, principal: Principal, handle: str | None, project_id: str, suite_id: str
    ) -> SuiteCriteriaSuggestionStatusEnvelope:
        async with self.drafts.session.begin():
            await self.drafts.authorize(principal, handle, project_id)
            await self.drafts.store.exact(project_id, suite_id)
        return SuiteCriteriaSuggestionStatusEnvelope(data=self.provider.status())

    async def suggest(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        project_id: str,
        suite_id: str,
        body: SuggestSuiteCriteriaRequest,
    ) -> SuiteCriteriaSuggestionsEnvelope:
        async with self.drafts.session.begin():
            await self.drafts.authorize(principal, handle, project_id, csrf)
            row = await self.drafts.store.exact(project_id, suite_id)
            require_version(row, body.expected_draft_version)
            content = SuiteDraftContent.model_validate(row.content)
        # External I/O owns no database transaction, draft lock or publication record.
        result = await self.provider.suggest(
            body.mission_description,
            principal.session_id,
            judge=self.drafts.rubric_mode,
        )
        if self.provider.config is None:
            raise ApiError(
                503, ErrorCode.SUGGESTIONS_UNAVAILABLE, "Suggestions are unavailable."
            )
        async with self.drafts.session.begin():
            await self.drafts.authorize(principal, handle, project_id, csrf)
            # expire cached rows: a second SELECT must observe edits made during I/O.
            self.drafts.session.expire_all()
            row = await self.drafts.store.exact(project_id, suite_id)
            require_version(row, body.expected_draft_version)
            originals = {check.id: check for check in content.checks or []}
            for check in result.checks:
                original = originals.get(check.id)
                if (
                    original is None
                    or CHECK_KINDS.get(check.id) != check.kind
                    or check.kind != original.kind
                    or check.version != 1
                    or original.version != 1
                    or check.unit != original.unit
                    or check.required_evidence_kinds != original.required_evidence_kinds
                ):
                    raise ApiError(
                        503,
                        ErrorCode.SUGGESTIONS_FAILED,
                        "OpenAI returned unsupported criterion definitions. "
                        "Continue manually.",
                    )
            envelope = (
                JudgeSuiteCriteriaSuggestionsEnvelope
                if self.drafts.rubric_mode
                else SuiteCriteriaSuggestionsEnvelope
            )
            model = (
                JudgeSuiteCriteriaSuggestions
                if self.drafts.rubric_mode
                else SuiteCriteriaSuggestions
            )
            return envelope(
                data=model(
                    **result.model_dump(mode="json"),
                    draftVersion=row.draft_version,
                    provider="openai",
                    model=self.provider.config.model,
                )
            )
