import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import type { ArtifactView } from "@featherlane/contracts";
import { tokens } from "../../design/theme";

const sizes = (value: number | null) =>
  value === null
    ? "Size unavailable"
    : value >= 1024 * 1024
      ? `${(value / (1024 * 1024)).toFixed(1)} MiB`
      : `${(value / 1024).toFixed(1)} KiB`;
export function RunEvidencePanel({
  artifacts,
  trialId,
  attemptId,
  pending,
  error,
  refreshing,
  onRetry,
}: {
  artifacts: ArtifactView[];
  trialId: string | undefined;
  attemptId: string | undefined;
  pending: boolean;
  error: Error | null;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const shown = artifacts.filter(
    (item) =>
      item.attemptId === attemptId &&
      (item.trialId === null || item.trialId === trialId),
  );
  const selected = shown.find((item) => item.id === selectedId);
  const expired = shown.some((item) => item.availability === "EXPIRED");
  const missing = shown.some((item) => item.availability === "MISSING");
  return (
    <Paper sx={{ p: 5, minWidth: 0 }}>
      <Typography component="h2" variant="h2">
        Evidence and artifacts
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ my: 3 }}>
        {trialId ? `${trialId} · ` : ""}Private synthetic metadata · no
        connected downloads
      </Typography>
      {pending ? (
        <Box role="status" aria-label="Loading evidence metadata">
          <Skeleton height={44} />
          <Skeleton height={120} />
        </Box>
      ) : (
        <>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 4 }}
              action={<Button onClick={onRetry}>Retry</Button>}
            >
              Evidence metadata could not be refreshed. {error.message}
            </Alert>
          )}
          {refreshing && (
            <Typography role="status" variant="caption">
              Refreshing evidence metadata…
            </Typography>
          )}
          <Alert
            severity={missing || expired ? "warning" : "info"}
            sx={{ mb: 4 }}
          >
            {expired
              ? "Raw evidence expired. Historical summaries remain; inspection is descriptive only."
              : missing
                ? "Required evidence is missing or unverified. References alone cannot establish a passing observation."
                : "Metadata only. No upload, content stream or signed download is connected."}
          </Alert>
          {shown.length === 0 ? (
            <Typography color="text.secondary">
              No evidence is recorded for the selected trial in this snapshot.
            </Typography>
          ) : (
            <Stack spacing={3}>
              {shown.map((artifact) => (
                <Box
                  key={artifact.id}
                  sx={{ borderBottom: 1, borderColor: "divider", pb: 3 }}
                >
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 3,
                      justifyContent: "space-between",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="body1"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {artifact.displayName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {artifact.kind} · {sizes(artifact.byteLength)}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      startIcon={<DescriptionOutlined />}
                      onClick={() => setSelectedId(artifact.id)}
                    >
                      Metadata
                    </Button>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {artifact.availability} · {artifact.verificationState}
                    {artifact.expiresAt
                      ? ` · retention ${artifact.expiresAt}`
                      : " · retention unavailable"}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </>
      )}
      <Dialog
        open={!!selected}
        onClose={() => setSelectedId(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Evidence metadata</DialogTitle>
        <DialogContent>
          {selected && (
            <>
              <Typography sx={{ mb: 3 }}>{selected.displayName}</Typography>
              <Typography variant="body2">
                {selected.mediaType} · {sizes(selected.byteLength)}
              </Typography>
              <Typography
                variant="body2"
                sx={{ my: 3, overflowWrap: "anywhere" }}
              >
                Scope: {selected.attemptId} /{" "}
                {selected.trialId ?? "attempt-wide"} · {selected.id}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  overflowWrap: "anywhere",
                  fontFamily: tokens.typography.fontFamily.mono,
                }}
              >
                {selected.sha256
                  ? `sha256:${selected.sha256}`
                  : "Digest unavailable"}
              </Typography>
              <Typography variant="body2" sx={{ my: 3 }}>
                Availability: {selected.availability} · verification:{" "}
                {selected.verificationState}
              </Typography>
              <Typography variant="body2" sx={{ my: 3 }}>
                Creation: {selected.createdAt ?? "unavailable"} · retention:{" "}
                {selected.expiresAt ?? "unavailable"}
              </Typography>
              <Alert severity="info">
                Metadata remains inspectable when content is missing or expired.
                Synthetic files cannot be downloaded. Process-log metadata
                refers to redacted output.
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedId(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
