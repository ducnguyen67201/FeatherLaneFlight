import type {
  RunDetail,
  RunEventPage,
  RunEventRecord,
  TrialView,
} from "@featherlane/contracts";

// View geometry derived from canonical records, never a second transport model.
export type TraceRow = {
  id: string;
  title: string;
  trial: TrialView | undefined;
  depth: number;
  startMs: number | null;
  endMs: number | null;
  observedThroughMs: number | null;
  state: string;
  issue: string | null;
};
export type TraceSnapshot = {
  detail: RunDetail;
  page: RunEventPage;
  records: RunEventRecord[];
  rows: TraceRow[];
  maxMs: number;
};

function interval(
  id: string,
  title: string,
  trial: TrialView | undefined,
  records: RunEventRecord[],
  startType: "ATTEMPT_STARTING" | "TRIAL_STARTED",
  endType: "CLEANUP_FINISHED" | "TRIAL_FINISHED",
): TraceRow {
  const starts = records.filter((record) => record.event.type === startType);
  const ends = records.filter((record) => record.event.type === endType);
  const start = starts[0]?.event.monotonicElapsedMs ?? null;
  const end = ends[0]?.event.monotonicElapsedMs ?? null;
  const latest = records.length
    ? Math.max(...records.map((record) => record.event.monotonicElapsedMs))
    : null;
  const issue =
    starts.length > 1 || ends.length > 1
      ? "Conflicting interval boundaries"
      : start === null
        ? "Start not recorded"
        : end !== null &&
            (end < start ||
              (ends[0]?.event.sequence ?? 0) <=
                (starts[0]?.event.sequence ?? 0))
          ? "Inconsistent interval boundaries"
          : null;
  return {
    id,
    title,
    trial,
    depth: trial ? 1 : 0,
    startMs: issue ? null : start,
    endMs: issue ? null : end,
    observedThroughMs: issue ? null : (end ?? latest),
    state:
      issue ??
      (end !== null
        ? "Finished"
        : trial && !["RUNNING", "STARTING"].includes(trial.executionState)
          ? "End not recorded"
          : "End not received"),
    issue,
  };
}
export function traceSnapshot(
  detail: RunDetail,
  page: RunEventPage,
  attemptId: string,
): TraceSnapshot {
  const records = page.data.filter(
    (record) => record.event.attemptId === attemptId,
  );
  const context = records.filter((record) => record.event.trialId === null);
  const cleanupUnconfirmed = context.some(
    (record) =>
      record.event.type === "CLEANUP_FINISHED" &&
      !record.event.payload.processExited,
  );
  const rows = [
    interval(
      `attempt:${attemptId}`,
      "Recorded attempt window",
      undefined,
      context,
      "ATTEMPT_STARTING",
      "CLEANUP_FINISHED",
    ),
  ];
  // An open attempt can extend only as far as an actual event on its own clock.
  const attemptRow = rows[0]!;
  if (cleanupUnconfirmed) {
    attemptRow.endMs = null;
    attemptRow.state = "Process exit not confirmed";
  }
  if (!attemptRow.issue && attemptRow.endMs === null && records.length)
    attemptRow.observedThroughMs = Math.max(
      ...records.map((record) => record.event.monotonicElapsedMs),
    );
  for (const trial of detail.trials.filter(
    (item) => item.attemptId === attemptId,
  )) {
    rows.push(
      interval(
        trial.id,
        `Repetition ${trial.repetitionIndex} · ${trial.scenarioTitle}`,
        trial,
        records.filter((record) => record.event.trialId === trial.id),
        "TRIAL_STARTED",
        "TRIAL_FINISHED",
      ),
    );
  }
  return {
    detail,
    page,
    records,
    rows,
    maxMs: Math.max(
      0,
      ...records.map((record) => record.event.monotonicElapsedMs),
    ),
  };
}
export function traceSeconds(ms: number) {
  return `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} s`;
}
export function traceTickMs(range: number) {
  const value = Math.max(1000, range);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return (
    (value / magnitude <= 1
      ? 1
      : value / magnitude <= 2
        ? 2
        : value / magnitude <= 5
          ? 5
          : 10) * magnitude
  );
}
