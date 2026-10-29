import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Typography,
} from "@mui/material";
import { tokens } from "../../design/theme";
import type { RegistrationCatalogProps } from "./useRegistrationCatalog";
import {
  useRegistrationDetail,
  type RegistrationSelection,
} from "./useRegistrationDetail";
export type { RegistrationSelection } from "./useRegistrationDetail";
type RegistrationDetailDialogProps = RegistrationCatalogProps & {
  selection: RegistrationSelection | null;
  onClose: () => void;
};

export function RegistrationDetailDialog({
  projectId,
  client,
  cacheScope,
  onAccessFailure,
  selection,
  onClose,
}: RegistrationDetailDialogProps) {
  const detail = useRegistrationDetail(
    { projectId, client, cacheScope, onAccessFailure },
    selection,
  );
  const record = detail.record;
  let rows: readonly (readonly [string, string])[] = [];
  let title = "Registration details";
  if (record?.kind === "build") {
    const value = record.value;
    title = value.label;
    rows = [
      ["ID", value.id],
      [
        "Flight stack",
        value.flightStack === "PX4"
          ? `${value.flightStack} ${value.flightStackVersion}`
          : value.flightStack,
      ],
      [
        "Target",
        `${value.executionTarget.operatingSystem} · ${value.executionTarget.architecture}`,
      ],
      [
        "Base revision",
        value.flightStack === "PX4"
          ? value.baseFlightStackRevision
          : "Not applicable",
      ],
      ["Source revision", value.sourceRevision],
      ["Source digest", value.sourceDigest],
      [
        "Patch digest",
        value.flightStack === "PX4"
          ? (value.patchDigest ?? "None")
          : "Not applicable",
      ],
      ["Artifact SHA-256", value.artifactSha256],
      ["Configuration digest", value.configurationDigest],
      ["Registered (UTC)", value.createdAt],
    ];
  } else if (record?.kind === "local") {
    const value = record.value;
    title = value.displayName;
    rows = [
      ["ID", value.id],
      ["Profile digest", value.digest],
      ["Integration profile ID", value.integrationProfileId],
      ["Integration profile digest", value.integrationProfileDigest],
      ["Configuration digest", value.configurationDigest],
      ["Qualification", "Not evaluated"],
    ];
  } else if (record?.kind === "integration") {
    const value = record.value;
    title = value.name;
    rows = [
      ["ID", value.id],
      ["Revision", String(value.revision)],
      ["Specification digest", value.digest],
      value.runtimeFamily === "SYNTHETIC"
        ? ["Simulator", "FAKE · synthetic observations"]
        : ["Simulator / vehicle", `${value.simulator} / ${value.vehicle}`],
      [
        "Tools",
        value.runtimeFamily === "SYNTHETIC"
          ? `Python ${value.pythonVersion} · synthetic runtime`
          : `Python ${value.pythonVersion} · MAVSDK ${value.mavsdkVersion}`,
      ],
      ["Clock / speed", `Monotonic + simulation · ${value.speedFactor}×`],
      [
        "Randomization",
        "Fixed seed · repeats are not independent Monte Carlo samples",
      ],
      ["Support", "Declared · qualification pending"],
    ];
  }
  return (
    <Dialog
      open={selection !== null && !detail.accessDenied}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="registration-detail-title"
    >
      <DialogTitle id="registration-detail-title">{title}</DialogTitle>
      <DialogContent dividers>
        {detail.loading ? (
          <>
            <Typography role="status">Loading registration…</Typography>
            <Skeleton height={120} />
          </>
        ) : detail.failed ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={detail.retry}>
                Try again
              </Button>
            }
          >
            Registration details could not be loaded.
          </Alert>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 4 }}>
              Immutable registration · changes create a new identity.
            </Alert>
            <Box component="dl" sx={{ m: 0 }}>
              {rows.map(([label, value]) => (
                <Box
                  key={label}
                  sx={{ py: 3, borderBottom: 1, borderColor: "divider" }}
                >
                  <Typography
                    component="dt"
                    variant="caption"
                    color="text.secondary"
                  >
                    {label}
                  </Typography>
                  <Typography
                    component="dd"
                    variant="body2"
                    sx={{
                      m: 0,
                      mt: 1,
                      overflowWrap: "anywhere",
                      fontFamily:
                        label.includes("digest") ||
                        label.includes("revision") ||
                        label.includes("SHA") ||
                        label.includes("ID")
                          ? tokens.typography.fontFamily.mono
                          : undefined,
                    }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
