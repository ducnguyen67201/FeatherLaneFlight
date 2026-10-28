import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Drawer,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import Close from "@mui/icons-material/Close";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import type { RunSummary } from "@featherlane/contracts";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import { theme, tokens } from "../../src/web/design/theme";
import {
  capacity,
  connection,
  evaluation,
  execution,
} from "../../src/web/design/statusPresentation";
import { StatusBadge } from "../../src/web/components/StatusBadge";
import { AppShell } from "../../src/web/layouts/AppShell";
import { PageLayout } from "../../src/web/layouts/PageLayout";

// Local design samples only. No SDK, service worker, backend or simulator is started.
const samples: RunSummary[] = (
  [
    {
      id: "run_184",
      executionState: "RUNNING",
      evaluationOutcome: "NOT_EVALUATED",
    },
    {
      id: "run_183",
      executionState: "QUEUED",
      evaluationOutcome: "NOT_EVALUATED",
    },
    { id: "run_182", executionState: "COMPLETED", evaluationOutcome: "PASS" },
    { id: "run_181", executionState: "COMPLETED", evaluationOutcome: "FAIL" },
    {
      id: "run_180",
      executionState: "ERROR",
      evaluationOutcome: "INCONCLUSIVE",
    },
  ] satisfies Pick<RunSummary, "id" | "executionState" | "evaluationOutcome">[]
).map((row, index) => ({
  projectId: "project_demo",
  buildId: "build_candidate",
  suiteRevisionId: "suite_nominal_r3",
  runnerId: "runner_demo",
  cancellationRequestedAt: null,
  cancellationDeadlineAt: null,
  createdAt: `2026-10-28T${18 - index}:00:00Z`,
  startedAt: null,
  finishedAt: null,
  ...row,
}));
const steps = [
  "Runner",
  "Build & profile",
  "Test suite",
  "Repetitions",
  "Review",
];
const digest =
  "sha256:4b62f33c1049a96c5f76e253bdca72e03665e903fe2e4f186694ddff1e6b413a";

function Panel({ children }: { children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, md: 6 }, minWidth: 0 }}>
      {children}
    </Paper>
  );
}

