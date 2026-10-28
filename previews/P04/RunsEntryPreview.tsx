import { useRef, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Skeleton,
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
import Add from "@mui/icons-material/Add";
import ArrowForward from "@mui/icons-material/ArrowForward";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import type { ListRunsData, RunListEntry } from "@featherlane/contracts";
import { tokens } from "../../src/web/design/theme";
import { evaluation, execution } from "../../src/web/design/statusPresentation";
import { StatusBadge } from "../../src/web/components/StatusBadge";
import { AppShell } from "../../src/web/layouts/AppShell";
import { PageLayout } from "../../src/web/layouts/PageLayout";
import { runsDemo } from "../../src/web/mocks/browser";
import type { DemoReadMode } from "../../src/web/mocks/runsDemo";
import { errorMessage, runsOptions } from "../../src/web/features/runs/queries";
import { NewRunPanel } from "../../src/web/features/runs/NewRunPanel";

const readModes: { value: DemoReadMode; label: string }[] = [
  { value: "ready", label: "Populated" },
  { value: "loading", label: "Loading" },
  { value: "empty", label: "No runs yet" },
  { value: "error", label: "Request error" },
  { value: "invalid", label: "Invalid response" },
];
// Preview-only copy of the approved P03 composition. Only Open and its helper copy differ.
export function RunsEntryPreview({
  onOpen,
}: {
  onOpen: (run: RunListEntry) => void;
}) {
  const [runsMode, setRunsMode] = useState<DemoReadMode>("ready");
  const [optionsMode, setOptionsMode] = useState<DemoReadMode>("ready");
  const [submissionMode, setSubmissionMode] = useState("accept");
  const [runsRevision, setRunsRevision] = useState(0);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [executionState, setExecutionState] =
    useState<NonNullable<ListRunsData["query"]>["executionState"]>(null);
  const [evaluationOutcome, setEvaluationOutcome] =
    useState<NonNullable<ListRunsData["query"]>["evaluationOutcome"]>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(0);
  const [notice, setNotice] = useState("");
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const newRunButtonRef = useRef<HTMLButtonElement>(null);
  const query = useQuery(
    runsOptions(
      {
        limit: 5,
        cursor: cursors[page] ?? null,
        ...(search.trim() ? { search: search.trim() } : {}),
        executionState,
        evaluationOutcome,
      },
      runsRevision,
    ),
  );
  const rows = query.data?.data ?? [];
  const filtered = Boolean(search || executionState || evaluationOutcome);
  function resetPages() {
    setCursors([null]);
    setPage(0);
  }
  function clearFilters() {
    setSearch("");
    setExecutionState(null);
    setEvaluationOutcome(null);
    resetPages();
  }
  function start(event: MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget;
    setDraft((value) => value + 1);
    setOpen(true);
    setNotice("");
  }
  function created(id: string) {
    setOpen(false);
    setRunsMode("ready");
    setRunsRevision((value) => value + 1);
    clearFilters();
    setNotice(
      `Mock run ${id} queued. No simulation is executing; its tests are not evaluated.`,
    );
  }
  const selectStyle = { minWidth: { xs: "100%", sm: 180 }, flex: 1 };
  const filters = (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={4}
      useFlexGap
      sx={{ flexWrap: "wrap" }}
    >
      <TextField
        label="Find run, build or suite"
        size="small"
        value={search}
        slotProps={{ htmlInput: { maxLength: 128 } }}
        onChange={(e) => {
          setSearch(e.target.value);
          resetPages();
        }}
        sx={{ flex: 2, minWidth: { sm: 220 } }}
      />
      <TextField
        select
        label="Execution"
        size="small"
        value={executionState ?? ""}
        sx={selectStyle}
        onChange={(e) => {
          const key = Object.keys(execution).find(
            (key): key is keyof typeof execution => key === e.target.value,
          );
          setExecutionState(key ?? null);
          resetPages();
        }}
      >
        <MenuItem value="">All execution states</MenuItem>
        {Object.entries(execution).map(([key, value]) => (
          <MenuItem key={key} value={key}>
            {value.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Test outcome"
        size="small"
        value={evaluationOutcome ?? ""}
        sx={selectStyle}
        onChange={(e) => {
          const key = Object.keys(evaluation).find(
            (key): key is keyof typeof evaluation => key === e.target.value,
          );
          setEvaluationOutcome(key ?? null);
          resetPages();
        }}
      >
        <MenuItem value="">All outcomes</MenuItem>
        {Object.entries(evaluation).map(([key, value]) => (
          <MenuItem key={key} value={key}>
            {value.label}
          </MenuItem>
        ))}
      </TextField>
      <Button color="secondary" onClick={clearFilters}>
        Clear filters
      </Button>
    </Stack>
  );
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
      <Paper variant="outlined" sx={{ p: 4, mb: 6 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={4}
          sx={{ alignItems: { md: "center" } }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              <ScienceOutlined
                fontSize="small"
                sx={{ verticalAlign: "middle", mr: 2 }}
              />
              Mock workspace
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Local mock data · demo controls below
            </Typography>
          </Box>
          <TextField
            select
            label="Runs state"
            size="small"
            value={runsMode}
            sx={selectStyle}
            onChange={(e) => {
              const mode = readModes.find(
                (item) => item.value === e.target.value,
              )?.value;
              if (mode) {
                runsDemo.setRunsMode(mode);
                setRunsMode(mode);
                setRunsRevision((value) => value + 1);
                resetPages();
                setNotice("");
              }
            }}
          >
            {readModes.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Run options"
            size="small"
            value={optionsMode}
            sx={selectStyle}
            onChange={(e) => {
              const mode = readModes.find(
                (item) => item.value === e.target.value,
              )?.value;
              if (mode) {
                runsDemo.setOptionsMode(mode);
                setOptionsMode(mode);
                setOptionsRevision((value) => value + 1);
              }
            }}
          >
            {readModes.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.value === "ready"
                  ? "Available"
                  : item.value === "empty"
                    ? "No runners"
                    : item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Mock submission"
            size="small"
            value={submissionMode}
            sx={selectStyle}
            onChange={(e) => {
              if (
                e.target.value === "accept" ||
                e.target.value === "reject" ||
                e.target.value === "unconfirmed"
              ) {
                runsDemo.setSubmissionMode(e.target.value);
                setSubmissionMode(e.target.value);
              }
            }}
          >
            <MenuItem value="accept">Accept as queued</MenuItem>
            <MenuItem value="reject">Reject submission</MenuItem>
            <MenuItem value="unconfirmed">
              Malformed acknowledgment once
            </MenuItem>
          </TextField>
        </Stack>
      </Paper>
      <PageLayout
        breadcrumbs={[
          <Typography key="p" variant="body2" color="text.secondary">
            PX4 qualification
          </Typography>,
          <Typography key="r" variant="body2">
            Runs
          </Typography>,
        ]}
        title="Simulation runs"
        eyebrow="RUNS"
        description="Review execution and test outcomes separately for every simulation run."
        actions={
          <Button
            ref={newRunButtonRef}
            variant="contained"
            startIcon={<Add />}
            onClick={start}
          >
            New simulation run
          </Button>
        }
        filters={filters}
      >
        <Stack spacing={4}>
          <Alert severity="info">
            Demo workspace · Historical results and runner availability are
            synthetic. New submissions only create a local queued sample.
          </Alert>
          {notice && (
            <Alert severity="success" onClose={() => setNotice("")}>
              {notice}
            </Alert>
          )}
          {query.isPending ? (
            <Paper variant="outlined" sx={{ p: 6 }}>
              <Typography role="status" variant="body2" sx={{ mb: 4 }}>
                Loading simulation runs…
              </Typography>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  height={tokens.component.tableRowMinHeightPx}
                  animation={false}
                />
              ))}
            </Paper>
          ) : query.isError ? (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  onClick={() => {
                    if (runsMode === "error") {
                      runsDemo.setRunsMode("ready");
                      setRunsMode("ready");
                    }
                    void query.refetch();
                  }}
                >
                  Retry
                </Button>
              }
            >
              <AlertTitle>Couldn’t load runs</AlertTitle>
              {errorMessage(query.error)}
            </Alert>
          ) : rows.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 6 }}>
              <Stack spacing={4} sx={{ alignItems: "flex-start", py: 6 }}>
                <Typography variant="h2" component="h2">
                  {filtered
                    ? "No runs match these filters"
                    : "No simulation runs yet"}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  {filtered
                    ? "Try another run ID, execution state or test outcome."
                    : "Choose a runner, an approved build and a published suite to create your first mock run."}
                </Typography>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={filtered ? clearFilters : start}
                >
                  {filtered ? "Clear filters" : "Create first mock run"}
                </Button>
              </Stack>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{ minWidth: 0, overflow: "hidden" }}>
              <Box sx={{ p: 4 }}>
                <Typography
                  component="h2"
                  variant="body1"
                  sx={{ fontWeight: 600 }}
                >
                  Recent runs
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {rows.length} matching samples on this page · newest first ·
                  mock dataset
                </Typography>
                <Typography
                  id="details-preview"
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 2 }}
                >
                  Open a run to review the proposed P04 detail and evidence
                  screen.
                </Typography>
                {query.isFetching && (
                  <Typography
                    role="status"
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block" }}
                  >
                    Refreshing runs…
                  </Typography>
                )}
              </Box>
              <TableContainer
                tabIndex={0}
                aria-label="Simulation runs; scroll horizontally for more columns"
              >
                <Table sx={{ minWidth: tokens.layoutPx.runTableMinWidth }}>
                  <TableHead>
                    <TableRow>
                      {[
                        "Run / created (UTC)",
                        "Build / suite revision",
                        "Runner",
                        "Execution",
                        "Test outcome",
                        "Evidence",
                      ].map((label) => (
                        <TableCell key={label}>{label}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((run) => (
                      <TableRow key={run.id} hover>
                        <TableCell>
                          <Typography variant="code">{run.id}</Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block" }}
                          >
                            {run.createdAt.slice(0, 16).replace("T", " ")}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {run.buildLabel}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {run.suiteTitle} · rev {run.suiteRevision}
                          </Typography>
                        </TableCell>
                        <TableCell>{run.runnerDisplayName}</TableCell>
                        <TableCell>
                          <StatusBadge value={execution[run.executionState]} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            value={evaluation[run.evaluationOutcome]}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            color="secondary"
                            component="a"
                            href={`#${run.id}`}
                            aria-label={`Open ${run.id}`}
                            onClick={(event) => {
                              event.preventDefault();
                              onOpen(run);
                            }}
                            aria-describedby="details-preview"
                          >
                            Open{" "}
                            <ArrowForward fontSize="small" sx={{ ml: 1 }} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Stack
                direction="row"
                spacing={3}
                sx={{
                  p: 4,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Page {page + 1} ·{" "}
                  {query.data?.meta.nextCursor
                    ? "more samples available"
                    : "no additional pages"}
                </Typography>
                <Stack direction="row" spacing={2}>
                  <Button
                    disabled={page === 0 || query.isFetching}
                    variant="outlined"
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={!query.data?.meta.nextCursor || query.isFetching}
                    variant="outlined"
                    onClick={() => {
                      const cursor = query.data?.meta.nextCursor;
                      if (cursor) {
                        setCursors([...cursors.slice(0, page + 1), cursor]);
                        setPage((value) => value + 1);
                      }
                    }}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}
        </Stack>
      </PageLayout>
      <NewRunPanel
        session={draft}
        open={open}
        revision={optionsRevision}
        onClose={() => setOpen(false)}
        onCreated={created}
        onRetryOptions={() => {
          if (optionsMode === "error") {
            runsDemo.setOptionsMode("ready");
            setOptionsMode("ready");
          }
        }}
        onExited={() => {
          if (!openerRef.current?.isConnected) newRunButtonRef.current?.focus();
        }}
      />
    </AppShell>
  );
}
