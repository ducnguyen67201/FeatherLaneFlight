import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Chip,
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
  Typography,
} from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import Refresh from "@mui/icons-material/Refresh";
import StopCircleOutlined from "@mui/icons-material/StopCircleOutlined";
import { AppShell } from "../../layouts/AppShell";
import { PageLayout } from "../../layouts/PageLayout";
import { ApiError } from "@featherlane/contracts";
import { tokens } from "../../design/theme";
import { detailModes } from "../../mocks/runDetailDemo";
import type { RunTransport } from "./queries";
import { useRunDetail } from "./useRunDetail";
import { useRunCancellation } from "./useRunCancellation";
import { RunDetailStatus } from "./RunDetailStatus";
import { TrialChecksPanel } from "./TrialChecksPanel";
import { RunManifestPanel } from "./RunManifestPanel";
import { RunEvidencePanel } from "./RunEvidencePanel";
import { RunLiveStatus } from "./RunLiveStatus";
import { RunTimeline } from "./RunTimeline";
import { useEvidenceDownloads } from "./useEvidenceDownloads";

export function RunDetailPage({
  runId,
  onBack,
  transport,
  projectName = "PX4 qualification",
  projectSelector,
  userMenu,
  listHref = "/runs",
}: {
  transport?: RunTransport;
  projectName?: string;
  projectSelector?: ReactNode;
  userMenu?: ReactNode;
  listHref?: string;
  runId: string;
  onBack: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [tab, setTab] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "evidence"
      ? 3
      : 0,
  );
  const [trialId, setTrialId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const {
    detail,
    events,
    artifacts,
    mode,
    changing,
    chooseMode,
    refresh,
    live,
    accessLost,
    denyAccess,
  } = useRunDetail(runId, tab, transport);
  const cancellation = useRunCancellation(runId, transport);
  const accessDenied =
    accessLost ||
    (detail.error instanceof ApiError &&
      [401, 403, 404].includes(detail.error.status));
  const snapshot =
    !accessDenied &&
    (!transport || detail.data?.data.projectId === transport.projectId)
      ? detail.data?.data
      : undefined;
  const selectedTrial =
    snapshot?.trials.find((item) => item.id === trialId) ?? snapshot?.trials[0];
  const selectedAttemptId =
    selectedTrial?.attemptId ?? snapshot?.attempts.at(-1)?.id;
  const evidenceDownloads = useEvidenceDownloads({
    runId,
    transport,
    artifacts: artifacts.data?.data ?? [],
    accessLost: accessDenied,
    snapshotVersion: detail.dataUpdatedAt,
    onAccessFailure: denyAccess,
  });
  const active =
    snapshot &&
    ["QUEUED", "CLAIMED", "STARTING", "RUNNING", "FINALIZING"].includes(
      snapshot.executionState,
    );
  const uncertain =
    cancellation.uncertain && !snapshot?.cancellationRequestedAt;
  useEffect(() => {
    const heading = pageRef.current?.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [runId]);
  return (
    <AppShell
      activePath="/runs"
      projectSelector={
        projectSelector ?? (
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Typography variant="body2" color="text.secondary">
              FeatherLane /
            </Typography>
            <Typography variant="body2">PX4 qualification</Typography>
            <Chip size="small" label="Demo" />
          </Stack>
        )
      }
      userMenu={
        userMenu ?? (
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
        )
      }
    >
      {!transport && (
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
                P04 · MOCK RUN DETAIL
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Synthetic snapshots · no live API, stream, runner or real flight
              </Typography>
            </Box>
            <TextField
              select
              label="Snapshot state"
              slotProps={{ select: { native: true } }}
              value={mode}
              disabled={changing || cancellation.pending || uncertain}
              onChange={(event) => {
                cancellation.reset();
                void chooseMode(event.target.value);
              }}
              sx={{ width: { xs: "100%", sm: 260 } }}
            >
              {detailModes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </TextField>
          </Stack>
        </Paper>
      )}
      <div ref={pageRef}>
        <PageLayout
          breadcrumbs={[
            <Typography key="project">{projectName}</Typography>,
            <Link key="runs" href={listHref} onClick={onBack}>
              Runs
            </Link>,
            <Typography key="id">
              {accessDenied ? "Run unavailable" : runId}
            </Typography>,
          ]}
          eyebrow={transport ? "RUN DETAIL" : "RUN DETAIL · SYNTHETIC EVIDENCE"}
          title={accessDenied ? "Run unavailable" : runId}
          description={
            accessDenied
              ? "Choose an accessible project to continue."
              : snapshot
                ? `${snapshot.buildLabel} · ${snapshot.suiteTitle} r${snapshot.suiteRevision} · ${snapshot.runnerDisplayName}`
                : "Read the run snapshot to inspect its frozen inputs and evidence."
          }
          actions={
            <Stack
              direction="row"
              spacing={2}
              sx={{ flexWrap: "wrap", gap: 2 }}
            >
              <Button
                component="a"
                href={listHref}
                onClick={onBack}
                startIcon={<ArrowBack />}
              >
                Runs
              </Button>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                disabled={
                  accessDenied ||
                  detail.isFetching ||
                  changing ||
                  cancellation.pending
                }
                onClick={() => void refresh()}
              >
                Refresh snapshot
              </Button>
              {active && (
                <Button
                  variant="outlined"
                  startIcon={<StopCircleOutlined />}
                  disabled={
                    cancellation.pending ||
                    changing ||
                    !!snapshot.cancellationRequestedAt ||
                    !!cancellation.receipt?.cancellationRequestedAt
                  }
                  onClick={() => setConfirm(true)}
                >
                  {uncertain ? "Retry cancellation" : "Request cancellation"}
                </Button>
              )}
            </Stack>
          }
        >
          {accessDenied ? (
            <Alert severity="error">
              <AlertTitle>Run is no longer available</AlertTitle>Your session or
              project access changed. Cached run details have been cleared.
              Return to projects to continue.
            </Alert>
          ) : detail.isPending ? (
            <Paper sx={{ p: 6 }} role="status" aria-label="Loading run detail">
              <Typography sx={{ mb: 4 }}>Loading run snapshot…</Typography>
              <Skeleton
                variant="rounded"
                animation={false}
                height={44}
                sx={{ mb: 5 }}
              />
              <Skeleton variant="rounded" animation={false} height={250} />
            </Paper>
          ) : !snapshot ? (
            <Alert
              severity="error"
              action={<Button onClick={() => void refresh()}>Retry</Button>}
            >
              <AlertTitle>Run snapshot could not be loaded</AlertTitle>
              {detail.error?.message ??
                "No validated snapshot is available."}{" "}
              No run outcome is inferred.
            </Alert>
          ) : (
            <Stack spacing={5}>
              <RunDetailStatus
                detail={snapshot}
                stale={!transport && detail.isRefetchError}
                refreshing={!transport && detail.isFetching}
                cancellationPending={cancellation.pending}
                cancellationError={cancellation.error}
                uncertain={uncertain}
                receipt={cancellation.receipt}
              />
              {transport && (
                <RunLiveStatus
                  connection={live.connection}
                  snapshotAt={snapshot.snapshotAt}
                  validatedAt={detail.dataUpdatedAt}
                  error={detail.error}
                  refreshing={detail.isFetching}
                  onRetry={() => void refresh()}
                />
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
                        key={label}
                        id={`run-tab-${index}`}
                        aria-controls={`run-panel-${index}`}
                        label={label}
                      />
                    ),
                  )}
                </Tabs>
                <Box
                  role="tabpanel"
                  id={`run-panel-${tab}`}
                  aria-labelledby={`run-tab-${tab}`}
                >
                  {tab === 0 ? (
                    <TrialChecksPanel
                      trials={snapshot.trials}
                      selectedTrial={selectedTrial}
                      checks={snapshot.checks}
                      onSelectTrial={setTrialId}
                    />
                  ) : tab === 1 ? (
                    <RunTimeline
                      live={!!transport}
                      page={events.data}
                      detail={snapshot}
                      trial={selectedTrial}
                      attemptId={selectedAttemptId}
                      pending={events.isPending}
                      error={events.error}
                      refreshing={events.isFetching && !events.isPending}
                      onRetry={() => void refresh()}
                    />
                  ) : tab === 2 ? (
                    <RunManifestPanel
                      requested={snapshot.requestedManifest}
                      attempts={snapshot.attempts}
                    />
                  ) : (
                    <RunEvidencePanel
                      key={`${runId}:${selectedAttemptId}:${selectedTrial?.id}`}
                      artifacts={artifacts.data?.data ?? []}
                      trialId={selectedTrial?.id}
                      attemptId={selectedAttemptId}
                      pending={artifacts.isPending}
                      error={artifacts.error}
                      refreshing={artifacts.isFetching && !artifacts.isPending}
                      onRetry={() => void refresh()}
                      onDownload={
                        transport ? evidenceDownloads.download : undefined
                      }
                    />
                  )}
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {transport
                  ? "Live connection status describes freshness only. Execution, cleanup and evaluation are confirmed by server snapshots."
                  : "Evidence and results are synthetic. Comparison, rerun and baseline actions are deferred."}
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
        aria-describedby="cancellation-description"
      >
        <DialogTitle>Request cancellation?</DialogTitle>
        <DialogContent>
          <DialogContentText id="cancellation-description">
            {snapshot?.executionState === "QUEUED"
              ? "Queued work has no owned execution to stop. The server can cancel it immediately."
              : "The server records intent and asks the runner to stop its owned simulation process. This request does not confirm that execution stopped."}
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
              void cancellation.request();
            }}
          >
            {uncertain ? "Retry same request" : "Request cancellation"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
