import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  AlertTitle,
  Avatar,
  Chip,
  Box,
  Button,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
} from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import Refresh from "@mui/icons-material/Refresh";
import StopCircleOutlined from "@mui/icons-material/StopCircleOutlined";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import { theme } from "../../src/web/design/theme";
import { evaluation, execution } from "../../src/web/design/statusPresentation";
import { StatusBadge } from "../../src/web/components/StatusBadge";
import { AppShell } from "../../src/web/layouts/AppShell";
import { PageLayout } from "../../src/web/layouts/PageLayout";
import {
  ChecksPanel,
  EvidencePanel,
  ManifestPanel,
  TimelinePanel,
} from "./DetailPanels";
import { modes, status, type Mode } from "./presentation";
import type { RunListEntry } from "@featherlane/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { startRunsDemo } from "../../src/web/mocks/browser";
import { RunsEntryPreview } from "./RunsEntryPreview";
import { tokens } from "../../src/web/design/theme";

function Preview() {
  const [runId, setRunId] = useState(window.location.hash.slice(1));
  const [mode, setMode] = useState<Mode>("Assertion failed");
  const [tab, setTab] = useState(0);
  const [trial, setTrial] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [intent, setIntent] = useState(false);
  const [submission, setSubmission] = useState(false);
  const [rejected, setRejected] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      if (window.location.hash !== "#main")
        setRunId(window.location.hash.slice(1));
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (runId) headingRef.current?.focus();
  }, [runId]);
  const current = status(mode);
  const cancellation =
    intent || ["Cancellation unconfirmed", "Canceled"].includes(mode);
  const active = [
    "RUNNING",
    "QUEUED",
    "CLAIMED",
    "STARTING",
    "FINALIZING",
  ].includes(current.executionState);
  const selectMode = (value: Mode) => {
    setMode(value);
    setIntent(false);
    setSubmission(false);
    setRejected(false);
  };
  const openRun = (run: RunListEntry) => {
    const nextMode: Mode =
      run.executionState === "ERROR"
        ? "Infrastructure error"
        : run.executionState === "QUEUED"
          ? "Queued"
          : run.executionState === "RUNNING"
            ? "Running"
            : run.evaluationOutcome === "PASS"
              ? "Tests passed"
              : run.evaluationOutcome === "INCONCLUSIVE"
                ? "Inconclusive"
                : "Assertion failed";
    selectMode(nextMode);
    setTrial(0);
    setTab(0);
    window.location.hash = run.id;
  };
  if (!runId) return <RunsEntryPreview onOpen={openRun} />;
  return (
    <AppShell
      activePath="/runs"
      projectSelector={
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            FeatherLane /
          </Typography>
          <Typography variant="body2">PX4 qualification</Typography>
          <Chip size="small" label="Demo" />
        </Stack>
      }
      userMenu={
        <Avatar
          sx={{
            width: tokens.component.controlHeightPx.desktop,
            height: tokens.component.controlHeightPx.desktop,
            bgcolor: "action.selected",
            color: "text.primary",
          }}
        >
          DN
        </Avatar>
      }
    >
      <Paper sx={{ p: 4, mb: 5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{
            justifyContent: "space-between",
            gap: 4,
            alignItems: { sm: "center" },
          }}
        >
          <Box>
            <Typography variant="body2" color="primary">
              P04 · ISOLATED DESIGN PREVIEW
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Synthetic snapshots · no API, stream, runner or real flight
            </Typography>
          </Box>
          {runId && (
            <TextField
              select
              label="Preview state"
              slotProps={{ select: { native: true } }}
              value={mode}
              onChange={(event) => selectMode(event.target.value as Mode)}
              sx={{ width: { xs: "100%", sm: 260 } }}
            >
              {modes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </TextField>
          )}
        </Stack>
      </Paper>
      <div ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>
        <PageLayout
          breadcrumbs={[
            <Typography key="project">PX4 qualification</Typography>,
            <Link key="runs" href="#">
              Runs
            </Link>,
            <Typography key="run">{runId}</Typography>,
          ]}
          eyebrow="RUN DETAIL · SYNTHETIC EVIDENCE"
          title={runId}
          description="PX4 candidate · Nominal flight r3 · Demo runner"
          actions={
            <Stack
              direction="row"
              spacing={2}
              sx={{ flexWrap: "wrap", gap: 2 }}
            >
              <Button component="a" href="#" startIcon={<ArrowBack />}>
                Runs
              </Button>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={() => {
                  if (["Loading", "Request error", "Stale view"].includes(mode))
                    selectMode(
                      mode === "Stale view" ? "Running" : "Assertion failed",
                    );
                }}
              >
                Refresh snapshot
              </Button>
              {active && (
                <Button
                  variant="outlined"
                  startIcon={<StopCircleOutlined />}
                  disabled={cancellation || submission}
                  onClick={() => setConfirm(true)}
                >
                  Request cancellation
                </Button>
              )}
            </Stack>
          }
        >
          {mode === "Loading" ? (
            <Paper sx={{ p: 6 }} role="status" aria-label="Loading run detail">
              <Typography sx={{ mb: 4 }}>Loading run snapshot…</Typography>
              <Skeleton variant="rounded" height={44} sx={{ mb: 5 }} />
              <Skeleton variant="rounded" height={250} />
            </Paper>
          ) : mode === "Request error" ? (
            <Alert
              severity="error"
              action={
                <Button onClick={() => selectMode("Assertion failed")}>
                  Retry
                </Button>
              }
            >
              <AlertTitle>Run snapshot could not be loaded</AlertTitle>Request
              failed. No run outcome is inferred. Retry to read the snapshot
              again.
            </Alert>
          ) : (
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
                      sx={{ mb: 2, display: "block" }}
                    >
                      EXECUTION
                    </Typography>
                    <StatusBadge value={execution[current.executionState]} />
                  </Box>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mb: 2, display: "block" }}
                    >
                      EVALUATION
                    </Typography>
                    <StatusBadge
                      value={evaluation[current.evaluationOutcome]}
                    />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      SNAPSHOT · UTC
                    </Typography>
                    <Typography variant="body2">
                      {mode === "Stale view"
                        ? "2026-10-28 16:01:00"
                        : mode === "Cancellation unconfirmed"
                          ? "2026-10-28 16:04:31"
                          : "2026-10-28 16:04:00"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      TRIALS
                    </Typography>
                    <Typography variant="body2">
                      {active
                        ? current.executionState === "QUEUED"
                          ? "3 scheduled · 0 started"
                          : "3 scheduled · no final counts"
                        : mode === "Empty trials"
                          ? "3 scheduled · 0 recorded"
                          : mode === "Queued"
                            ? "3 scheduled · 0 started"
                            : current.executionState === "ERROR"
                              ? "3 scheduled · 1 error · 2 skipped"
                              : current.executionState === "CANCELED"
                                ? "3 scheduled · 1 canceled · 2 skipped"
                                : `3 completed · ${current.evaluationOutcome === "FAIL" ? "3 failed-check" : current.evaluationOutcome === "PASS" ? "0 failed-check" : "3 inconclusive"}`}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
              {mode === "Stale view" && (
                <Alert severity="warning">
                  <AlertTitle>
                    Snapshot stale · last update 16:01 UTC
                  </AlertTitle>
                  Connection lost. Running is the last known state; execution
                  may have changed. Refresh before relying on this view.
                </Alert>
              )}
              {mode === "Infrastructure error" && (
                <Alert severity="error">
                  <AlertTitle>
                    Execution failed · TELEMETRY_DISCONNECTED
                  </AlertTitle>
                  No aggregate evaluation. Recorded observations remain
                  inspectable; this is not an assertion failure.
                </Alert>
              )}
              {mode === "Cancellation unconfirmed" && (
                <Alert severity="error">
                  <AlertTitle>
                    Cancellation unconfirmed · CANCELLATION_UNCONFIRMED
                  </AlertTitle>
                  Deadline 16:04:30 UTC elapsed without confirmed process exit.
                  Execution is Error; runner cleanup is required. Do not assume
                  it stopped.
                </Alert>
              )}
              {mode === "Canceled" && (
                <Alert severity="info">
                  <AlertTitle>Cancellation confirmed</AlertTitle>Server snapshot
                  records Canceled. Aggregate outcome is Not evaluated. Earlier
                  observations remain inspectable.
                </Alert>
              )}
              {cancellation && active && (
                <Alert severity="warning">
                  <AlertTitle>
                    Cancellation requested · stop not confirmed
                  </AlertTitle>
                  Requested 16:04:00 UTC · deadline 16:04:30 UTC. Execution
                  remains{" "}
                  {current.executionState === "QUEUED" ? "Queued" : "Running"}{" "}
                  until authoritative confirmation. No countdown or state
                  progression is simulated.
                </Alert>
              )}
              {submission && (
                <Alert severity="info">
                  <AlertTitle>Submitting cancellation request…</AlertTitle>
                  Intent has not been acknowledged. Execution is unchanged. Use
                  the preview controls below to inspect a response.
                  <Stack
                    direction="row"
                    sx={{ gap: 3, mt: 3, flexWrap: "wrap" }}
                  >
                    <Button
                      onClick={() => {
                        setSubmission(false);
                        setIntent(true);
                      }}
                    >
                      Show accepted intent
                    </Button>
                    <Button
                      onClick={() => {
                        setSubmission(false);
                        setRejected(true);
                      }}
                    >
                      Show rejected request
                    </Button>
                  </Stack>
                </Alert>
              )}
              {rejected && (
                <Alert severity="error">
                  <AlertTitle>Cancellation request rejected</AlertTitle>No
                  cancellation intent was recorded. Refresh the snapshot or
                  retry the request.
                </Alert>
              )}
              {["Cancellation pending", "Cancellation rejected"].includes(
                mode,
              ) &&
                !submission &&
                !intent &&
                !rejected && (
                  <Alert severity="info">
                    Open Request cancellation to inspect the confirmation and{" "}
                    {mode === "Cancellation pending"
                      ? "pending response"
                      : "rejection"}{" "}
                    state.
                  </Alert>
                )}
              {mode === "Inconclusive" && (
                <Alert severity="warning">
                  Execution completed, but required evidence was insufficient.
                  No passing or failing requirement verdict is established.
                </Alert>
              )}
              {mode === "Expired evidence" && (
                <Alert severity="warning">
                  Raw evidence expired. Historical Assertion failed summary is
                  retained. Descriptive inspection only; no regression verdict.
                </Alert>
              )}
              <Box>
                <Tabs
                  value={tab}
                  onChange={(_, value: number) => setTab(value)}
                  variant="scrollable"
                  scrollButtons="auto"
                  aria-label="Run detail sections"
                  sx={{ borderBottom: 1, borderColor: "divider", mb: 5 }}
                >
                  {["Checks", "Timeline", "Manifest", "Evidence"].map(
                    (label, index) => (
                      <Tab
                        id={`detail-tab-${index}`}
                        aria-controls={`detail-panel-${index}`}
                        key={label}
                        label={label}
                      />
                    ),
                  )}
                </Tabs>
                <Box
                  role="tabpanel"
                  id={`detail-panel-${tab}`}
                  aria-labelledby={`detail-tab-${tab}`}
                >
                  {tab === 0 ? (
                    <ChecksPanel
                      mode={mode}
                      trial={trial}
                      onTrialChange={setTrial}
                    />
                  ) : tab === 1 ? (
                    <TimelinePanel mode={mode} trial={trial} />
                  ) : tab === 2 ? (
                    <ManifestPanel mode={mode} />
                  ) : (
                    <EvidencePanel mode={mode} trial={trial} />
                  )}
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                P04 visual proposal · evidence and results are synthetic.
                Comparison, rerun and baseline actions are deferred.
              </Typography>
            </Stack>
          )}
        </PageLayout>
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Request cancellation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The server records intent and asks the runner to stop its owned
            simulation process. This request does not confirm that execution
            stopped.
          </DialogContentText>
          <Alert severity="warning" sx={{ mt: 4 }}>
            Execution remains in its current state until a server snapshot
            confirms cancellation or reports an error.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Keep running</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirm(false);
              if (mode === "Cancellation pending") setSubmission(true);
              else if (mode === "Cancellation rejected") setRejected(true);
              else setIntent(true);
            }}
          >
            Request cancellation
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}

const root = createRoot(document.getElementById("root")!);
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
async function startPreview() {
  try {
    await startRunsDemo();
    root.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Preview />
        </ThemeProvider>
      </QueryClientProvider>,
    );
  } catch {
    root.render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Alert severity="error">
          The isolated mock preview could not start. Restart the P04 preview
          server after preparing its local worker.
        </Alert>
      </ThemeProvider>,
    );
  }
}
void startPreview();
