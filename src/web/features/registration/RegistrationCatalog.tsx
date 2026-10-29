import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Divider,
  Paper,
  Skeleton,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { BuildsTable } from "./BuildsTable";
import { LocalProfilesTable } from "./LocalProfilesTable";
import { IntegrationProfilesSection } from "./IntegrationProfilesSection";
import {
  RegistrationDetailDialog,
  type RegistrationSelection,
} from "./RegistrationDetailDialog";
import {
  useRegistrationCatalog,
  type RegistrationCatalogProps,
} from "./useRegistrationCatalog";

export function RegistrationCatalog(props: RegistrationCatalogProps) {
  const queryClient = useQueryClient();
  const catalog = useRegistrationCatalog(props);
  const [tab, setTab] = useState(0);
  const [selection, setSelection] = useState<RegistrationSelection | null>(
    null,
  );
  const [detailAccessLost, setDetailAccessLost] = useState(false);
  const accessLost = catalog.accessLost || detailAccessLost;
  const close = () => setSelection(null);
  if (accessLost)
    return (
      <Alert severity="warning">
        <AlertTitle>Project access removed</AlertTitle>Protected registrations
        are hidden. Refresh project access after your membership is restored.
      </Alert>
    );
  if (catalog.loading)
    return (
      <Paper variant="outlined" sx={{ p: 5 }}>
        <Typography role="status">Loading builds and profiles…</Typography>
        <Skeleton height={55} />
        <Skeleton height={100} />
      </Paper>
    );
  if (catalog.initialError)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={catalog.refresh}>
            Try again
          </Button>
        }
      >
        <AlertTitle>Catalog could not be loaded</AlertTitle>Retry to verify
        current project access and registrations.
      </Alert>
    );
  return (
    <>
      {catalog.refreshError && (
        <Alert
          severity="warning"
          sx={{ mb: 5 }}
          action={
            <Button color="inherit" onClick={catalog.refresh}>
              Retry
            </Button>
          }
        >
          <AlertTitle>
            Refresh failed · showing the last loaded catalog
          </AlertTitle>
          Retry to load current registration metadata.
        </Alert>
      )}
      {catalog.pending && (
        <Typography role="status" variant="caption" color="text.secondary">
          Refreshing registrations…
        </Typography>
      )}
      <Paper variant="outlined" sx={{ minWidth: 0, overflow: "hidden" }}>
        <Tabs
          value={tab}
          onChange={(_, value: number) => setTab(value)}
          aria-label="Registration catalog"
          sx={{ px: 4, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab id="build-tab" aria-controls="build-panel" label="Builds" />
          <Tab
            id="profile-tab"
            aria-controls="profile-panel"
            label="Profiles"
          />
        </Tabs>
        <Box
          role="tabpanel"
          id={tab === 0 ? "build-panel" : "profile-panel"}
          aria-labelledby={tab === 0 ? "build-tab" : "profile-tab"}
        >
          {tab === 0 ? (
            <BuildsTable
              builds={catalog.builds}
              pagination={catalog.buildPagination}
              onRefresh={catalog.refresh}
              onOpen={(id) => setSelection({ kind: "build", id })}
            />
          ) : (
            <>
              <Alert severity="info" sx={{ m: 4 }}>
                Compatibility checks metadata only. Simulation capability
                qualification is a separate evidence gate.
              </Alert>
              <LocalProfilesTable
                profiles={catalog.localProfiles}
                integrations={catalog.integrationProfiles}
                pagination={catalog.localPagination}
                onOpen={(id) => setSelection({ kind: "local", id })}
              />
              <Divider />
              <IntegrationProfilesSection
                profiles={catalog.integrationProfiles}
                pagination={catalog.integrationPagination}
                onOpen={(id) => setSelection({ kind: "integration", id })}
              />
            </>
          )}
        </Box>
      </Paper>
      <RegistrationDetailDialog
        {...props}
        selection={selection}
        onClose={close}
        onAccessFailure={(status) => {
          setDetailAccessLost(true);
          const queryKey = [
            ...props.cacheScope,
            "registrations",
            props.projectId,
          ];
          void queryClient
            .cancelQueries({ queryKey })
            .then(() => queryClient.removeQueries({ queryKey }));
          props.onAccessFailure(status);
        }}
      />
    </>
  );
}
