import {
  Alert,
  Box,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type {
  CheckDefinition,
  JudgeTimeReference,
  RunEventPage,
  RunJudgments,
  TrialView,
} from "@featherlane/contracts";
import { tokens } from "../../design/theme";
import { CriterionResultRow } from "./CriterionResultRow";

export function RunCriteriaResults({
  trials,
  selectedTrial,
  checks,
  page,
  judgments,
  error,
  onSelectTrial,
  onViewTimeline,
}: {
  trials: TrialView[];
  selectedTrial: TrialView | undefined;
  checks: CheckDefinition[];
  page: RunEventPage | undefined;
  judgments: RunJudgments | undefined;
  error: Error | null;
  onSelectTrial: (id: string) => void;
  onViewTimeline: (checkId: string, reference: JudgeTimeReference) => void;
}) {
  const identity = judgments?.trials.find(
    (item) =>
      item.trialId === selectedTrial?.id &&
      item.attemptId === selectedTrial?.attemptId,
  );
  return (
    <Stack spacing={4}>
      {error && (
        <Alert severity="warning">
          Judge details could not be refreshed. Recorded result summaries remain
          visible; judge citations are unavailable. Recorded observation links
          remain available.
        </Alert>
      )}
      <TextField
        select
        label="Scenario / repetition"
        value={selectedTrial?.id ?? ""}
        onChange={(event) => onSelectTrial(event.target.value)}
        sx={{ maxWidth: tokens.layoutPx.formMaxWidth }}
      >
        {trials.map((trial) => (
          <MenuItem key={trial.id} value={trial.id}>
            {trial.scenarioTitle} · repetition {trial.repetitionIndex}
          </MenuItem>
        ))}
      </TextField>
      <Box>
        <Typography component="h2" variant="h2">
          Criterion results
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 2, mb: 4 }}
        >
          View the reason or jump straight to the cited time in the Timeline
          tab.
        </Typography>
        {selectedTrial ? (
          <TableContainer component={Paper} variant="outlined">
            <Table
              aria-label="Criterion results"
              sx={{
                minWidth: tokens.layoutPx.runTableMinWidth,
                tableLayout: "fixed",
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "26%" }}>Criterion</TableCell>
                  <TableCell sx={{ width: "14%" }}>Result</TableCell>
                  <TableCell sx={{ width: "28%" }}>Reason</TableCell>
                  <TableCell align="right" sx={{ width: "32%" }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {checks.map((check, index) => (
                  <CriterionResultRow
                    key={`${selectedTrial.id}:${check.id}`}
                    number={index + 1}
                    check={check}
                    trial={selectedTrial}
                    page={page}
                    judgment={
                      !error
                        ? identity?.results.find(
                            (item) =>
                              item.checkId === check.id &&
                              item.checkVersion === check.version,
                          )
                        : undefined
                    }
                    identity={!error ? identity : undefined}
                    unavailable={
                      judgments?.state === "ERROR" ||
                      selectedTrial.executionState === "ERROR"
                    }
                    judging={judgments?.state === "PENDING"}
                    onViewTimeline={(reference) =>
                      onViewTimeline(check.id, reference)
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">
            No trials are recorded yet. No evaluation is inferred.
          </Alert>
        )}
      </Box>
    </Stack>
  );
}
