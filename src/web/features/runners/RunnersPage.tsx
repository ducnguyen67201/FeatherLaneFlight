import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CloudOutlined from "@mui/icons-material/CloudOutlined";
import ComputerOutlined from "@mui/icons-material/ComputerOutlined";
import Add from "@mui/icons-material/Add";
import type { EnrollmentGrant, RunnerSummary } from "@featherlane/contracts";
import { PageLayout } from "../../layouts/PageLayout";
import { StatusBadge } from "../../components/StatusBadge";
import { capacity, connection } from "../../design/statusPresentation";
import { tokens } from "../../design/theme";
import { EnrollmentDialog } from "./EnrollmentDialog";
import { RunnerDetails } from "./RunnerDetails";

type RunnersPageProps = {
  projectName: string;
  runners: RunnerSummary[];
  loading: boolean;
  error: boolean;
  blocked: boolean;
  revoking: boolean;
  page: number;
  onRetry: () => void;
  onRefresh: () => void;
  onCreateGrant: (name: string, key: string) => Promise<EnrollmentGrant>;
  onRevoke: (runner: RunnerSummary) => Promise<void>;
  onPreviousPage: () => void;
  onNextPage?: () => void;
};
export function RunnersPage({
  projectName,
  runners,
  loading,
  error,
  blocked,
  revoking,
  page,
  onRetry,
  onRefresh,
  onCreateGrant,
  onRevoke,
  onPreviousPage,
  onNextPage,
}: RunnersPageProps) {
  const [connect, setConnect] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const connectButton = useRef<HTMLButtonElement>(null);
  const selectedRunner = runners.find((runner) => runner.id === selected);
  function contact(runner: RunnerSummary) {
    return runner.lastSeenAt
      ? `Last contact ${new Date(runner.lastSeenAt).toLocaleString()}`
      : "No heartbeat received";
  }
  if (blocked)
    return (
      <Alert severity="warning">
        Project access changed. Protected runner details are hidden.{" "}
        <Button onClick={onRetry}>Retry access</Button>
      </Alert>
    );
  return (
    <PageLayout
      title="Runners"
      description="Run in our cloud by default, or connect a machine you control."
      breadcrumbs={[
        <Typography key="project" variant="body2">
          {projectName}
        </Typography>,
        <Typography key="runners" variant="body2">
          Runners
        </Typography>,
      ]}
      actions={
        <Button variant="contained" disabled>
          New simulation run
        </Button>
      }
    >
      <Stack spacing={6}>
        <Paper variant="outlined" sx={{ p: { xs: 4, sm: 6 } }}>
          <Stack direction="row" spacing={4} sx={{ alignItems: "flex-start" }}>
            <CloudOutlined color="primary" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack
                direction="row"
                spacing={3}
                sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 2 }}
              >
                <Typography variant="h2">FeatherLane cloud</Typography>
                <Chip
                  size="small"
                  label="Default"
                  color="primary"
                  variant="outlined"
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                We provide the worker and simulator. Use your browser to start a
                test and review evidence when managed execution is available.
              </Typography>
            </Box>
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
              gap: 5,
              mt: 6,
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                EXECUTION
              </Typography>
              <Typography variant="body2" sx={{ mt: 2 }}>
                Not available yet
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                SUPPORTED ENVIRONMENT
              </Typography>
              <Typography variant="body2" sx={{ mt: 2 }}>
                PX4 / SIH quadrotor
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Qualification required
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                BUILD HANDLING
              </Typography>
              <Typography variant="body2" sx={{ mt: 2 }}>
                Private supported build upload
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Planned separately
              </Typography>
            </Box>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 6 }}>
            This release connects machines and reports health. Cloud
            provisioning and simulation execution follow later.
          </Typography>
        </Paper>
        <Box>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={4}
            sx={{
              justifyContent: "space-between",
              alignItems: { sm: "center" },
              mb: 4,
            }}
          >
            <Box>
              <Typography variant="h2">
                Your machines{" "}
                <Typography
                  component="span"
                  variant="body2"
                  color="text.secondary"
                >
                  · optional
                </Typography>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Use your own compute and keep executable builds on that machine.
              </Typography>
            </Box>
            <Button
              ref={connectButton}
              variant="outlined"
              startIcon={<Add />}
              onClick={() => setConnect(true)}
            >
              Connect machine
            </Button>
          </Stack>
          {loading ? (
            <Skeleton
              variant="rounded"
              height={160}
              aria-label="Loading machines"
            />
          ) : error ? (
            <Alert severity="error">
              Could not load machines. <Button onClick={onRetry}>Retry</Button>
            </Alert>
          ) : runners.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 6 }}>
              <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
                <ComputerOutlined color="disabled" />
                <Typography variant="body2">
                  No machines connected. Connect a machine to report its health.
                </Typography>
                <Button onClick={() => setConnect(true)}>
                  Connect your first machine
                </Button>
              </Stack>
            </Paper>
          ) : (
            <Paper variant="outlined">
              <TableContainer>
                <Table
                  aria-label="Your connected machines"
                  sx={{ minWidth: tokens.layoutPx.formMaxWidth }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>Machine</TableCell>
                      <TableCell>Connection</TableCell>
                      <TableCell>Capacity</TableCell>
                      <TableCell>Declared inputs</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {runners.map((runner) => (
                      <TableRow key={runner.id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {runner.displayName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {contact(runner)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            value={connection[runner.connectionState]}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={capacity[runner.capacityState]} />
                        </TableCell>
                        <TableCell>
                          {runner.localProfiles.length} profiles ·{" "}
                          {runner.availableBuilds.length} builds
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            aria-label={`Details for ${runner.displayName}`}
                            onClick={() => setSelected(runner.id)}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Stack
                direction="row"
                spacing={2}
                sx={{ justifyContent: "flex-end", p: 4 }}
              >
                <Button disabled={page === 0} onClick={onPreviousPage}>
                  Previous
                </Button>
                <Button disabled={!onNextPage} onClick={onNextPage}>
                  Next
                </Button>
              </Stack>
            </Paper>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
            Local mode sends metadata and allowed test evidence back to
            FeatherLaneFlight. Simulator installation and approved local setup
            are required; enrollment alone does not install them.
          </Typography>
        </Box>
      </Stack>
      {connect && (
        <EnrollmentDialog
          projectName={projectName}
          onClose={() => {
            setConnect(false);
            connectButton.current?.focus();
            void onRefresh();
          }}
          onCreate={onCreateGrant}
        />
      )}
      {selectedRunner && (
        <RunnerDetails
          key={selectedRunner.id}
          runner={selectedRunner}
          onClose={() => setSelected(null)}
          onRevoke={() => onRevoke(selectedRunner)}
          pending={revoking}
        />
      )}
    </PageLayout>
  );
}
