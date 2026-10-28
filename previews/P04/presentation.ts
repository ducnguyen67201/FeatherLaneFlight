import type {
  CheckOutcome,
  EvaluationOutcome,
  ExecutionState,
} from "@featherlane/contracts";

// Bounded visual samples, not wire DTOs. Detail contracts are deferred until approval.
export const modes = [
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
export type Mode = (typeof modes)[number];
export function status(mode: Mode): {
  executionState: ExecutionState;
  evaluationOutcome: EvaluationOutcome;
} {
  if (mode === "Tests passed")
    return { executionState: "COMPLETED", evaluationOutcome: "PASS" };
  if (["Inconclusive", "Missing evidence"].includes(mode))
    return { executionState: "COMPLETED", evaluationOutcome: "INCONCLUSIVE" };
  if (["Infrastructure error", "Cancellation unconfirmed"].includes(mode))
    return { executionState: "ERROR", evaluationOutcome: "NOT_EVALUATED" };
  if (mode === "Canceled")
    return { executionState: "CANCELED", evaluationOutcome: "NOT_EVALUATED" };
  if (mode === "Queued" || mode === "Empty trials")
    return { executionState: "QUEUED", evaluationOutcome: "NOT_EVALUATED" };
  if (
    [
      "Running",
      "Stale view",
      "Cancellation pending",
      "Cancellation rejected",
    ].includes(mode)
  )
    return { executionState: "RUNNING", evaluationOutcome: "NOT_EVALUATED" };
  return { executionState: "COMPLETED", evaluationOutcome: "FAIL" };
}
export const checkLabels = [
  "Mission completion",
  "Landing and disarm",
  "Completion time",
];
export function checkOutcome(
  mode: Mode,
  selected: number,
): CheckOutcome | null {
  if (
    [
      "Running",
      "Queued",
      "Stale view",
      "Cancellation pending",
      "Cancellation rejected",
      "Canceled",
      "Infrastructure error",
      "Cancellation unconfirmed",
    ].includes(mode)
  )
    return null;
  if (["Inconclusive", "Missing evidence"].includes(mode))
    return "INCONCLUSIVE";
  return selected === 2 && mode !== "Tests passed" ? "FAIL" : "PASS";
}
export const digest = `sha256:${"d4".repeat(32)}`;
export const manifestRows = [
  ["Contract / protocol", "1 / 1"],
  ["Build", "build_candidate · PX4 candidate"],
  ["Build digest", digest],
  ["Configuration digest", `sha256:${"a1".repeat(32)}`],
  ["Suite", "Nominal flight · revision 3"],
  ["Suite digest", `sha256:${"b2".repeat(32)}`],
  ["Integration / digest", `fake-simulation v1 · sha256:${"c3".repeat(32)}`],
  ["Local profile / digest", `local_demo v1 · sha256:${"e5".repeat(32)}`],
  ["Runner / Python / MAVSDK / PX4", "demo-1 / 3.12 / 4.1 / synthetic"],
  ["Simulator / vehicle", "Synthetic fixture / quadrotor"],
  ["OS / architecture", "Linux / x86_64 (sample)"],
  ["Clock / speed", "Monotonic + simulation / 1×"],
  ["Randomization / repetitions", "Fixed seed 42 / 3 · no independence claim"],
  [
    "Checks / thresholds",
    "Mission complete; landed + disarmed; duration ≤ 90 s",
  ],
  [
    "Evidence policy / evaluator",
    "ULog + observations + redacted log / nominal-v1",
  ],
];
export const events = [
  ["1", "ATTEMPT_STARTING", "00:00.000", "Owned synthetic process initialized"],
  ["2", "TRIAL_STARTED", "00:01.000", "Nominal flight · repetition 1"],
  [
    "3",
    "READINESS_OBSERVED",
    "00:03.100",
    "Required readiness observations present",
  ],
  ["4", "MISSION_STARTED", "00:05.000", "Synthetic mission observation"],
  ["5", "OBSERVATION_RECORDED", "01:36.400", "Completion duration: 91.4 s"],
  ["6", "TRIAL_FINISHED", "01:37.000", "Trial observations collected"],
  [
    "7",
    "CLEANUP_FINISHED",
    "01:38.000",
    "Owned synthetic process exit recorded",
  ],
];
export const artifacts = [
  {
    name: "flight.ulg",
    kind: "PX4 ULog",
    size: "2.4 MiB",
    type: "application/octet-stream",
  },
  {
    name: "observations.json",
    kind: "Normalized observations",
    size: "8.2 KiB",
    type: "application/json",
  },
  {
    name: "process.log",
    kind: "Redacted process log",
    size: "12.1 KiB",
    type: "text/plain",
  },
];
