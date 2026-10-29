import type {
  ArtifactView,
  CreateRunRequest,
  RunDetail,
  RunEventRecord,
  RunListEntry,
} from "@featherlane/contracts";
import {
  zArtifactListEnvelope,
  zRunDetailEnvelope,
  zRunEventPage,
} from "@featherlane/contracts/validators";
import detailPayload from "./runDetail.json";
import artifactPayload from "./runArtifacts.json";
import eventPayload from "./runEvents.json";
import { runOptionsFixture } from "./runsDemo";

const detailFixture = zRunDetailEnvelope.parse(detailPayload).data;
const artifactFixture = zArtifactListEnvelope.parse(artifactPayload).data;
const eventFixture = zRunEventPage.parse(eventPayload).data;
export const detailModes = [
  "Recorded snapshot",
  "Assertion failed",
  "Tests passed",
  "Inconclusive",
  "Infrastructure error",
  "Running",
  "Queued",
  "Stale view",
  "Missing evidence",
  "Expired evidence",
  "Loading",
  "Empty trials",
  "Request error",
  "Cancellation pending",
  "Cancellation rejected",
  "Cancellation unconfirmed",
  "Canceled",
] as const;
export type DetailMode = (typeof detailModes)[number];

// These are deterministic, explicitly selected mock snapshots, never runtime evaluation.
export function makeDetailSnapshot(
  run: RunListEntry,
  input: CreateRunRequest | null,
  mode: DetailMode,
  intent: { requestedAt: string; deadlineAt: string | null } | null,
) {
  const detail: RunDetail = { ...structuredClone(detailFixture), ...run };
  if (
    [
      "Running",
      "Stale view",
      "Cancellation pending",
      "Cancellation rejected",
    ].includes(mode)
  ) {
    detail.executionState = "RUNNING";
    detail.evaluationOutcome = "NOT_EVALUATED";
  } else if (["Queued", "Empty trials"].includes(mode)) {
    detail.executionState = "QUEUED";
    detail.evaluationOutcome = "NOT_EVALUATED";
  } else if (
    ["Infrastructure error", "Cancellation unconfirmed"].includes(mode)
  ) {
    detail.executionState = "ERROR";
    detail.evaluationOutcome = "NOT_EVALUATED";
  } else if (mode === "Canceled") {
    detail.executionState = "CANCELED";
    detail.evaluationOutcome = "NOT_EVALUATED";
  } else if (
    [
      "Assertion failed",
      "Tests passed",
      "Inconclusive",
      "Missing evidence",
      "Expired evidence",
    ].includes(mode)
  ) {
    detail.executionState = "COMPLETED";
    detail.evaluationOutcome = ["Inconclusive", "Missing evidence"].includes(
      mode,
    )
      ? "INCONCLUSIVE"
      : mode === "Tests passed"
        ? "PASS"
        : "FAIL";
  }
  if (mode === "Expired evidence" && run.executionState === "COMPLETED")
    detail.evaluationOutcome = run.evaluationOutcome;
  const queued = detail.executionState === "QUEUED";
  const canceledBeforeStart =
    detail.executionState === "CANCELED" && run.startedAt === null;
  const noExecution = queued || canceledBeforeStart;
  const active = ["RUNNING", "CLAIMED", "STARTING", "FINALIZING"].includes(
    detail.executionState,
  );
  const completed = detail.executionState === "COMPLETED";
  const passed = detail.evaluationOutcome === "PASS";
  const inconclusive = detail.evaluationOutcome === "INCONCLUSIVE";
  const repetitions = input?.repetitions ?? 3;
  const attemptId = `${run.id}_attempt_1`;
  const started = noExecution ? null : (run.startedAt ?? run.createdAt);
  const startMs = Date.parse(started ?? run.createdAt);
  const at = (ms: number) => new Date(startMs + ms).toISOString();
  detail.startedAt = started;
  detail.finishedAt = canceledBeforeStart
    ? (run.finishedAt ?? intent?.requestedAt ?? run.createdAt)
    : queued || active
      ? null
      : at(repetitions * 100000);
  detail.snapshotAt = at(
    queued ? 1000 : active ? 6000 : repetitions * 100000 + 1000,
  );
  detail.cancellationRequestedAt = intent?.requestedAt ?? null;
  detail.cancellationDeadlineAt = intent?.deadlineAt ?? null;
  if (intent)
    detail.snapshotAt = new Date(
      Math.max(
        Date.parse(detail.snapshotAt),
        Date.parse(intent.requestedAt) + 50,
      ),
    ).toISOString();
  if (canceledBeforeStart) {
    detail.cancellationRequestedAt =
      intent?.requestedAt ?? run.cancellationRequestedAt ?? detail.finishedAt;
    detail.cancellationDeadlineAt = null;
    detail.snapshotAt = detail.finishedAt!;
  } else if (["Cancellation unconfirmed", "Canceled"].includes(mode)) {
    detail.cancellationRequestedAt = at(0);
    detail.cancellationDeadlineAt = at(30000);
    detail.snapshotAt = at(31000);
    detail.finishedAt = at(31000);
  }
  detail.terminalReason =
    detail.executionState === "ERROR"
      ? {
          code:
            mode === "Cancellation unconfirmed"
              ? "CANCELLATION_UNCONFIRMED"
              : "TELEMETRY_DISCONNECTED",
          message:
            mode === "Cancellation unconfirmed"
              ? "The cancellation deadline elapsed without confirmed process exit. Runner cleanup is required."
              : "The telemetry connection failed. Aggregate evaluation is not available.",
        }
      : null;
  const build = runOptionsFixture.data.builds.find(
    (item) => item.id === run.buildId,
  );
  const suite = runOptionsFixture.data.suites.find(
    (item) => item.id === run.suiteRevisionId,
  );
  detail.requestedManifest = {
    ...detail.requestedManifest,
    buildId: run.buildId,
    buildDigest: build?.artifactSha256 ?? detail.requestedManifest.buildDigest,
    suiteRevisionId: run.suiteRevisionId,
    suiteRevision: run.suiteRevision,
    suiteDigest: suite?.digest ?? detail.requestedManifest.suiteDigest,
    localProfileDigest:
      input?.localExecutionProfileDigest ??
      detail.requestedManifest.localProfileDigest,
    repetitions,
  };
  detail.attempts = noExecution
    ? []
    : [
        {
          id: attemptId,
          observedManifest: structuredClone(detail.requestedManifest),
          startedAt: started,
          finishedAt: detail.finishedAt,
          terminalReason: detail.terminalReason,
        },
      ];
  detail.trials = [];
  const artifacts: ArtifactView[] = [];
  const records: RunEventRecord[] = [];
  const addEvent = (
    template: RunEventRecord,
    trialId: string | null,
    offset: number,
  ) => {
    const record = structuredClone(template);
    const sequence = records.length + 1;
    record.cursor = `${run.id}_event_${sequence}`;
    record.event.eventId = record.cursor;
    record.event.sequence = sequence;
    record.event.trialId = trialId;
    record.event.attemptId = attemptId;
    record.event.wallTimeUtc = at(offset);
    record.receivedAt = at(offset + 50);
    record.event.monotonicElapsedMs = offset;
    record.event.simulationTimeUs = String(Math.round(offset * 1000));
    records.push(record);
    return record;
  };
  if (!noExecution) addEvent(eventFixture[0]!, null, 0);
  for (let i = 1; !noExecution && i <= repetitions; i++) {
    const trial = structuredClone(detailFixture.trials[0]!);
    const tid = `${run.id}_trial_${i}`;
    const offset = (i - 1) * 100000;
    trial.id = tid;
    trial.attemptId = attemptId;
    trial.repetitionIndex = i;
    trial.startedAt = at(offset + 1000);
    trial.finishedAt = completed ? at(offset + 97000) : null;
    trial.executionState = completed
      ? "COMPLETED"
      : i > 1
        ? "SKIPPED"
        : active
          ? "RUNNING"
          : detail.executionState === "CANCELED"
            ? "CANCELED"
            : "ERROR";
    if (active && i > 1) {
      trial.executionState = "PENDING";
      trial.startedAt = null;
    }
    if (trial.executionState === "SKIPPED") trial.startedAt = null;
    trial.evaluationOutcome = completed
      ? detail.evaluationOutcome
      : "NOT_EVALUATED";
    trial.terminalReason = i === 1 ? detail.terminalReason : null;
    const ids = [
      `${run.id}_ulog_${i}`,
      `${run.id}_observations_${i}`,
      `${run.id}_process_${i}`,
    ];
    trial.observationSummary =
      completed && !inconclusive
        ? trial.observationSummary.map((observation) => {
            const sample = structuredClone(observation);
            sample.id = `${tid}_${sample.checkId}`;
            if (sample.unit === "s" && passed) sample.value = 84.2;
            sample.monotonicElapsedMs = offset + 96400;
            sample.simulationTimeUs = String((offset + 96400) * 1000);
            sample.artifactIds = ids.slice(0, 2);
            return sample;
          })
        : [];
    trial.checkResults = trial.checkResults.map((result) => ({
      ...result,
      outcome: !completed
        ? null
        : inconclusive
          ? "INCONCLUSIVE"
          : result.checkId === "completion_duration" && !passed
            ? "FAIL"
            : "PASS",
      observationId:
        trial.observationSummary.find(
          (observation) => observation.checkId === result.checkId,
        )?.id ?? null,
      artifactIds: completed ? ids.slice(0, 2) : [],
      summary: !completed
        ? "No final evaluation is available in this snapshot."
        : inconclusive
          ? "Required observations or verified evidence are unavailable. No verdict is inferred."
          : result.checkId === "completion_duration" && passed
            ? "Recorded duration is 84.2 s against the frozen 90.0 s limit."
            : result.summary,
    }));
    detail.trials.push(trial);
    for (let j = 0; j < 3; j++) {
      if (
        trial.executionState === "PENDING" ||
        trial.executionState === "SKIPPED"
      )
        continue;
      const artifact: ArtifactView = {
        ...structuredClone(artifactFixture[j]!),
        id: ids[j]!,
        trialId: tid,
        attemptId,
        createdAt: completed ? at(offset + 98000) : null,
        expiresAt: at(offset + 98000 + 86400000),
      };
      if (!completed) {
        artifact.availability = "NOT_COLLECTED";
        artifact.verificationState = "NOT_VERIFIED";
        artifact.byteLength = null;
        artifact.sha256 = null;
        artifact.expiresAt = null;
      }
      if (mode === "Missing evidence" && j < 2) {
        artifact.availability = "MISSING";
        artifact.verificationState = "NOT_VERIFIED";
      }
      if (mode === "Expired evidence") {
        artifact.availability = "EXPIRED";
        artifact.expiresAt = at(repetitions * 100000 - 1000);
      }
      artifacts.push(artifact);
    }
    if (
      trial.executionState === "PENDING" ||
      trial.executionState === "SKIPPED"
    )
      continue;
    for (const template of eventFixture.slice(1, 6)) {
      if (
        !completed &&
        ["OBSERVATION_RECORDED", "TRIAL_FINISHED"].includes(template.event.type)
      )
        continue;
      const record = addEvent(
        template,
        tid,
        offset + template.event.monotonicElapsedMs,
      );
      if (record.event.type === "TRIAL_STARTED")
        record.event.payload.repetitionIndex = i;
      if (record.event.type === "OBSERVATION_RECORDED") {
        const observation = trial.observationSummary.find(
          (item) => item.checkId === "completion_duration",
        );
        if (!observation) {
          records.pop();
          continue;
        }
        record.event.payload.observationId = observation.id;
      }
    }
  }
  if (completed)
    addEvent(
      eventFixture[eventFixture.length - 1]!,
      null,
      repetitions * 100000 - 2000,
    );
  detail.serverEventCursor = records.at(-1)?.cursor ?? `${run.id}_event_0`;
  detail.artifactSummary = {
    totalCount: artifacts.length,
    availableVerifiedCount: artifacts.filter(
      (a) =>
        a.availability === "AVAILABLE" && a.verificationState === "VERIFIED",
    ).length,
    missingCount: artifacts.filter((a) => a.availability === "MISSING").length,
    expiredCount: artifacts.filter((a) => a.availability === "EXPIRED").length,
  };
  detail.trialCounts = {
    scheduled: repetitions,
    completed: detail.trials.filter((t) => t.executionState === "COMPLETED")
      .length,
    failedCheck: detail.trials.filter((t) => t.evaluationOutcome === "FAIL")
      .length,
    inconclusive: detail.trials.filter(
      (t) => t.evaluationOutcome === "INCONCLUSIVE",
    ).length,
    canceled: detail.trials.filter((t) => t.executionState === "CANCELED")
      .length,
    infrastructureError: detail.trials.filter(
      (t) => t.executionState === "ERROR",
    ).length,
    skipped: detail.trials.filter((t) => t.executionState === "SKIPPED").length,
  };
  return {
    detail: zRunDetailEnvelope.parse({ data: detail }),
    artifacts: zArtifactListEnvelope.parse({ data: artifacts }),
    events: zRunEventPage.parse({ data: records, meta: { nextCursor: null } }),
  };
}
