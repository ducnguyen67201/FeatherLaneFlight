import { useEffect, useRef, type ComponentProps } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import type { JudgeTimeReference } from "@featherlane/contracts";
import { RunTimeline } from "./RunTimeline";
import { traceSnapshot } from "./runTraceModel";

export type JudgmentTimelineSelection = {
  trialId: string;
  checkId: string;
  reference: JudgeTimeReference;
};
export function RunJudgmentTimeline({
  selection,
  onBack,
  ...props
}: ComponentProps<typeof RunTimeline> & {
  selection: JudgmentTimelineSelection | null;
  onBack: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selection) title.current?.focus();
  }, [selection]);
  const trial = props.detail.trials.find(
    (item) => item.id === selection?.trialId,
  );
  const check = props.detail.checks.find(
    (item) => item.id === selection?.checkId,
  );
  const reference = selection?.reference;
  const records =
    props.page?.data.filter(
      (record) =>
        reference?.eventIds.includes(record.event.eventId) &&
        record.event.attemptId === trial?.attemptId &&
        record.event.trialId === trial?.id,
    ) ?? [];
  const interval =
    props.page && props.attemptId
      ? traceSnapshot(props.detail, props.page, props.attemptId).rows.find(
          (row) => row.trial?.id === trial?.id,
        )
      : undefined;
  const available =
    !!reference &&
    records.length === reference.eventIds.length &&
    interval?.startMs !== null &&
    interval?.startMs !== undefined &&
    interval.endMs !== null &&
    interval.endMs !== undefined &&
    reference.fromMs >= interval.startMs &&
    reference.toMs <= interval.endMs;
  const failureRange =
    available && reference.kind === "FAILURE_WINDOW" && trial
      ? { fromMs: reference.fromMs, toMs: reference.toMs, trialId: trial.id }
      : undefined;
  return (
    <Stack spacing={4}>
      {selection && (
        <>
          <Typography ref={title} component="h2" variant="h2" tabIndex={-1}>
            Timeline
          </Typography>
          <Alert
            severity={reference?.kind === "FAILURE_WINDOW" ? "error" : "info"}
            action={<Button onClick={onBack}>Back to result</Button>}
          >
            <Typography variant="subtitle2" component="p">
              {check?.title ?? "Selected criterion"} · repetition{" "}
              {trial?.repetitionIndex}
            </Typography>
            {reference && (
              <Typography sx={{ mt: 1 }}>
                From +{(reference.fromMs / 1000).toFixed(3)} s → To +
                {(reference.toMs / 1000).toFixed(3)} s ·{" "}
                {((reference.toMs - reference.fromMs) / 1000).toFixed(3)} s
              </Typography>
            )}
            <Typography variant="caption">
              {reference?.kind === "FAILURE_WINDOW"
                ? "Judge-cited failure window"
                : reference?.kind === "EVENT"
                  ? "Cited event"
                  : "Cited evidence window"}{" "}
              · attempt monotonic clock
            </Typography>
            {!available && (
              <Typography variant="body2" sx={{ mt: 2 }}>
                {props.pending
                  ? "Loading the cited timeline…"
                  : "The cited interval is not available in this event page. Its saved timestamps remain above; no interval is inferred."}
              </Typography>
            )}
          </Alert>
        </>
      )}
      <RunTimeline
        key={`${props.attemptId}:${selection?.checkId}:${reference?.fromMs}:${reference?.toMs}`}
        {...props}
        focusEvent={available && !failureRange ? records[0] : undefined}
        failureRange={failureRange}
      />
    </Stack>
  );
}
