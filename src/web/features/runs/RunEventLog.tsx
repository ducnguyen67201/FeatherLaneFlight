import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import type {
  RunDetail,
  RunEventRecord,
  RunEventPage,
  TrialView,
} from "@featherlane/contracts";

import { tokens } from "../../design/theme";

function eventMessage(record: RunEventRecord, detail: RunDetail) {
  const event = record.event;
  switch (event.type) {
    case "ATTEMPT_STARTING":
      return `${event.payload.profileId} · owned process ${event.payload.ownedProcess ? "recorded" : "not recorded"}`;
    case "TRIAL_STARTED":
      return `${event.payload.scenarioId} · repetition ${event.payload.repetitionIndex}`;
    case "READINESS_OBSERVED":
      return `Readiness observed: ${event.payload.ready}`;
    case "MISSION_STARTED":
      return `Mission: ${event.payload.missionId}`;
    case "OBSERVATION_RECORDED": {
      const id = event.payload.observationId;
      const observation = detail.trials
        .filter(
          (trial) =>
            trial.attemptId === event.attemptId && trial.id === event.trialId,
        )
        .flatMap((trial) => trial.observationSummary)
        .find((item) => item.id === id);
      return observation
        ? `${observation.key}: ${String(observation.value)} ${observation.unit} · ${observation.sampleCount} sample`
        : `Observation reference: ${id} · value unavailable in this snapshot`;
    }
    case "TRIGGER_OBSERVED":
      return `Trigger reference: ${event.payload.triggerId}`;
    case "DISTURBANCE_REQUESTED":
      return `Disturbance requested: ${event.payload.disturbanceId}`;
    case "DISTURBANCE_CONFIRMED":
      return `Disturbance confirmation: ${event.payload.observationId}`;
    case "TRIAL_FINISHED":
      return `Trial execution: ${event.payload.executionState}`;
    case "CLEANUP_FINISHED":
      return `Owned process exit confirmed: ${event.payload.processExited}`;
  }
}
function elapsed(ms: number) {
  return `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}
export function RunEventLog({
  live = false,
  page,
  detail,
  trial,
  attemptId,
  pending,
  error,
  refreshing,
  onRetry,
}: {
  live?: boolean;
  page: RunEventPage | undefined;
  detail: RunDetail;
  trial: TrialView | undefined;
  attemptId: string | undefined;
  pending: boolean;
  error: Error | null;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const records =
    page?.data.filter(
      (record) =>
        record.event.attemptId === attemptId &&
        (record.event.trialId === null || record.event.trialId === trial?.id),
    ) ?? [];
  return (
    <Paper sx={{ p: 5, minWidth: 0 }}>
      <Typography component="h2" variant="h2">
        Event log
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 4 }}>
        {attemptId ?? "No attempt"} ·{" "}
        {trial ? `repetition ${trial.repetitionIndex}` : "no trial"} ·{" "}
        {records.length} events ·{" "}
        {live ? "server-acknowledged observations" : "synthetic snapshot"}
      </Typography>
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 4 }}
          action={<Button onClick={onRetry}>Retry</Button>}
        >
          Event page could not be refreshed. {error.message}
        </Alert>
      )}
      {pending ? (
        <Box role="status" aria-label="Loading event log">
          <Skeleton height={44} />
          <Skeleton height={200} />
        </Box>
      ) : (
        <>
          {refreshing && (
            <Typography variant="caption" role="status">
              Refreshing event snapshot…
            </Typography>
          )}
          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              bgcolor: "background.default",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <Stack
              direction="row"
              sx={{
                px: 4,
                py: 3,
                borderBottom: 1,
                borderColor: "divider",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 2,
              }}
            >
              <Typography variant="code" color="primary">
                $ events.log
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {detail.snapshotAt.slice(0, 10)} UTC ·{" "}
                {live ? "VALIDATED EVENT PAGE" : "STATIC SNAPSHOT"}
              </Typography>
            </Stack>
            <Box
              component="pre"
              aria-label="Recorded event log"
              tabIndex={0}
              sx={{
                m: 0,
                p: 4,
                maxHeight: `${tokens.layoutPx.eventLogMaxHeightVh}vh`,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                typography: "code",
              }}
            >
              {records.length === 0
                ? "[no recorded events in this trial snapshot]"
                : records.map((record) => (
                    <Box
                      component="span"
                      key={record.cursor}
                      sx={{
                        display: "block",
                        mb: 3,
                        "&:last-child": { mb: 0 },
                      }}
                    >
                      <Box component="span" sx={{ color: "text.secondary" }}>
                        {record.event.wallTimeUtc.slice(11)} +
                        {elapsed(record.event.monotonicElapsedMs)} #
                        {String(record.event.sequence).padStart(3, "0")}{" "}
                      </Box>
                      <Box component="span" sx={{ color: "info.main" }}>
                        {record.event.type}
                      </Box>
                      {"\n"}
                      {"  └─ "}
                      {eventMessage(record, detail)}
                    </Box>
                  ))}
            </Box>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 3 }}
          >
            Wall time: UTC · elapsed: monotonic · simulation timestamps are
            separate decimal microsecond strings when recorded.
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 2 }}
          >
            Read-only snapshot · server cursor {detail.serverEventCursor} ·
            attempt context plus selected trial.{" "}
            {page?.meta.nextCursor
              ? "More events exist beyond this bounded page."
              : ""}{" "}
            {live
              ? "Live events refresh this bounded server page; execution and results come from the run snapshot."
              : "No live stream or terminal commands."}
          </Typography>
        </>
      )}
    </Paper>
  );
}