function Preview() {
  const [screen, setScreen] = useState<"list" | "new">("list");
  const [listState, setListState] = useState("ready");
  const [optionState, setOptionState] = useState("ready");
  const [submitBehavior, setSubmitBehavior] = useState("accept");
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [step, setStep] = useState(0);
  const [runner, setRunner] = useState("");
  const [build, setBuild] = useState("");
  const [profile, setProfile] = useState("");
  const [suite, setSuite] = useState("");
  const [repetitions, setRepetitions] = useState("3");
  const [attempted, setAttempted] = useState(false);
  const [submission, setSubmission] = useState<"idle" | "pending" | "error">(
    "idle",
  );
  const [created, setCreated] = useState(false);
  const [notice, setNotice] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const newRunButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (screen === "new") {
      contentRef.current?.scrollTo({ top: 0 });
      stepHeadingRef.current?.focus();
    }
  }, [screen, step]);
  function closePanel() {
    if (submission !== "pending") setScreen("list");
  }
  const invalidRepetitions =
    !/^\d+$/.test(repetitions) ||
    Number(repetitions) < 1 ||
    Number(repetitions) > 10;
  const valid = [
    Boolean(runner) && optionState === "ready",
    Boolean(build && profile),
    Boolean(suite),
    !invalidRepetitions,
    true,
  ][step];
  const newRun: RunSummary = { ...samples[1]!, id: "run_185" };
  const rows = (created ? [newRun, ...samples] : samples).filter(
    (row) =>
      `${row.id} PX4 candidate Nominal flight revision 3 Demo runner`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!stateFilter || row.executionState === stateFilter) &&
      (!outcomeFilter || row.evaluationOutcome === outcomeFilter),
  );
  function start(event: MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget;
    setScreen("new");
    setStep(0);
    setAttempted(false);
    setSubmission("idle");
    setRunner("");
    setBuild("");
    setProfile("");
    setSuite("");
    setRepetitions("3");
    setNotice("");
  }
  function next() {
    setAttempted(true);
    if (valid) {
      setStep(step + 1);
      setAttempted(false);
    }
  }
  function submit() {
    setSubmission("pending");
    // This delay illustrates transport acknowledgment, never execution or a test outcome.
    window.setTimeout(() => {
      if (submitBehavior === "reject") {
        setSubmission("error");
        return;
      }
      setCreated(true);
      setSubmission("idle");
      setScreen("list");
      setListState("ready");
      setQuery("");
      setStateFilter("");
      setOutcomeFilter("");
      setNotice(
        "Mock run run_185 queued. No simulation is executing; its tests are not evaluated.",
      );
    }, 800);
  }
  const selectStyle = { minWidth: { xs: "100%", sm: 180 }, flex: 1 };
  const toolbar = (
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
            P03 · Design preview
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Local mock data · preview controls below
          </Typography>
        </Box>
        <TextField
          select
          label="Runs state"
          size="small"
          value={listState}
          sx={selectStyle}
          onChange={(e) => {
            setListState(e.target.value);
            setScreen("list");
            setNotice("");
          }}
        >
          <MenuItem value="ready">Populated</MenuItem>
          <MenuItem value="loading">Loading</MenuItem>
          <MenuItem value="empty">No runs yet</MenuItem>
          <MenuItem value="error">Request error</MenuItem>
        </TextField>
        <TextField
          select
          label="Run options"
          size="small"
          value={optionState}
          sx={selectStyle}
          onChange={(e) => {
            setOptionState(e.target.value);
            setRunner("");
            setStep(0);
            setAttempted(false);
          }}
        >
          <MenuItem value="ready">Available</MenuItem>
          <MenuItem value="loading">Loading runners</MenuItem>
          <MenuItem value="empty">No runners</MenuItem>
          <MenuItem value="error">Options error</MenuItem>
        </TextField>
        <TextField
          select
          label="Mock submission"
          size="small"
          value={submitBehavior}
          sx={selectStyle}
          onChange={(e) => setSubmitBehavior(e.target.value)}
        >
          <MenuItem value="accept">Accept as queued</MenuItem>
          <MenuItem value="reject">Reject submission</MenuItem>
        </TextField>
      </Stack>
    </Paper>
  );
  const filterFields = (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={4}
      useFlexGap
      sx={{ flexWrap: "wrap" }}
    >
      <TextField
        label="Find run, build or suite"
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ flex: 2, minWidth: { sm: 220 } }}
      />
      <TextField
        select
        label="Execution"
        size="small"
        value={stateFilter}
        sx={selectStyle}
        onChange={(e) => setStateFilter(e.target.value)}
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
        value={outcomeFilter}
        sx={selectStyle}
        onChange={(e) => setOutcomeFilter(e.target.value)}
      >
        <MenuItem value="">All outcomes</MenuItem>
        {Object.entries(evaluation).map(([key, value]) => (
          <MenuItem key={key} value={key}>
            {value.label}
          </MenuItem>
        ))}
      </TextField>
      <Button
        color="secondary"
        onClick={() => {
          setQuery("");
          setStateFilter("");
          setOutcomeFilter("");
        }}
      >
        Clear filters
      </Button>
    </Stack>
  );
  const reviewItems: [string, string][] = [
    ["Runner", "Demo runner · Connected / Available"],
    ["Build", "PX4 candidate · source 8f31c2a"],
    ["Local profile", "Fake integration · Linux x86_64"],
    ["Published suite", "Nominal flight · revision 3 · 1 scenario"],
    [
      "Trial matrix",
      `1 scenario × ${repetitions} repetitions = ${repetitions} trials`,
    ],
  ];
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
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
        {toolbar}
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
          filters={filterFields}
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
            {listState === "loading" ? (
              <Panel>
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
              </Panel>
            ) : listState === "error" ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" onClick={() => setListState("ready")}>
                    Retry
                  </Button>
                }
              >
                <AlertTitle>Couldn’t load runs</AlertTitle>The mock request
                failed. Retry to load the list; your filters are preserved.
              </Alert>
            ) : listState === "empty" || rows.length === 0 ? (
              <Panel>
                <Stack spacing={4} sx={{ alignItems: "flex-start", py: 6 }}>
                  <Typography variant="h2" component="h2">
                    {listState === "empty"
                      ? "No simulation runs yet"
                      : "No runs match these filters"}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    {listState === "empty"
                      ? "Choose a runner, an approved build and a published suite to create your first mock run."
                      : "Try another run ID, execution state or test outcome."}
                  </Typography>
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={
                      listState === "empty"
                        ? start
                        : () => {
                            setQuery("");
                            setStateFilter("");
                            setOutcomeFilter("");
                          }
                    }
                  >
                    {listState === "empty"
                      ? "Create first mock run"
                      : "Clear filters"}
                  </Button>
                </Stack>
              </Panel>
            ) : (
              <Paper
                variant="outlined"
                sx={{ minWidth: 0, overflow: "hidden" }}
              >
                <Box sx={{ p: 4 }}>
                  <Typography
                    component="h2"
                    variant="body1"
                    sx={{ fontWeight: 600 }}
                  >
                    Recent runs
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {rows.length} matching samples · newest first · mock dataset
                  </Typography>
                  <Typography
                    id="details-unavailable"
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 2 }}
                  >
                    Run details are not available in this preview.
                  </Typography>
                </Box>
                <TableContainer
                  tabIndex={0}
                  aria-label="Simulation runs; scroll horizontally for more columns"
                >
                  <Table sx={{ minWidth: 850 }}>
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
                              28 Oct ·{" "}
                              {run.id === "run_185"
                                ? "Just submitted"
                                : run.createdAt.slice(11, 16)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              PX4 candidate
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Nominal flight · rev 3
                            </Typography>
                          </TableCell>
                          <TableCell>Demo runner</TableCell>
                          <TableCell>
                            <StatusBadge
                              value={execution[run.executionState]}
                            />
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
                              disabled
                              aria-describedby="details-unavailable"
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
                    All matching samples shown · no additional pages
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Button disabled variant="outlined">
                      Previous
                    </Button>
                    <Button disabled variant="outlined">
                      Next
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            )}
          </Stack>
        </PageLayout>
        <Drawer
          anchor="right"
          open={screen === "new"}
          onClose={closePanel}
          slotProps={{
            transition: {
              onExited: () => {
                if (!openerRef.current?.isConnected)
                  newRunButtonRef.current?.focus();
              },
            },
            paper: {
              role: "dialog",
              "aria-modal": true,
              "aria-labelledby": "new-run-title",
              sx: {
                top: "2.5dvh",
                height: "95dvh",
                right: {
                  xs: tokens.spacing.unitPx * 2,
                  sm: tokens.spacing.unitPx * 4,
                },
                width: {
                  xs: `calc(100vw - ${tokens.spacing.unitPx * 4}px)`,
                  sm: tokens.layoutPx.formMaxWidth,
                },
                maxWidth: `calc(100vw - ${tokens.spacing.unitPx * 4}px)`,
                border: 1,
                borderColor: "divider",
                borderRadius: `${tokens.radiusPx.default}px`,
                bgcolor: "background.paper",
                boxShadow: tokens.shadow.overlay,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              },
            },
          }}
        >
          <Stack
            direction="row"
            spacing={3}
            sx={{
              p: { xs: 4, sm: 6 },
              borderBottom: 1,
              borderColor: "divider",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="primary">
                MOCK SUBMISSION
              </Typography>
              <Typography id="new-run-title" component="h2" variant="h2">
                New simulation run
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Select compatible inputs, then review.
              </Typography>
            </Box>
            <IconButton
              aria-label="Close new simulation run"
              onClick={closePanel}
              disabled={submission === "pending"}
            >
              <Close />
            </IconButton>
          </Stack>
          <Box
            ref={contentRef}
            sx={{
              p: { xs: 4, sm: 6 },
              overflowY: "auto",
              minHeight: 0,
              flex: 1,
            }}
          >
            <Stack spacing={6} sx={{ maxWidth: tokens.layoutPx.formMaxWidth }}>
              <Alert severity="info">
                Design preview · Fake integration only. No PX4 process or live
                job will start.
              </Alert>
              <Stepper
                activeStep={step}
                alternativeLabel
                sx={{ display: { xs: "none", sm: "flex" } }}
              >
                {steps.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
              <Typography variant="body2" color="text.secondary">
                Step {step + 1} of 5 · {steps[step]}
              </Typography>
              <Panel>
                <Stack spacing={5}>
                  <Typography
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    component="h3"
                    variant="h2"
                  >
                    {
                      [
                        "Choose a runner",
                        "Choose available inputs",
                        "Choose an eligible suite",
                        "Set repetitions",
                        "Review simulation run",
                      ][step]
                    }
                  </Typography>
                  {step === 0 && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Connection health and capacity are separate. Only an
                        available, compatible runner can accept this mock run.
                      </Typography>
                      {optionState === "loading" ? (
                        <Box role="status">
                          <Typography variant="body2">
                            Loading runner availability…
                          </Typography>
                          <Skeleton animation={false} height={80} />
                        </Box>
                      ) : optionState === "empty" ? (
                        <Alert severity="info">
                          <AlertTitle>No runners registered</AlertTitle>Register
                          a runner before creating a run. Runner enrollment is
                          outside this preview.
                        </Alert>
                      ) : optionState === "error" ? (
                        <Alert
                          severity="error"
                          action={
                            <Button
                              color="inherit"
                              onClick={() => setOptionState("ready")}
                            >
                              Retry
                            </Button>
                          }
                        >
                          Couldn’t load runner options.
                        </Alert>
                      ) : (
                        <FormControl error={attempted && !runner}>
                          <FormLabel id="runner-label">Runner</FormLabel>
                          <RadioGroup
                            aria-labelledby="runner-label"
                            value={runner}
                            onChange={(e) => {
                              setRunner(e.target.value);
                              setBuild("");
                              setProfile("");
                              setSuite("");
                            }}
                          >
                            <FormControlLabel
                              value="demo"
                              control={<Radio />}
                              label={
                                <Box sx={{ py: 3 }}>
                                  <Typography variant="body2">
                                    Demo runner · Linux x86_64
                                  </Typography>
                                  <Stack
                                    direction="row"
                                    spacing={2}
                                    sx={{ mt: 2 }}
                                  >
                                    <StatusBadge value={connection.CONNECTED} />
                                    <StatusBadge value={capacity.AVAILABLE} />
                                  </Stack>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    Last seen 12 seconds ago · synthetic fixture
                                  </Typography>
                                </Box>
                              }
                            />
                            <FormControlLabel
                              value="busy"
                              disabled
                              control={<Radio />}
                              label="Lab runner · Connected / Busy"
                            />
                            <FormControlLabel
                              value="offline"
                              disabled
                              control={<Radio />}
                              label="Backup runner · Offline / Available"
                            />
                          </RadioGroup>
                          {attempted && !runner && (
                            <Typography
                              role="alert"
                              variant="body2"
                              color="error"
                            >
                              Select an available runner to continue.
                            </Typography>
                          )}
                        </FormControl>
                      )}
                    </>
                  )}
                  {step === 1 && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Only this runner’s approved local declarations are
                        shown. Changing an input clears the suite selection.
                      </Typography>
                      <TextField
                        select
                        size="small"
                        label="Available build"
                        value={build}
                        onChange={(e) => {
                          setBuild(e.target.value);
                          setProfile("");
                          setSuite("");
                        }}
                        error={attempted && !build}
                        helperText={
                          attempted && !build
                            ? "Choose a build available on this runner."
                            : "Immutable registration · read-only source revision"
                        }
                      >
                        <MenuItem value="candidate">
                          PX4 candidate · 8f31c2a
                        </MenuItem>
                      </TextField>
                      <TextField
                        select
                        size="small"
                        label="Approved local profile"
                        value={profile}
                        disabled={!build}
                        onChange={(e) => {
                          setProfile(e.target.value);
                          setSuite("");
                        }}
                        error={attempted && !profile}
                        helperText={
                          !build
                            ? "Choose an available build first."
                            : attempted && !profile
                              ? "Choose an approved local profile."
                              : "Fake integration · Linux x86_64 · version 1"
                        }
                      >
                        <MenuItem value="fake">
                          Fake integration · approved sample profile
                        </MenuItem>
                      </TextField>
                      {profile && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Local execution profile digest
                          </Typography>
                          <Typography
                            variant="code"
                            sx={{
                              display: "block",
                              overflowWrap: "anywhere",
                              mt: 2,
                            }}
                          >
                            {digest}
                          </Typography>
                        </Box>
                      )}
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Eligibility is based on the selected runner, build and
                        profile. Only published revisions can be selected.
                      </Typography>
                      <FormControl error={attempted && !suite}>
                        <FormLabel id="suite-label">
                          Published test suite
                        </FormLabel>
                        <RadioGroup
                          aria-labelledby="suite-label"
                          value={suite}
                          onChange={(e) => setSuite(e.target.value)}
                        >
                          <FormControlLabel
                            value="nominal"
                            control={<Radio />}
                            label={
                              <Box sx={{ py: 3 }}>
                                <Typography variant="body2">
                                  Nominal flight · revision 3
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Eligible · 1 scenario · required fake
                                  capability verified
                                </Typography>
                              </Box>
                            }
                          />
                          <FormControlLabel
                            value="gnss"
                            disabled
                            control={<Radio />}
                            label="Airborne GNSS response · revision 1"
                          />
                        </RadioGroup>
                        {attempted && !suite && (
                          <Typography
                            role="alert"
                            color="error"
                            variant="body2"
                          >
                            Select an eligible published suite.
                          </Typography>
                        )}
                      </FormControl>
                      <Alert severity="warning">
                        Airborne GNSS response is unavailable: the selected
                        profile has no verified airborne GNSS capability.
                        Registration alone does not qualify it.
                      </Alert>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Repeat each scenario with the same frozen inputs. This
                        preview allows 1–10 repetitions.
                      </Typography>
                      <TextField
                        label="Repetitions per scenario"
                        size="small"
                        value={repetitions}
                        onChange={(e) => setRepetitions(e.target.value)}
                        error={attempted && invalidRepetitions}
                        helperText={
                          attempted && invalidRepetitions
                            ? "Enter a whole number from 1 to 10."
                            : "Whole number · minimum 1, maximum 10"
                        }
                        slotProps={{ htmlInput: { inputMode: "numeric" } }}
                      />
                      <Paper variant="outlined" sx={{ p: 4 }}>
                        <Typography variant="body2">
                          Requested trial matrix
                        </Typography>
                        <Typography variant="h2" sx={{ mt: 2 }}>
                          1 scenario × {invalidRepetitions ? "—" : repetitions}{" "}
                          repetitions
                        </Typography>
                        <Typography
                          color="text.secondary"
                          variant="body2"
                          sx={{ mt: 2 }}
                        >
                          {invalidRepetitions
                            ? "Enter valid repetitions to calculate trials."
                            : `${repetitions} total trials · Nominal flight, revision 3`}
                        </Typography>
                      </Paper>
                    </>
                  )}
                  {step === 4 && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Confirm the immutable inputs before requesting a mock
                        run.
                      </Typography>
                      <Box component="dl" sx={{ m: 0 }}>
                        {reviewItems.map(([label, value], index) => (
                          <Box
                            key={label}
                            sx={{
                              py: 3,
                              borderBottom: 1,
                              borderColor: "divider",
                            }}
                          >
                            <Stack
                              direction="row"
                              sx={{
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 3,
                              }}
                            >
                              <Typography
                                component="dt"
                                variant="caption"
                                color="text.secondary"
                              >
                                {label}
                              </Typography>
                              <Button
                                size="small"
                                color="secondary"
                                disabled={submission === "pending"}
                                onClick={() => {
                                  setStep(
                                    index === 4
                                      ? 3
                                      : index === 3
                                        ? 2
                                        : index === 0
                                          ? 0
                                          : 1,
                                  );
                                  setAttempted(false);
                                  setSubmission("idle");
                                }}
                              >
                                Edit {label.toLowerCase()}
                              </Button>
                            </Stack>
                            <Typography
                              component="dd"
                              variant="body2"
                              sx={{ m: 0 }}
                            >
                              {value}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        Profile digest · {digest}
                      </Typography>
                      <Alert severity="info">
                        The mock transport rechecks selected inputs on
                        submission. Acceptance only acknowledges a queued
                        request; it does not establish execution or a passing
                        outcome.
                      </Alert>
                    </>
                  )}
                </Stack>
              </Panel>
            </Stack>
          </Box>
          <Box
            sx={{
              p: { xs: 4, sm: 6 },
              borderTop: 1,
              borderColor: "divider",
              flexShrink: 0,
            }}
          >
            {submission === "error" && (
              <Alert severity="error" sx={{ mb: 4 }}>
                <AlertTitle>Mock submission rejected</AlertTitle>
                Nothing was queued. Runner availability changed. Your selections
                are preserved; review the runner or retry.
              </Alert>
            )}
            {submission === "pending" && (
              <Typography
                role="status"
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 3 }}
              >
                Waiting for mock acknowledgment. Closing is available afterward.
              </Typography>
            )}
            <Stack
              direction="row"
              spacing={3}
              sx={{ justifyContent: "space-between" }}
            >
              <Button
                color="secondary"
                startIcon={<ArrowBack />}
                disabled={submission === "pending"}
                onClick={() => {
                  if (step === 0) setScreen("list");
                  else setStep(step - 1);
                  setAttempted(false);
                  setSubmission("idle");
                }}
              >
                {step === 0 ? "Back to runs" : "Back"}
              </Button>
              {step < 4 ? (
                <Button
                  variant="contained"
                  endIcon={<ArrowForward />}
                  onClick={next}
                  disabled={step === 0 && optionState !== "ready"}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={submit}
                  disabled={submission === "pending"}
                >
                  {submission === "pending"
                    ? "Submitting…"
                    : submission === "error"
                      ? "Retry mock submission"
                      : "Submit mock run"}
                </Button>
              )}
            </Stack>
          </Box>
        </Drawer>
      </AppShell>
    </ThemeProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Preview root missing.");
createRoot(root).render(<Preview />);
