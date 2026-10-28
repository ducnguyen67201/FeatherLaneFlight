import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CssBaseline from "@mui/material/CssBaseline";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import GlobalStyles from "@mui/material/GlobalStyles";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import { ThemeProvider } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import ArrowForward from "@mui/icons-material/ArrowForward";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Close from "@mui/icons-material/Close";
import CompareArrows from "@mui/icons-material/CompareArrows";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FlightOutlined from "@mui/icons-material/FlightOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import StorageOutlined from "@mui/icons-material/StorageOutlined";
import ViewListOutlined from "@mui/icons-material/ViewListOutlined";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import { theme, tokens } from "./theme";
import {
  capacity,
  connection,
  evaluation,
  execution,
  statusGroups,
  type Presentation,
} from "./status";

const { layoutPx: layout, typography: type } = tokens;
const navigation = [
  { label: "Runs", path: "/runs", icon: PlayArrowOutlined },
  { label: "Compare", path: "/compare", icon: CompareArrows },
  { label: "Test suites", path: "/suites", icon: ViewListOutlined },
  { label: "Runners", path: "/runners", icon: StorageOutlined },
  { label: "Settings", path: "/settings", icon: SettingsOutlined },
];

function StatusBadge({ value }: { value: Presentation }) {
  const Icon = value.icon;
  return (
    <Chip
      size="small"
      icon={<Icon fontSize="small" />}
      label={value.label}
      sx={(t) => ({
        color: t.palette.status[value.role].foreground,
        bgcolor: t.palette.status[value.role].background,
        "& .MuiChip-icon": { color: "inherit", ml: 2 },
      })}
    />
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 6, minWidth: 0 }}>
      <Typography component="h2" variant="h2" sx={{ mb: description ? 1 : 5 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 6 }}>
          {description}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

