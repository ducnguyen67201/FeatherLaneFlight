import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ArrowForward from "@mui/icons-material/ArrowForward";
import type {
  RegisteredIntegrationProfileView,
  LocalProfileView,
} from "@featherlane/contracts";
import { tokens } from "../../design/theme";
import {
  CatalogPagination,
  type CatalogPaginationProps,
} from "./CatalogPagination";

type LocalProfilesTableProps = {
  profiles: readonly LocalProfileView[];
  integrations: readonly RegisteredIntegrationProfileView[];
  pagination: CatalogPaginationProps;
  onOpen: (id: string) => void;
};

export function LocalProfilesTable({
  profiles,
  integrations,
  pagination,
  onOpen,
}: LocalProfilesTableProps) {
  return (
    <>
      <Box sx={{ p: 4 }}>
        <Typography component="h2" variant="body1" sx={{ fontWeight: 600 }}>
          Local execution profiles
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {profiles.length} registered{" "}
          {profiles.length === 1 ? "profile" : "profiles"} on this page · exact
          revision
        </Typography>
      </Box>
      {profiles.length === 0 ? (
        <Box sx={{ p: 6 }}>
          <Typography>No registered local profiles yet</Typography>
        </Box>
      ) : (
        <TableContainer
          tabIndex={0}
          aria-label="Local execution profiles; scroll horizontally for more columns"
        >
          <Table
            sx={{ minWidth: tokens.layoutPx.runTableMinWidth }}
            aria-label="Local execution profiles"
          >
            <TableHead>
              <TableRow>
                {[
                  "Profile",
                  "Integration",
                  "Configuration digest",
                  "Details",
                ].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((profile) => {
                const integration = integrations.find(
                  (item) => item.id === profile.integrationProfileId,
                );
                return (
                  <TableRow key={profile.id} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {profile.displayName}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block" }}
                      >
                        {profile.executionTarget.operatingSystem === "macos"
                          ? "macOS"
                          : "Linux"}{" "}
                        · {profile.executionTarget.architecture}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        title={profile.integrationProfileId}
                      >
                        {integration
                          ? `${integration.name} · r${integration.revision}`
                          : `${profile.integrationProfileId.slice(0, 20)}…`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="code"
                        title={profile.configurationDigest}
                      >
                        {profile.configurationDigest.slice(0, 8)}…
                        {profile.configurationDigest.slice(-8)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        color="secondary"
                        aria-label={`Open ${profile.displayName} profile`}
                        onClick={() => onOpen(profile.id)}
                      >
                        Open <ArrowForward fontSize="small" sx={{ ml: 1 }} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <CatalogPagination {...pagination} />
    </>
  );
}
