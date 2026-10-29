import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import { ApiError, type ArtifactView } from "@featherlane/contracts";
import { tokens } from "../../design/theme";
import { EvidenceMetadataDialog } from "./EvidenceMetadataDialog";

type Props = {
  artifacts: ArtifactView[];
  trialId: string | undefined;
  attemptId: string | undefined;
  pending: boolean;
  error: Error | null;
  refreshing: boolean;
  onRetry: () => void;
  onDownload?: (artifact: ArtifactView) => Promise<void>;
};

const sizes = (value: number | null) =>
  value === null
    ? "Size unavailable"
    : value < 1024
      ? `${value} bytes`
      : value >= 1024 * 1024
        ? `${(value / (1024 * 1024)).toFixed(1)} MiB`
        : `${(value / 1024).toFixed(1)} KiB`;

function availability(artifact: ArtifactView) {
  if (artifact.availability === "LOCAL_ONLY")
    return "Local only · Not verified";
  if (
    artifact.verificationState === "VERIFIED" &&
    artifact.expiresAt !== null &&
    Date.parse(artifact.expiresAt) <= Date.now()
  )
    return "Expired · Verified";
  if (artifact.verificationState === "PENDING")
    return "Upload pending · Not verified";
  if (artifact.verificationState === "FAILED") return "Verification failed";
  const labels: Record<ArtifactView["availability"], string> = {
    AVAILABLE: "Available",
    MISSING: "Missing",
    EXPIRED: "Expired",
    NOT_COLLECTED: "Not collected",
    LOCAL_ONLY: "Local only",
  };
  return `${labels[artifact.availability]} · ${artifact.verificationState === "VERIFIED" ? "Verified" : "Not verified"}`;
}

function ready(artifact: ArtifactView) {
  return (
    artifact.verificationState === "VERIFIED" &&
    artifact.availability === "AVAILABLE" &&
    artifact.expiresAt !== null &&
    Date.parse(artifact.expiresAt) > Date.now()
  );
}

export function RunEvidencePanel(props: Props) {
  if (
    props.error instanceof ApiError &&
    [401, 403, 404].includes(props.error.status)
  )
    return (
      <Alert
        severity="warning"
        action={<Button onClick={props.onRetry}>Retry</Button>}
      >
        Evidence access could not be confirmed. Recorded files are hidden.
      </Alert>
    );
  if (props.pending)
    return (
      <Paper sx={{ p: 5 }} role="status" aria-label="Loading evidence metadata">
        <Typography>Loading recorded evidence…</Typography>
        <Skeleton height={tokens.component.minTouchTargetPx} />
        <Skeleton height={tokens.layoutPx.trace.viewportHeight / 2} />
      </Paper>
    );
  return <EvidenceContent {...props} />;
}

function EvidenceContent(props: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const busy = useRef(false);
  const shown = props.artifacts.filter(
    (item) =>
      item.attemptId === props.attemptId &&
      (item.trialId === null || item.trialId === props.trialId),
  );
  const selected = shown.find((item) => item.id === selectedId);
  const canDownload = (artifact: ArtifactView) =>
    !!props.onDownload &&
    !props.error &&
    !props.refreshing &&
    !downloadingId &&
    ready(artifact);

  async function download(artifact: ArtifactView) {
    if (busy.current || !canDownload(artifact) || !props.onDownload) return;
    busy.current = true;
    setDownloadingId(artifact.id);
    setDownloadError(null);
    try {
      await props.onDownload(artifact);
    } catch {
      setDownloadError(
        "The file could not be downloaded. Refresh evidence availability and retry.",
      );
    } finally {
      busy.current = false;
      setDownloadingId(null);
    }
  }

  const downloadButton = (artifact: ArtifactView) => (
    <Button
      variant={ready(artifact) ? "contained" : "outlined"}
      disabled={!canDownload(artifact)}
      startIcon={
        downloadingId === artifact.id ? (
          <CircularProgress
            size={tokens.typography.variant.caption.fontSizePx}
          />
        ) : (
          <DownloadOutlined />
        )
      }
      onClick={() => void download(artifact)}
      aria-label={`Download ${artifact.displayName}`}
    >
      {downloadingId === artifact.id ? "Downloading…" : "Download"}
    </Button>
  );

  return (
    <Paper sx={{ p: 5, minWidth: 0 }}>
      <Typography component="h2" variant="h2">
        Private evidence
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 4 }}>
        Recorded files for this attempt. Only verified, available files can be
        downloaded.
      </Typography>
      {props.error && (
        <Alert
          severity="error"
          sx={{ mb: 4 }}
          action={<Button onClick={props.onRetry}>Retry</Button>}
        >
          Evidence could not be refreshed. Previous metadata remains visible;
          downloads are paused.
        </Alert>
      )}
      {downloadError && (
        <Alert
          severity="error"
          sx={{ mb: 4 }}
          action={<Button onClick={props.onRetry}>Refresh evidence</Button>}
        >
          {downloadError}
        </Alert>
      )}
      {props.refreshing && (
        <Typography role="status" variant="caption">
          Refreshing evidence metadata…
        </Typography>
      )}
      {!shown.length ? (
        <Alert severity="info">
          No evidence is recorded for the selected attempt and trial.
        </Alert>
      ) : (
        <Stack spacing={4}>
          {shown.map((artifact) => (
            <Stack
              key={artifact.id}
              direction={{ xs: "column", sm: "row" }}
              sx={{
                alignItems: { sm: "center" },
                justifyContent: "space-between",
                gap: 3,
                borderBottom: 1,
                borderColor: "divider",
                pb: 4,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body1" sx={{ overflowWrap: "anywhere" }}>
                  {artifact.displayName}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  {sizes(artifact.byteLength)} · {availability(artifact)}
                </Typography>
              </Box>
              <Stack
                direction="row"
                sx={{ gap: 2, flexShrink: 0, flexWrap: "wrap" }}
              >
                <Button
                  variant="outlined"
                  startIcon={<DescriptionOutlined />}
                  onClick={() => setSelectedId(artifact.id)}
                  aria-label={`Metadata for ${artifact.displayName}`}
                >
                  Metadata
                </Button>
                {downloadButton(artifact)}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
      <EvidenceMetadataDialog
        artifact={selected}
        availabilityLabel={selected ? availability(selected) : ""}
        sizeLabel={selected ? sizes(selected.byteLength) : "Size unavailable"}
        contentAvailable={!!selected && ready(selected)}
        error={downloadError}
        onClose={() => setSelectedId(null)}
        downloadAction={selected ? downloadButton(selected) : null}
      />
    </Paper>
  );
}
