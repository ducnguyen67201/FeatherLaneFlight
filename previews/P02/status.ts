import type {
  CheckOutcome,
  EvaluationOutcome,
  ExecutionState,
  RunnerCapacityState,
  RunnerConnectionState,
  SuiteStatus,
  TrialExecutionState,
} from "@featherlane/contracts";
import type { SvgIconComponent } from "@mui/icons-material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import HighlightOff from "@mui/icons-material/HighlightOff";
import ErrorOutlined from "@mui/icons-material/ErrorOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import RemoveCircleOutlined from "@mui/icons-material/RemoveCircleOutlined";
import Schedule from "@mui/icons-material/Schedule";
import WarningAmber from "@mui/icons-material/WarningAmber";
import { tokens } from "./theme";

export type Presentation = {
  label: string;
  role: keyof typeof tokens.color.status;
  icon: SvgIconComponent;
};
const pending = (label: string): Presentation => ({
  label,
  role: "pending",
  icon: Schedule,
});
const neutral = (label: string): Presentation => ({
  label,
  role: "neutral",
  icon: RemoveCircleOutlined,
});
const success = (label: string): Presentation => ({
  label,
  role: "success",
  icon: CheckCircleOutlined,
});
const warning = (label: string): Presentation => ({
  label,
  role: "warning",
  icon: WarningAmber,
});
const infrastructure = (label: string): Presentation => ({
  label,
  role: "infrastructure",
  icon: ErrorOutlined,
});

export const evaluation = {
  PASS: success("Tests passed"),
  FAIL: { label: "Assertion failed", role: "failure", icon: HighlightOff },
  INCONCLUSIVE: warning("Inconclusive"),
  NOT_EVALUATED: neutral("Not evaluated"),
} satisfies Record<EvaluationOutcome, Presentation>;

export const execution = {
  QUEUED: pending("Queued"),
  CLAIMED: pending("Claimed"),
  STARTING: pending("Starting"),
  RUNNING: pending("Running"),
  FINALIZING: pending("Collecting evidence"),
  COMPLETED: neutral("Completed"),
  CANCELED: neutral("Canceled"),
  ERROR: infrastructure("Infrastructure error"),
} satisfies Record<ExecutionState, Presentation>;

export const trial = {
  PENDING: pending("Pending"),
  RUNNING: pending("Running"),
  COMPLETED: neutral("Completed"),
  CANCELED: neutral("Canceled"),
  ERROR: infrastructure("Infrastructure error"),
  SKIPPED: neutral("Skipped"),
} satisfies Record<TrialExecutionState, Presentation>;

export const check = {
  PASS: evaluation.PASS,
  FAIL: evaluation.FAIL,
  INCONCLUSIVE: evaluation.INCONCLUSIVE,
} satisfies Record<CheckOutcome, Presentation>;
export const connection = {
  CONNECTED: success("Connected"),
  STALE: warning("Connection stale"),
  OFFLINE: neutral("Offline"),
} satisfies Record<RunnerConnectionState, Presentation>;
export const capacity = {
  AVAILABLE: neutral("Available"),
  BUSY: pending("Busy"),
  NEEDS_CLEANUP: infrastructure("Cleanup required"),
  DISABLED: neutral("Disabled"),
} satisfies Record<RunnerCapacityState, Presentation>;
export const suite = {
  DRAFT: neutral("Draft"),
  PUBLISHED: { label: "Published", role: "neutral", icon: InfoOutlined },
} satisfies Record<SuiteStatus, Presentation>;
export const statusGroups = {
  "Run execution": execution,
  "Evaluation outcome": evaluation,
  "Trial execution": trial,
  "Check outcome": check,
  "Runner connection": connection,
  "Runner capacity": capacity,
  "Suite lifecycle": suite,
};
