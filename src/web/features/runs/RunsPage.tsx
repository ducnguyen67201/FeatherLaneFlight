import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertTitle,
  Avatar,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import {
  ApiError,
  type ListRunsData,
  type RunSummary,
} from "@featherlane/contracts";
import { execution } from "../../design/statusPresentation";
import { tokens } from "../../design/theme";
import { AppShell } from "../../layouts/AppShell";
import { PageLayout } from "../../layouts/PageLayout";
import { runsDemo } from "../../mocks/browser";
import { errorMessage, runsOptions, type RunTransport } from "./queries";
import { RunsFilters } from "./RunsFilters";
import { RunsDemoControls } from "./RunsDemoControls";
import { RunsTable } from "./RunsTable";
import { NewRunPanel } from "./NewRunPanel";

export type RunsListContext = {
  search: string;
  executionState: NonNullable<ListRunsData["query"]>["executionState"];
  evaluationOutcome: NonNullable<ListRunsData["query"]>["evaluationOutcome"];
  cursors: (string | null)[];
  page: number;
};
export function initialRunsListContext(): RunsListContext {
  return {
    search: "",
    executionState: null,
    evaluationOutcome: null,
    cursors: [null],
    page: 0,
  };
}
export function RunsPage({
  onOpen,
  returnFocusRunId,
  listContext,
  setListContext,
  transport,
  projectName = "PX4 qualification",
  projectSelector,
  userMenu,
}: {
  transport?: RunTransport;
  projectName?: string;
  projectSelector?: ReactNode;
  userMenu?: ReactNode;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, runId: string) => void;
  returnFocusRunId?: string | null;
  listContext: RunsListContext;
  setListContext: Dispatch<SetStateAction<RunsListContext>>;
}) {
  const [runsRevision, setRunsRevision] = useState(0);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const { search, executionState, evaluationOutcome, cursors, page } =
    listContext;
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
      transport,
    ),
  );
  const restoredFocus = useRef(false);
  useEffect(() => {
    if (
      !returnFocusRunId ||
      restoredFocus.current ||
      query.isPending ||
      query.isFetching
    )
      return;
    const link = document.querySelector<HTMLAnchorElement>(
      `a[data-run-id="${returnFocusRunId}"]`,
    );
    (link ?? newRunButtonRef.current)?.focus();
    restoredFocus.current = true;
  }, [returnFocusRunId, query.data, query.isFetching, query.isPending]);
  const accessFailed =
    query.error instanceof ApiError &&
    [401, 403, 404].includes(query.error.status);
  useEffect(() => {
    const error = query.error;
    if (
      transport &&
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    )
      transport.onAccessFailure(error.status);
  }, [query.error, transport]);
  const rows = query.isError ? [] : (query.data?.data ?? []);
  const filtered = Boolean(search || executionState || evaluationOutcome);
  function resetPages() {
    setListContext((context) => ({ ...context, cursors: [null], page: 0 }));
  }
  function changeFilters(
    change: Partial<
      Pick<RunsListContext, "search" | "executionState" | "evaluationOutcome">
    >,
  ) {
    setListContext((context) => ({
      ...context,
      ...change,
      cursors: [null],
      page: 0,
    }));
  }
  function clearFilters() {
    changeFilters({
      search: "",
      executionState: null,
      evaluationOutcome: null,
    });
  }
  function start(event: MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget;
    setDraft((value) => value + 1);
    setOpen(true);
    setNotice("");
  }
  function created(run: RunSummary) {
    setOpen(false);
    setRunsRevision((value) => value + 1);
    clearFilters();
    setNotice(
      `${transport ? "Run" : "Mock run"} ${run.id}: ${execution[run.executionState].label}. Test outcome: ${run.evaluationOutcome}.`,
    );
  }
  return (
    <AppShell
      activePath="/runs"
      projectSelector={
        projectSelector ?? (
          <Stack
            direction="row"
            spacing={2}
            useFlexGap
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
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
        <RunsDemoControls
          onRunsChange={() => {
            setRunsRevision((value) => value + 1);
            resetPages();
            setNotice("");
          }}
          onOptionsChange={() => setOptionsRevision((value) => value + 1)}
        />
      )}
      <PageLayout
        breadcrumbs={[
          <Typography key="p" variant="body2" color="text.secondary">
            {projectName}
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
            disabled={accessFailed}
          >
            New simulation run
          </Button>
        }
        filters={
          <RunsFilters
            search={search}
            executionState={executionState}
            evaluationOutcome={evaluationOutcome}
            onChange={changeFilters}
            onClear={clearFilters}
          />
        }
      >
        <Stack spacing={4}>
          <Alert severity="info">
            {transport
              ? "Run requests are validated by the server. Queued jobs have not started and their tests are not evaluated."
              : "Demo workspace · Historical results and runner availability are synthetic. New submissions only create a local queued sample."}
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
                    if (!transport) {
                      runsDemo.setRunsMode("ready");
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
                    : `Choose a runner, an approved build and a published suite to create your first ${transport ? "run" : "mock run"}.`}
                </Typography>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={filtered ? clearFilters : start}
                >
                  {filtered
                    ? "Clear filters"
                    : transport
                      ? "Create first run"
                      : "Create first mock run"}
                </Button>
              </Stack>
            </Paper>
          ) : (
            <RunsTable
              rows={rows}
              live={!!transport}
              fetching={query.isFetching}
              page={page}
              nextCursor={query.data?.meta.nextCursor ?? null}
              onOpen={onOpen}
              runHref={(id) =>
                `/runs/${encodeURIComponent(id)}${transport ? `?${new URLSearchParams({ organizationId: transport.organizationId, projectId: transport.projectId })}` : ""}`
              }
              onPrevious={() =>
                setListContext((context) => ({
                  ...context,
                  page: context.page - 1,
                }))
              }
              onNext={() => {
                const cursor = query.data?.meta.nextCursor;
                if (cursor)
                  setListContext((context) => ({
                    ...context,
                    cursors: [
                      ...context.cursors.slice(0, context.page + 1),
                      cursor,
                    ],
                    page: context.page + 1,
                  }));
              }}
            />
          )}
        </Stack>
      </PageLayout>
      <NewRunPanel
        transport={transport}
        session={draft}
        open={open}
        revision={optionsRevision}
        onClose={() => setOpen(false)}
        onCreated={created}
        onRetryOptions={() => {
          if (!transport) {
            runsDemo.setOptionsMode("ready");
          }
        }}
        onExited={() => {
          if (!openerRef.current?.isConnected) newRunButtonRef.current?.focus();
        }}
      />
    </AppShell>
  );
}