function Preview() {
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const [drawer, setDrawer] = useState(false);
  const [project, setProject] = useState("sih");
  const [userAnchor, setUserAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [tab, setTab] = useState(0);
  const [selectedNav, setSelectedNav] = useState("Runs");
  const [state, setState] = useState("ready");
  const [density, setDensity] = useState("compact");
  const [name, setName] = useState("PX4 qualification");
  const [checked, setChecked] = useState(true);
  const [feedback, setFeedback] = useState("");

  const sidebar = (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <Stack
        direction="row"
        spacing={3}
        sx={{
          alignItems: "center",
          px: 5,
          minHeight: layout.headerHeight.desktop,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {!narrow && <FlightOutlined sx={{ color: "primary.main" }} />}
        <Box sx={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>
            FeatherLane
            <Typography
              component="span"
              color="primary"
              sx={{ fontWeight: 700 }}
            >
              Flight
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            SIMULATION WORKSPACE
          </Typography>
        </Box>
        {narrow && (
          <IconButton
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
          >
            <Close />
          </IconButton>
        )}
      </Stack>
      <Box component="nav" aria-label="Primary navigation" sx={{ p: 3 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", px: 3, py: 3 }}
        >
          PROJECT
        </Typography>
        <List disablePadding>
          {navigation.map(({ label, icon: Icon, path }) => (
            <ListItemButton
              key={path}
              component="a"
              href={`#${path.slice(1)}`}
              selected={selectedNav === label}
              aria-current={selectedNav === label ? "page" : undefined}
              onClick={() => {
                setSelectedNav(label);
                setDrawer(false);
                setFeedback(
                  `${label} selected in the shell preview. Feature content is deferred to its phase.`,
                );
              }}
              sx={{ mb: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={label}
                slotProps={{
                  primary: {
                    variant: "body2",
                    sx: { fontWeight: selectedNav === label ? 600 : 400 },
                  },
                }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Box sx={{ mt: "auto", p: 5, borderTop: 1, borderColor: "divider" }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 2 }}>
          <WidgetsOutlined fontSize="small" sx={{ color: "primary.main" }} />
          <Typography variant="body2">Foundation preview</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Phase 02 · Isolated sample data
        </Typography>
      </Box>
    </Box>
  );

  const controls = (
    <Panel
      title="Controls & typography"
      description="Direct MUI controls, shared sizing, and visible interaction states."
    >
      <Stack spacing={5}>
        <TextField
          label="Reference name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          fullWidth
          helperText="Editable sample · values stay local to this preview"
          size="small"
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={4}>
          <FormControl fullWidth size="small">
            <InputLabel id="density-label">Density</InputLabel>
            <Select
              labelId="density-label"
              label="Density"
              value={density}
              onChange={(event) => setDensity(event.target.value)}
            >
              <MenuItem value="compact">Compact</MenuItem>
              <MenuItem value="comfortable">Comfortable</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Validation example"
            error
            defaultValue=""
            helperText="A reference name is required."
            size="small"
            fullWidth
          />
        </Stack>
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Checkbox
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
          }
          label={
            <Typography variant="body2">Show supporting metadata</Typography>
          }
        />
        <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Button
            variant="contained"
            onClick={() =>
              setFeedback(
                "Primary action selected. No operation was submitted.",
              )
            }
          >
            Primary action
          </Button>
          <Button
            color="secondary"
            variant="outlined"
            onClick={() => setDialog(true)}
          >
            Open dialog
          </Button>
          <Button disabled variant="contained">
            Unavailable
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Unavailable actions keep an explanation outside the disabled control.
        </Typography>
        <Divider />
        <Stack spacing={2}>
          <Typography variant="body1">
            Readable body text for instructions and decisions.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Compact supporting text for dense engineering views.
          </Typography>
          {checked && (
            <Typography
              variant="body2"
              sx={{ fontFamily: type.fontFamily.mono }}
            >
              build: 8ac71de · protocol: v1
            </Typography>
          )}
        </Stack>
      </Stack>
    </Panel>
  );

  const statusReference = (
    <Panel
      title="Status has a specific meaning"
      description="Execution, test outcome, and runner health remain separate."
    >
      <Stack spacing={5}>
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 2 }}
          >
            EXECUTION + EVALUATION
          </Typography>
          <Stack
            direction="row"
            spacing={2}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <StatusBadge value={execution.COMPLETED} />
            <StatusBadge value={evaluation.PASS} />
          </Stack>
        </Box>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          <StatusBadge value={execution.COMPLETED} />
          <StatusBadge value={evaluation.FAIL} />
        </Stack>
        <Divider />
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          <StatusBadge value={execution.RUNNING} />
          <StatusBadge value={evaluation.NOT_EVALUATED} />
        </Stack>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          <StatusBadge value={evaluation.INCONCLUSIVE} />
          <StatusBadge value={capacity.NEEDS_CLEANUP} />
        </Stack>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          <StatusBadge value={connection.CONNECTED} />
          <StatusBadge value={connection.STALE} />
          <StatusBadge value={connection.OFFLINE} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          A finished execution is neutral. Only the evaluation outcome says
          whether the tests passed.
        </Typography>
      </Stack>
    </Panel>
  );

  const states = (
    <Panel
      title="Page states"
      description="Choose a state to review feedback within the same content region."
    >
      <Stack spacing={6}>
        <FormControl size="small" sx={{ maxWidth: 320 }}>
          <InputLabel id="state-label">Sample state</InputLabel>
          <Select
            labelId="state-label"
            value={state}
            label="Sample state"
            onChange={(event) => setState(event.target.value)}
          >
            <MenuItem value="ready">Ready</MenuItem>
            <MenuItem value="loading">Loading</MenuItem>
            <MenuItem value="empty">Empty</MenuItem>
            <MenuItem value="error">Error</MenuItem>
          </Select>
        </FormControl>
        <Box
          sx={{
            minHeight: 208,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
          aria-busy={state === "loading"}
        >
          {state === "loading" ? (
            <Box role="status" aria-label="Loading reference content">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Loading reference content…
              </Typography>
              <Skeleton animation={false} width="40%" height={28} />
              <Skeleton animation={false} height={48} />
              <Skeleton animation={false} height={48} />
            </Box>
          ) : state === "empty" ? (
            <Stack
              spacing={3}
              sx={{ alignItems: "center", py: 6, textAlign: "center" }}
            >
              <ViewListOutlined color="disabled" />
              <Typography
                component="h3"
                variant="body1"
                sx={{ fontWeight: 600 }}
              >
                Nothing here yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This reference collection is empty. Try the populated sample.
              </Typography>
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => setState("ready")}
              >
                Show sample
              </Button>
            </Stack>
          ) : state === "error" ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" onClick={() => setState("ready")}>
                  Retry sample
                </Button>
              }
            >
              <AlertTitle>Couldn’t load this section</AlertTitle>Your local
              selections are preserved. Retry when you’re ready.
            </Alert>
          ) : (
            <Stack spacing={4}>
              <Alert severity="info">
                Preview data is ready. No runner or service is connected.
              </Alert>
              <TextField
                label="Unavailable field"
                defaultValue="Requires a selected resource"
                disabled
                fullWidth
                size="small"
              />
              <Typography variant="body2" color="text.secondary">
                Select a resource before this field becomes available.
              </Typography>
            </Stack>
          )}
        </Box>
      </Stack>
    </Panel>
  );

  return (
    <>
      <GlobalStyles
        styles={{ html: { fontSize: largeText ? "200%" : "100%" } }}
      />
      <Link className="skip-link" href="#main">
        Skip to content
      </Link>
      {narrow ? (
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          slotProps={{
            paper: { sx: { width: layout.sidebarWidth, maxWidth: "100vw" } },
          }}
        >
          {sidebar}
        </Drawer>
      ) : (
        <Box
          component="aside"
          sx={{
            position: "fixed",
            inset: "0 auto 0 0",
            width: layout.sidebarWidth,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowY: "auto",
          }}
        >
          {sidebar}
        </Box>
      )}
      <Box sx={{ ml: narrow ? 0 : `${layout.sidebarWidth}px`, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            minHeight: narrow
              ? layout.headerHeight.narrow
              : layout.headerHeight.desktop,
            px: narrow ? 4 : 6,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
            gap: 3,
            flexWrap: "wrap",
          }}
        >
          {narrow && (
            <IconButton
              aria-label="Open navigation"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
              sx={{ ml: -2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <FormControl
            size="small"
            sx={{
              minWidth: 0,
              flex: narrow ? 1 : "0 1 380px",
              ...(largeText && narrow
                ? { order: 3, flexBasis: "100%", mb: 2 }
                : {}),
            }}
          >
            <InputLabel id="project-label">Organization / project</InputLabel>
            <Select
              labelId="project-label"
              value={project}
              label="Organization / project"
              onChange={(event) => setProject(event.target.value)}
            >
              <MenuItem value="sih">Flight Lab / PX4 qualification</MenuItem>
              <MenuItem value="research">
                Flight Lab / Research sandbox
              </MenuItem>
              <MenuItem value="none">No project selected</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ flexGrow: 1, display: { xs: "none", md: "block" } }} />
          {!narrow && (
            <Typography variant="caption" color="text.secondary">
              Local preview
            </Typography>
          )}
          <Tooltip title="Open user menu">
            <IconButton
              sx={{ ml: largeText && narrow ? "auto" : 0 }}
              aria-label="Open user menu"
              aria-controls={userAnchor ? "user-menu" : undefined}
              aria-haspopup="true"
              aria-expanded={Boolean(userAnchor)}
              onClick={(event) => setUserAnchor(event.currentTarget)}
            >
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: "action.selected",
                  color: "primary.main",
                  fontSize: "0.75rem",
                }}
              >
                FL
              </Avatar>
              <ExpandMore fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            id="user-menu"
            anchorEl={userAnchor}
            open={Boolean(userAnchor)}
            onClose={() => setUserAnchor(null)}
          >
            <MenuItem disabled>Preview user · Flight Lab</MenuItem>
            <MenuItem
              onClick={() => {
                setUserAnchor(null);
                setDialog(true);
              }}
            >
              About this preview
            </MenuItem>
            <MenuItem
              onClick={() => {
                setLargeText(!largeText);
                setUserAnchor(null);
              }}
            >
              {largeText ? "Use standard text size" : "Preview 200% text size"}
            </MenuItem>
          </Menu>
        </Box>
        <Box
          component="main"
          id="main"
          tabIndex={-1}
          sx={{
            p: {
              xs: `${layout.pagePadding.narrow}px`,
              md: `${layout.pagePadding.desktop}px`,
            },
            outline: "none",
            minWidth: 0,
          }}
        >
          <Breadcrumbs
            separator={<ChevronRight fontSize="small" />}
            sx={{ mb: 5 }}
          >
            <Typography variant="body2" color="text.secondary">
              {selectedNav}
            </Typography>
            <Typography variant="body2">Foundation reference</Typography>
          </Breadcrumbs>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={4}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              mb: 6,
            }}
          >
            <Box>
              <Typography
                variant="caption"
                color="primary"
                sx={{ display: "block", mb: 2, fontWeight: 600 }}
              >
                PHASE 02 / UI FOUNDATION
              </Typography>
              <Typography component="h1" variant="h1">
                A shared shell for every workflow
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Navigation, page structure, controls, and status language.
              </Typography>
            </Box>
            <Button
              variant="contained"
              endIcon={<ArrowForward />}
              onClick={() => setDialog(true)}
            >
              Preview dialog
            </Button>
          </Stack>
          <Alert
            severity="info"
            icon={<WidgetsOutlined fontSize="small" />}
            sx={{ mb: 6 }}
          >
            Isolated design reference · sample data only. Navigation
            demonstrates the dashboard shell; feature screens follow in later
            phases.
          </Alert>
          {feedback && (
            <Alert
              role="status"
              severity="info"
              onClose={() => setFeedback("")}
              sx={{ mb: 6 }}
            >
              {feedback}
            </Alert>
          )}
          {project === "none" ? (
            <Panel title="Choose a project">
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                Select an organization and project in the header to see the
                reference content.
              </Typography>
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => setProject("sih")}
              >
                Use sample project
              </Button>
            </Panel>
          ) : (
            <>
              <Tabs
                value={tab}
                onChange={(_, value: number) => setTab(value)}
                aria-label="Foundation reference sections"
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 6, borderBottom: 1, borderColor: "divider" }}
              >
                {["Reference", "Status vocabulary", "Page states"].map(
                  (label, index) => (
                    <Tab
                      key={label}
                      label={label}
                      id={`tab-${index}`}
                      aria-controls={`panel-${index}`}
                    />
                  ),
                )}
              </Tabs>
              <Box
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
              >
                {tab === 0 && (
                  <Stack spacing={6}>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "minmax(0,1fr)",
                          lg: "minmax(0,1.15fr) minmax(0,1fr)",
                        },
                        gap: 6,
                      }}
                    >
                      {controls}
                      {statusReference}
                    </Box>
                    <Paper
                      variant="outlined"
                      sx={{ minWidth: 0, overflow: "hidden" }}
                    >
                      <Box sx={{ p: 6 }}>
                        <Typography component="h2" variant="h2">
                          Compact content reference
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 1 }}
                        >
                          Shared table density and independent status columns.
                          Illustrative rows only.
                        </Typography>
                      </Box>
                      <TableContainer
                        tabIndex={0}
                        role="region"
                        aria-label="Reference status table, scroll horizontally on narrow screens"
                      >
                        <Table
                          size="small"
                          sx={{
                            minWidth: 640,
                            "& .MuiTableCell-root": {
                              py: density === "compact" ? 3 : 4,
                            },
                          }}
                        >
                          <TableHead>
                            <TableRow>
                              <TableCell>Reference</TableCell>
                              <TableCell>Execution</TableCell>
                              <TableCell>Evaluation</TableCell>
                              <TableCell align="right">Sample count</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {[
                              {
                                id: "sample-001",
                                state: execution.COMPLETED,
                                outcome: evaluation.PASS,
                                count: "12",
                              },
                              {
                                id: "sample-002",
                                state: execution.COMPLETED,
                                outcome: evaluation.FAIL,
                                count: "12",
                              },
                              {
                                id: "sample-003",
                                state: execution.RUNNING,
                                outcome: evaluation.NOT_EVALUATED,
                                count: "—",
                              },
                            ].map((row) => (
                              <TableRow key={row.id} hover>
                                <TableCell
                                  sx={{ fontFamily: type.fontFamily.mono }}
                                >
                                  {row.id}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge value={row.state} />
                                </TableCell>
                                <TableCell>
                                  <StatusBadge value={row.outcome} />
                                </TableCell>
                                <TableCell
                                  align="right"
                                  sx={{ fontVariantNumeric: "tabular-nums" }}
                                >
                                  {row.count}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                      <Stack
                        direction="row"
                        sx={{
                          justifyContent: "space-between",
                          alignItems: "center",
                          p: 4,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          3 sample rows
                        </Typography>
                        <Stack direction="row" spacing={2}>
                          <Button disabled>Previous</Button>
                          <Button disabled>Next</Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  </Stack>
                )}
                {tab === 1 && (
                  <Stack spacing={6}>
                    {Object.entries(statusGroups).map(([title, entries]) => (
                      <Panel key={title} title={title}>
                        <Stack
                          direction="row"
                          spacing={3}
                          useFlexGap
                          sx={{ flexWrap: "wrap" }}
                        >
                          {Object.entries(entries).map(([key, value]) => (
                            <Stack
                              key={key}
                              spacing={2}
                              sx={{
                                alignItems: "flex-start",
                                minWidth: 160,
                                py: 1,
                              }}
                            >
                              <StatusBadge value={value} />
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontFamily: type.fontFamily.mono }}
                              >
                                {key}
                              </Typography>
                            </Stack>
                          ))}
                        </Stack>
                      </Panel>
                    ))}
                  </Stack>
                )}
                {tab === 2 && states}
              </Box>
            </>
          )}
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", pt: 6, gap: 4 }}
          >
            <Typography variant="caption" color="text.secondary">
              FeatherLaneFlight · Foundation reference
            </Typography>
            <Typography variant="caption" color="text.secondary">
              P02 / Preview 01
            </Typography>
          </Stack>
        </Box>
      </Box>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        <DialogTitle id="dialog-title">A consistent foundation</DialogTitle>
        <DialogContent>
          <DialogContentText id="dialog-description">
            This dialog demonstrates raised surfaces, readable text, focus
            containment, and keyboard dismissal. All changes are local to the
            isolated P02 preview.
          </DialogContentText>
          <TextField
            autoFocus
            margin="normal"
            label="Sample note"
            fullWidth
            defaultValue="Review the shared shell"
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ p: 6, pt: 2 }}>
          <Button color="secondary" onClick={() => setDialog(false)}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setDialog(false);
              setFeedback("Sample dialog confirmed. No data was saved.");
            }}
          >
            Confirm sample
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <Preview />
  </ThemeProvider>,
);
