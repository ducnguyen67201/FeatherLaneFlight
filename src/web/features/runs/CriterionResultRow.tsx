import { Fragment, useState } from "react";
import {
  Collapse,
  TableCell,
  TableRow,
  Box,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import type {
  CheckDefinition,
  RunEventPage,
  TrialView,
  JudgeCriterionResult,
  JudgeTimeReference,
  TrialJudgment,
} from "@featherlane/contracts";
import { StatusBadge } from "../../components/StatusBadge";
import {
  check as checkPresentation,
  evaluation,
} from "../../design/statusPresentation";

export function CriterionResultRow({
  number,
  check,
  trial,
  page,
  unavailable,
  judging,
  onViewTimeline,
  judgment,
  identity,
}: {
  number: number;
  check: CheckDefinition;
  trial: TrialView;
  page: RunEventPage | undefined;
  unavailable: boolean;
  judging: boolean;
  onViewTimeline: (reference: JudgeTimeReference) => void;
  judgment?: JudgeCriterionResult;
  identity?: TrialJudgment;
}) {
  const [expanded, setExpanded] = useState(false);
  const result = trial.checkResults.find((item) => item.checkId === check.id);
  const observation = trial.observationSummary.find(
    (item) => item.id === result?.observationId,
  );
  const event = page?.data.find(
    (record) =>
      record.event.trialId === trial.id &&
      record.event.type === "OBSERVATION_RECORDED" &&
      record.event.payload.observationId === observation?.id,
  );
  const outcome = judgment?.outcome ?? result?.outcome;
  const label = unavailable
    ? "Not evaluated"
    : judging
      ? "Judging"
      : outcome === "PASS"
        ? "Passed"
        : outcome === "FAIL"
          ? "Failed"
          : outcome === "INCONCLUSIVE"
            ? "Inconclusive"
            : "Not evaluated";
  const status = outcome
    ? checkPresentation[outcome]
    : evaluation.NOT_EVALUATED;
  const reason = unavailable
    ? "Evaluation could not be completed. This is a processing error, not a failed criterion."
    : judging
      ? "Waiting for a validated judge response."
      : (judgment?.finding ??
        result?.summary ??
        "No final evaluation is recorded.");
  const reference: JudgeTimeReference | undefined =
    judgment?.references.find((item) => item.kind === "FAILURE_WINDOW") ??
    judgment?.references[0] ??
    (event
      ? {
          clock: "MONOTONIC",
          kind: "EVENT",
          eventIds: [event.event.eventId],
          artifactIds: [],
          fromMs: event.event.monotonicElapsedMs,
          toMs: event.event.monotonicElapsedMs,
        }
      : undefined);
  const timelineAvailable = !!reference && !unavailable && !judging;
  const failureRange =
    reference?.kind === "FAILURE_WINDOW" ? reference : undefined;
  const summaryId = `criterion-${check.id}-summary`;
  const summary = reason;
  return (
    <Fragment>
      <TableRow
        hover
        sx={{ bgcolor: expanded ? "action.selected" : undefined }}
      >
        <TableCell component="th" scope="row">
          <Typography variant="body2" sx={{ fontWeight: "fontWeightMedium" }}>
            {check.title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1 }}
          >
            Criterion {number} · {check.expected}
          </Typography>
        </TableCell>
        <TableCell>
          <StatusBadge value={{ ...status, label }} />
        </TableCell>
        <TableCell>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {summary}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Stack
            direction="row"
            sx={{ gap: 1, justifyContent: "flex-end", flexWrap: "wrap" }}
          >
            <Button
              size="small"
              id={summaryId}
              aria-label={`${expanded ? "Hide" : "View"} reason for ${check.title}`}
              aria-expanded={expanded}
              aria-controls={`criterion-${check.id}-reason`}
              endIcon={
                <ExpandMore
                  sx={{ transform: expanded ? "rotate(180deg)" : undefined }}
                />
              }
              onClick={() => {
                setExpanded(!expanded);
              }}
              sx={{ whiteSpace: "nowrap" }}
            >
              {expanded ? "Hide reason" : "View reason"}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!timelineAvailable}
              aria-label={`View timeline for ${check.title}`}
              aria-controls="judgment-timeline-panel"
              onClick={() => {
                if (timelineAvailable && reference) onViewTimeline(reference);
              }}
              sx={{ whiteSpace: "nowrap" }}
            >
              View timeline
            </Button>
          </Stack>
        </TableCell>
      </TableRow>
      <TableRow aria-hidden={!expanded}>
        <TableCell
          colSpan={4}
          sx={{ p: 0, borderBottom: expanded ? undefined : 0 }}
        >
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box
              id={`criterion-${check.id}-reason`}
              role="region"
              aria-labelledby={summaryId}
              sx={{ p: { xs: 4, md: 5 } }}
            >
              <Stack spacing={3}>
                <Typography component="h3" variant="subtitle2">
                  {outcome === "FAIL"
                    ? "Why it failed"
                    : outcome === "PASS"
                      ? "Why it passed"
                      : "Evaluation status"}
                </Typography>
                <Typography>{reason}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Requirement: {check.expected}
                </Typography>
                {failureRange && (
                  <Typography variant="body2" color="status.failure.foreground">
                    Failure window: +{(failureRange.fromMs / 1000).toFixed(3)} s
                    → +{(failureRange.toMs / 1000).toFixed(3)} s
                  </Typography>
                )}
                {reference ? (
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 2 }}
                    >
                      Cited time: +{(reference.fromMs / 1000).toFixed(3)} s → +
                      {(reference.toMs / 1000).toFixed(3)} s · attempt monotonic
                      clock
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No linked timeline is available for this result.
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  Repetition {trial.repetitionIndex} ·{" "}
                  {identity
                    ? `${identity.engine} · prompt ${identity.promptVersion} · ${identity.model}`
                    : "Versioned server evaluation"}
                </Typography>
              </Stack>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}
