"""Authorized committed judgments. Packets and provider data stay private."""

import json

from fastapi import APIRouter, Request
from featherlane_contracts import CheckOutcome
from featherlane_contracts.finalization import FinalizationTerminal
from featherlane_contracts.judging import (
    JudgeResponse,
    RunJudgments,
    RunJudgmentsEnvelope,
    TrialJudgment,
)
from sqlalchemy import select

from featherlane_api.http.errors import ERROR_RESPONSES
from featherlane_api.modules.evaluation.judge_store import JudgeRecord
from featherlane_api.modules.finalization.persistence import FinalizationRecord
from featherlane_api.modules.identity.dependencies import session_handle
from featherlane_api.modules.leases.persistence import LeaseStore
from featherlane_api.modules.runs.http import ContractHeader, RunId, Service, User

router = APIRouter(responses=ERROR_RESPONSES)


@router.get(
    "/api/v1/runs/{runId}/judgments",
    operation_id="getRunJudgments",
    response_model=RunJudgmentsEnvelope,
)
async def judgments(
    request: Request,
    run_id: RunId,
    principal: User,
    service: Service,
    contract_version: ContractHeader,
) -> RunJudgmentsEnvelope:
    async with service.session.begin():
        run = await service.store.exact(run_id)
        await service.authorize(principal, session_handle(request), run.project_id)
        attempts = await LeaseStore(service.session).for_run(run_id)
        saved = (
            await service.session.get(FinalizationRecord, attempts[-1].id)
            if attempts
            else None
        )
        state, trials = "NOT_EVALUATED", []
        if saved is not None and "judgePolicy" in saved.inputs:
            state = "PENDING"
            if saved.terminal is not None:
                terminal = FinalizationTerminal.model_validate_json(
                    json.dumps(saved.terminal)
                )
                state = (
                    "FINISHED" if terminal.execution_state == "COMPLETED" else "ERROR"
                )
                if state == "FINISHED":
                    rows = list(
                        await service.session.scalars(
                            select(JudgeRecord).where(
                                JudgeRecord.attempt_id == saved.attempt_id
                            )
                        )
                    )
                    for row in rows:
                        if row.response is None:
                            continue
                        response = JudgeResponse.model_validate_json(
                            json.dumps(row.response)
                        )
                        trial = next(t for t in terminal.trials if t.id == row.trial_id)
                        for result in response.results:
                            committed = next(
                                r
                                for r in trial.check_results
                                if r.check_id == result.check_id
                            )
                            if (
                                result.outcome != committed.outcome
                                or result.finding != committed.summary
                            ):
                                result.outcome = (
                                    committed.outcome or CheckOutcome.INCONCLUSIVE
                                )
                                result.finding = committed.summary
                                result.references = []
                        trials.append(
                            TrialJudgment.model_validate_json(
                                json.dumps(
                                    {
                                        **{
                                            k: v
                                            for k, v in row.identity.items()
                                            if k != "configuration"
                                        },
                                        "results": [
                                            r.model_dump(mode="json")
                                            for r in response.results
                                        ],
                                    }
                                )
                            )
                        )
        return RunJudgmentsEnvelope(data=RunJudgments(state=state, trials=trials))
