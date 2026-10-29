import { useState, type MouseEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import ArrowForward from "@mui/icons-material/ArrowForward";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import type { SuiteRevisionView } from "@featherlane/contracts";
import { StatusBadge } from "../../components/StatusBadge";
import { suite as suiteStatus } from "../../design/statusPresentation";
import { tokens } from "../../design/theme";
import { PageLayout } from "../../layouts/PageLayout";

export type CheckKind = SuiteRevisionView["checks"][number]["kind"];
const checkOptions: readonly { value: CheckKind; label: string }[] = [
  { value: "MISSION_COMPLETION", label: "Mission completion" },
  { value: "LANDING_DISARM", label: "Landing and disarm" },
  { value: "METRIC_THRESHOLD", label: "Metric threshold" },
];
type Props = {
  projectName: string;
  draftsHref: string;
  rows: readonly SuiteRevisionView[];
  state: "loading" | "error" | "ready";
  search: string;
  requiredCheck: CheckKind | null;
  onSearch: (value: string) => void;
  onCheck: (value: CheckKind | null) => void;
  onReset: () => void;
  onRetry: () => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
  revisionHref: (id: string) => string;
  page: number;
  hasNext: boolean;
  fetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
};
export function SuiteCatalogPage(props: Props) {
  const [adding, setAdding] = useState(false);
  const filtered = Boolean(props.search || props.requiredCheck);
  return (
    <>
      <PageLayout
        breadcrumbs={[
          <Typography key="p" variant="body2" color="text.secondary">
            {props.projectName}
          </Typography>,
          <Typography key="s" variant="body2">
            Test suites
          </Typography>,
        ]}
        title="Test suites"
        eyebrow="TEST SUITES"
        description="See what each suite does, what it checks, and the evidence it needs."
        actions={
          <Stack direction="row" spacing={3}>
            <Button component="a" href={props.draftsHref} variant="contained">
              Drafts & editor
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<InfoOutlined />}
              onClick={() => setAdding(true)}
            >
              How to add suites
            </Button>
          </Stack>
        }
        filters={
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={4}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <TextField
              label="Find suite or revision ID"
              size="small"
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 128 } }}
              sx={{ flex: 2, minWidth: { sm: 220 } }}
            />
            <TextField
              select
              label="Required check"
              size="small"
              value={props.requiredCheck ?? ""}
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
              onChange={(event) =>
                props.onCheck(
                  checkOptions.find(
                    (option) => option.value === event.target.value,
                  )?.value ?? null,
                )
              }
              sx={{ flex: 1, minWidth: { xs: "100%", sm: 180 } }}
            >
              <MenuItem value="">All check types</MenuItem>
              {checkOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <Button color="secondary" onClick={props.onReset}>
              Clear filters
            </Button>
          </Stack>
        }
      >
        <Stack spacing={4}>
          <Alert severity="info" icon={<ScienceOutlined />}>
            These suites generate synthetic observations. No simulator or
            vehicle movement is commanded.
          </Alert>
          {props.state === "loading" ? (
            <Paper variant="outlined" sx={{ p: 6 }}>
              <Typography role="status" variant="body2" sx={{ mb: 4 }}>
                Loading test suites…
              </Typography>
              {[0, 1, 2].map((i) => (
                <Skeleton
                  key={i}
                  animation={false}
                  height={tokens.component.tableRowMinHeightPx}
                />
              ))}
            </Paper>
          ) : props.state === "error" ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" onClick={props.onRetry}>
                  Retry
                </Button>
              }
            >
              Could not load the catalog. Check your project access and retry.
            </Alert>
          ) : !props.rows.length ? (
            <Paper variant="outlined" sx={{ p: 6 }}>
              <Stack spacing={4} sx={{ alignItems: "flex-start", py: 6 }}>
                <Typography component="h2" variant="h2">
                  {filtered
                    ? "No suites match these filters"
                    : "No published suites yet"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {filtered
                    ? "Try another suite name, revision ID, or required check."
                    : "An operator can import a supported built-in suite for this project."}
                </Typography>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={filtered ? props.onReset : () => setAdding(true)}
                >
                  {filtered ? "Clear filters" : "How to add suites"}
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
                  Published suites
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {props.rows.length} matching revisions on this page
                </Typography>
                <Typography
                  id="suite-details-available"
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 2 }}
                >
                  Open a revision to see its plan, checks, and evidence
                  requirements.
                </Typography>
                {props.fetching && (
                  <Typography role="status" variant="caption">
                    Refreshing suites…
                  </Typography>
                )}
              </Box>
              <TableContainer
                tabIndex={0}
                aria-label="Test suites; scroll horizontally for more columns"
              >
                <Table sx={{ minWidth: tokens.layoutPx.runTableMinWidth }}>
                  <TableHead>
                    <TableRow>
                      {[
                        "Suite / published (UTC)",
                        "Revision",
                        "Integration profile",
                        "Scenarios",
                        "Checks",
                        "Definition",
                      ].map((label) => (
                        <TableCell key={label}>{label}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {props.rows.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.title}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block" }}
                          >
                            {row.createdAt.slice(0, 16).replace("T", " ")}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            Revision {row.revision}
                          </Typography>
                          <StatusBadge value={suiteStatus[row.status]} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            Synthetic reference
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            profile revision {row.integrationProfileRevision}
                          </Typography>
                        </TableCell>
                        <TableCell>{row.scenarios.length}</TableCell>
                        <TableCell>{row.checks.length}</TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            color="secondary"
                            component="a"
                            href={props.revisionHref(row.id)}
                            id={`suite-link-${row.id}`}
                            aria-label={`Open ${row.title} revision ${row.revision}`}
                            aria-describedby="suite-details-available"
                            onClick={(event) => props.onOpen(event, row.id)}
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
                  Page {props.page + 1} ·{" "}
                  {props.hasNext
                    ? "more revisions available"
                    : "no additional pages"}
                </Typography>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    disabled={props.page === 0 || props.fetching}
                    onClick={props.onPrevious}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={!props.hasNext || props.fetching}
                    onClick={props.onNext}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}
          <Typography variant="body2" color="text.secondary">
            Continue editing in Drafts & editor to publish a new revision.
          </Typography>
        </Stack>
      </PageLayout>
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="add-suites-title"
      >
        <DialogTitle id="add-suites-title">How suites are added</DialogTitle>
        <DialogContent>
          <Stack spacing={4}>
            <Typography variant="body2">
              An operator imports a supported built-in definition and binds it
              to an exact registered synthetic profile. The reference handler
              generates evidence and records its separate synthetic
              qualification.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Open Drafts & editor to create a suite. Open any published
              revision and choose Edit draft to work on its next version.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Got it</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
