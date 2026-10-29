import type { MouseEvent } from "react";
import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ArrowForward from "@mui/icons-material/ArrowForward";
import type { RunListEntry } from "@featherlane/contracts";
import { tokens } from "../../design/theme";
import { execution, evaluation } from "../../design/statusPresentation";
import { StatusBadge } from "../../components/StatusBadge";
export function RunsTable({
  rows,
  live,
  fetching,
  page,
  nextCursor,
  onPrevious,
  onNext,
  onOpen,
  runHref,
}: {
  rows: readonly RunListEntry[];
  live: boolean;
  fetching: boolean;
  page: number;
  nextCursor: string | null;
  onPrevious: () => void;
  onNext: () => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
  runHref: (id: string) => string;
}) {
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, overflow: "hidden" }}>
      <Box sx={{ p: 4 }}>
        <Typography component="h2" variant="body1" sx={{ fontWeight: 600 }}>
          Recent runs
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {rows.length} matching {live ? "runs" : "samples"} on this page
          {live ? "" : " · newest first · mock dataset"}
        </Typography>
        <Typography
          id="details-available"
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 2 }}
        >
          Open a run to inspect its frozen inputs, trials and evidence.
        </Typography>
        {fetching && (
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
                  <Typography variant="body2">{run.buildLabel}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {run.suiteTitle} · rev {run.suiteRevision}
                  </Typography>
                </TableCell>
                <TableCell>{run.runnerDisplayName}</TableCell>
                <TableCell>
                  <StatusBadge value={execution[run.executionState]} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={evaluation[run.evaluationOutcome]} />
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    color="secondary"
                    component="a"
                    href={runHref(run.id)}
                    onClick={(event) => onOpen(event, run.id)}
                    data-run-id={run.id}
                    aria-label={`Open ${run.id}`}
                    aria-describedby="details-available"
                  >
                    Open <ArrowForward fontSize="small" sx={{ ml: 1 }} />
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
          {nextCursor ? "more samples available" : "no additional pages"}
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            disabled={page === 0 || fetching}
            variant="outlined"
            onClick={onPrevious}
          >
            Previous
          </Button>
          <Button
            disabled={!nextCursor || fetching}
            variant="outlined"
            onClick={onNext}
          >
            Next
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
