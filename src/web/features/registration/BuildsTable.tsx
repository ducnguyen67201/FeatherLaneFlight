import {
  Box,
  Button,
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
import Refresh from "@mui/icons-material/Refresh";
import type { RegisteredBuildView } from "@featherlane/contracts";
import { tokens } from "../../design/theme";
import {
  CatalogPagination,
  type CatalogPaginationProps,
} from "./CatalogPagination";

type BuildsTableProps = {
  builds: readonly RegisteredBuildView[];
  pagination: CatalogPaginationProps;
  onRefresh: () => void;
  onOpen: (id: string) => void;
};

export function BuildsTable({
  builds,
  pagination,
  onRefresh,
  onOpen,
}: BuildsTableProps) {
  return (
    <>
      <Stack
        direction="row"
        spacing={3}
        sx={{ p: 4, justifyContent: "space-between", alignItems: "center" }}
      >
        <Box>
          <Typography component="h2" variant="body1" sx={{ fontWeight: 600 }}>
            Registered builds
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {builds.length} registered{" "}
            {builds.length === 1 ? "build" : "builds"} on this page · immutable
            metadata
          </Typography>
          <Typography
            id="build-details-help"
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 2 }}
          >
            Open a build to inspect its exact source, artifact and
            configuration.
          </Typography>
        </Box>
        <Button
          color="secondary"
          startIcon={<Refresh />}
          disabled={pagination.pending}
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </Stack>
      {builds.length === 0 ? (
        <Box sx={{ p: 6 }}>
          <Typography>No registered builds yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Registered build metadata will appear here.
          </Typography>
        </Box>
      ) : (
        <TableContainer
          tabIndex={0}
          aria-label="Registered builds; scroll horizontally for more columns"
        >
          <Table
            sx={{ minWidth: tokens.layoutPx.runTableMinWidth }}
            aria-label="Registered builds"
          >
            <TableHead>
              <TableRow>
                {[
                  "Build",
                  "Target",
                  "Artifact SHA-256",
                  "Registered (UTC)",
                  "Details",
                ].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {builds.map((build) => (
                <TableRow key={build.id} hover>
                  <TableCell>
                    <Typography variant="body2">{build.label}</Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      {build.flightStack}{" "}
                      {build.flightStack === "PX4"
                        ? build.flightStackVersion
                        : ""}{" "}
                      · {build.sourceRevision.slice(0, 8)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {build.executionTarget.operatingSystem === "macos"
                      ? "macOS"
                      : "Linux"}{" "}
                    · {build.executionTarget.architecture}
                  </TableCell>
                  <TableCell>
                    <Typography variant="code" title={build.artifactSha256}>
                      {build.artifactSha256.slice(0, 8)}…
                      {build.artifactSha256.slice(-8)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {build.createdAt.slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      color="secondary"
                      aria-label={`Open ${build.label} build`}
                      aria-describedby="build-details-help"
                      onClick={() => onOpen(build.id)}
                    >
                      Open <ArrowForward fontSize="small" sx={{ ml: 1 }} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <CatalogPagination {...pagination} />
    </>
  );
}
