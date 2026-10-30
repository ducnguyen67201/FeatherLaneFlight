"""Project immutable server results into the existing authorized run detail."""

from featherlane_contracts import TrialExecutionState
from featherlane_contracts.finalization import FinalizationTerminal
from featherlane_contracts.run_detail import RunDetail, TrialCounts


def apply_results(detail: RunDetail, terminal: FinalizationTerminal) -> None:
    detail.trials = terminal.trials
    trials = terminal.trials
    detail.trial_counts = TrialCounts(
        scheduled=len(trials),
        completed=sum(
            t.execution_state == TrialExecutionState.COMPLETED for t in trials
        ),
        failedCheck=sum(t.evaluation_outcome.value == "FAIL" for t in trials),
        inconclusive=sum(t.evaluation_outcome.value == "INCONCLUSIVE" for t in trials),
        canceled=sum(t.execution_state == TrialExecutionState.CANCELED for t in trials),
        infrastructureError=sum(
            t.execution_state == TrialExecutionState.ERROR for t in trials
        ),
        skipped=sum(t.execution_state == TrialExecutionState.SKIPPED for t in trials),
    )
