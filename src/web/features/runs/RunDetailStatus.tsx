import {
  Alert,
  AlertTitle,
  Box,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { RunDetail, RunSummary } from "@featherlane/contracts";
import { StatusBadge } from "../../components/StatusBadge";
import { evaluation, execution } from "../../design/statusPresentation";

export function RunDetailStatus({
  detail,
  stale,
  refreshing,
  cancellationPending,
  cancellationError,
  uncertain,
  receipt,
}: {
  detail: RunDetail;
  stale: boolean;
  refreshing: boolean;
  cancellationPending: boolean;
  cancellationError: Error | null;
  uncertain: boolean;
  receipt: RunSummary | null;
}) {
  const counts = detail.trialCounts;
  return (
    <Stack spacing={5}>
      <Paper sx={{ p: 4 }}>
        <Stack
          direction="row"
          sx={{ flexWrap: "wrap", gap: 5, alignItems: "center" }}
        >
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 2 }}
            >
              EXECUTION
            </Typography>
            <StatusBadge value={execution[detail.executionState]} />
          </Box>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 2 }}
            >
              EVALUATION
            </Typography>
            <StatusBadge value={evaluation[detail.evaluationOutcome]} />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              SNAPSHOT · UTC
            </Typography>
            <Typography variant="body2">
              {detail.snapshotAt.replace("T", " ").replace("Z", "")}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              TRIALS
            </Typography>
            <Typography variant="body2">
              {counts.scheduled} scheduled · {counts.completed} completed ·{" "}
              {counts.failedCheck} failed-check · {counts.inconclusive}{" "}
              inconclusive · {counts.canceled} canceled ·{" "}
              {counts.infrastructureError} infrastructure-error ·{" "}
              {counts.skipped} skipped
            </Typography>
          </Box>
        </Stack>
      </Paper>
      {refreshing && (
        <Typography role="status" variant="caption" color="text.secondary">
          Refreshing run snapshot…
        </Typography>
      )}
      {stale && (
        <Alert severity="warning">
          <AlertTitle>Snapshot stale · refresh failed</AlertTitle>Execution and
          evaluation above are the last valid snapshot. The server state may
          have changed; refresh before relying on this view.
        </Alert>
      )}
      {detail.terminalReason && (
        <Alert severity="error">
          <AlertTitle>
            {detail.terminalReason.code === "CANCELLATION_UNCONFIRMED"
              ? "Cancellation unconfirmed"
              : "Execution failed"}{" "}
            · {detail.terminalReason.code}
          </AlertTitle>
          {detail.terminalReason.message} Recorded observations remain
          inspectable.
        </Alert>
      )}
      {detail.executionState === "CANCELED" && (
        <Alert severity="info">
          <AlertTitle>Cancellation confirmed</AlertTitle>This snapshot records
          Canceled. Aggregate evaluation is Not evaluated; earlier observations
          remain inspectable.
        </Alert>
      )}
      {detail.cancellationRequestedAt &&
        !["CANCELED", "ERROR", "COMPLETED"].includes(detail.executionState) && (
          <Alert severity="warning">
            <AlertTitle>Cancellation requested · stop not confirmed</AlertTitle>
            Requested {detail.cancellationRequestedAt} · deadline{" "}
            {detail.cancellationDeadlineAt ?? "unavailable"}. Execution remains{" "}
            {execution[detail.executionState].label} until authoritative
            confirmation.
          </Alert>
        )}
      {cancellationPending && (
        <Alert severity="info">
          <AlertTitle>Submitting cancellation request…</AlertTitle>Intent has
          not been acknowledged. Execution is unchanged.
        </Alert>
      )}
      {cancellationError && !(detail.cancellationRequestedAt || receipt) && (
        <Alert severity="error">
          <AlertTitle>
            {uncertain
              ? "Cancellation acknowledgment unconfirmed"
              : "Cancellation request rejected"}
          </AlertTitle>
          {cancellationError.message}{" "}
          {uncertain
            ? "Refresh the snapshot or retry the same request. No stopped state is inferred."
            : "No intent was recorded. You can retry."}
        </Alert>
      )}
      {receipt && !detail.cancellationRequestedAt && (
        <Alert severity="info">
          {receipt.cancellationRequestedAt
            ? "Intent was acknowledged. Refreshing the current run snapshot; stop is not confirmed."
            : "The run was already terminal. Refresh the snapshot to inspect its recorded outcome."}
        </Alert>
      )}
      {detail.evaluationOutcome === "INCONCLUSIVE" && (
        <Alert severity="warning">
          Execution completed, but required observations or verified evidence
          were insufficient. No passing result is inferred.
        </Alert>
      )}
      {detail.artifactSummary.expiredCount > 0 && (
        <Alert severity="warning">
          Raw evidence expired. Historical evaluations remain visible;
          inspection is descriptive only and no regression verdict is available.
        </Alert>
      )}
    </Stack>
  );
}
