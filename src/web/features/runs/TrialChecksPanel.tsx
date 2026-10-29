import { useState } from "react";
import {
  Alert,
  Box,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { CheckDefinition, TrialView } from "@featherlane/contracts";
import {
  check,
  trial as trialPresentation,
} from "../../design/statusPresentation";
import { StatusBadge } from "../../components/StatusBadge";
import { tokens } from "../../design/theme";

export function TrialChecksPanel({
  trials,
  selectedTrial,
  checks,
  onSelectTrial,
}: {
  trials: TrialView[];
  selectedTrial: TrialView | undefined;
  checks: CheckDefinition[];
  onSelectTrial: (id: string) => void;
}) {
  const [checkId, setCheckId] = useState("completion_duration");
  const definition = checks.find((item) => item.id === checkId) ?? checks[0];
  const result = selectedTrial?.checkResults.find(
    (item) => item.checkId === definition?.id,
  );
  const observation = selectedTrial?.observationSummary.find(
    (item) => item.id === result?.observationId,
  );
  const label = selectedTrial
    ? `${selectedTrial.scenarioTitle} · ${selectedTrial.repetitionIndex}`
    : "No trial selected";
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          lg: `${tokens.layoutPx.checkPaneWidth}px minmax(0, 1fr)`,
        },
        gap: 4,
        alignItems: "start",
      }}
    >
      <Paper sx={{ p: 4 }}>
        <Typography component="h2" variant="h2" sx={{ mb: 3 }}>
          Trials and checks
        </Typography>
        {trials.length === 0 ? (
          <Typography color="text.secondary">
            No trials are recorded in this snapshot. Observed inputs and results
            are unavailable before startup.
          </Typography>
        ) : (
          <>
            <List disablePadding aria-label="Trials">
              {trials.map((item) => (
                <ListItemButton
                  key={item.id}
                  selected={selectedTrial?.id === item.id}
                  aria-current={
                    selectedTrial?.id === item.id ? "true" : undefined
                  }
                  onClick={() => onSelectTrial(item.id)}
                  sx={{ minHeight: 44, mb: 1, flexWrap: "wrap" }}
                >
                  <ListItemText
                    primary={`${item.scenarioTitle} · ${item.repetitionIndex}`}
                    secondary={`Repetition ${item.repetitionIndex}`}
                  />
                  <StatusBadge value={trialPresentation[item.executionState]} />
                </ListItemButton>
              ))}
            </List>
            <Divider sx={{ my: 3 }} />
            <Typography variant="caption" color="text.secondary">
              CHECKS · REPETITION {selectedTrial?.repetitionIndex}
            </Typography>
            <List disablePadding aria-label="Checks">
              {checks.map((item) => {
                const value = selectedTrial?.checkResults.find(
                  (r) => r.checkId === item.id,
                );
                return (
                  <ListItemButton
                    key={item.id}
                    selected={definition?.id === item.id}
                    aria-current={
                      definition?.id === item.id ? "true" : undefined
                    }
                    onClick={() => setCheckId(item.id)}
                    sx={{ minHeight: 44, my: 1, flexWrap: "wrap", gap: 1 }}
                  >
                    <ListItemText
                      primary={item.title}
                      sx={{ flexBasis: "100%" }}
                    />
                    {value?.outcome ? (
                      <StatusBadge value={check[value.outcome]} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        No final evaluation
                      </Typography>
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          </>
        )}
      </Paper>
      <Paper sx={{ p: { xs: 4, md: 6 }, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          SELECTED CHECK · {label.toUpperCase()}
        </Typography>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 3,
            mt: 2,
            mb: 4,
          }}
        >
          <Typography component="h2" variant="h2">
            {selectedTrial ? definition?.title : "No check selected"}
          </Typography>
          {result?.outcome && <StatusBadge value={check[result.outcome]} />}
        </Stack>
        {!selectedTrial ? (
          <Alert severity="info">
            The manifest and evidence tabs remain available. No values are
            inferred from missing observations.
          </Alert>
        ) : (
          <>
            <Typography color="text.secondary" sx={{ mb: 5 }}>
              {definition?.id} · version {definition?.version}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 4,
                mb: 5,
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  EXPECTED
                </Typography>
                <Typography sx={{ mt: 2 }}>{definition?.expected}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  OBSERVED
                </Typography>
                <Typography sx={{ mt: 2 }}>
                  {observation
                    ? `${typeof observation.value === "boolean" ? (observation.value ? "Observed true" : "Observed false") : `${observation.value} ${observation.unit}`} · ${observation.sampleCount} sample`
                    : "No sufficient validated observation"}
                </Typography>
              </Box>
            </Box>
            <Alert
              severity={
                result?.outcome === "FAIL"
                  ? "error"
                  : result?.outcome === "INCONCLUSIVE"
                    ? "warning"
                    : "info"
              }
            >
              {result?.summary ?? "No result is recorded for this check."}
            </Alert>
            <Divider sx={{ my: 5 }} />
            <Typography component="h3" variant="h3" sx={{ mb: 3 }}>
              Evidence references
            </Typography>
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
              {result?.artifactIds.length
                ? result.artifactIds.join(" · ")
                : "No evidence references recorded."}
            </Typography>
            {observation && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Source clock: {observation.sourceClock.toLowerCase()} · elapsed{" "}
                {observation.monotonicElapsedMs} ms · simulation time{" "}
                {observation.simulationTimeUs ?? "unavailable"}
                {observation.simulationTimeUs !== null ? " µs" : ""}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Inspect current availability, verification and retention in
              Evidence. Inconclusive when: {definition?.inconclusiveWhen}
            </Typography>
          </>
        )}
      </Paper>
    </Box>
  );
}
