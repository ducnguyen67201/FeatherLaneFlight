import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import type { ArtifactView } from "@featherlane/contracts";
import { tokens } from "../../design/theme";

export function EvidenceMetadataDialog({
  artifact,
  availabilityLabel,
  sizeLabel,
  contentAvailable,
  error,
  onClose,
  downloadAction,
}: {
  artifact: ArtifactView | undefined;
  availabilityLabel: string;
  sizeLabel: string;
  contentAvailable: boolean;
  error: string | null;
  onClose: () => void;
  downloadAction: ReactNode;
}) {
  return (
    <Dialog
      open={!!artifact}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-describedby="evidence-metadata-description"
    >
      <DialogTitle>Evidence metadata</DialogTitle>
      <DialogContent>
        {artifact && (
          <Stack spacing={4}>
            <Typography id="evidence-metadata-description">
              {artifact.displayName}
            </Typography>
            <Box>
              <Chip variant="outlined" label={availabilityLabel} />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                FORMAT AND SIZE
              </Typography>
              <Typography>
                {artifact.mediaType} · {sizeLabel}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                SCOPE
              </Typography>
              <Typography sx={{ overflowWrap: "anywhere" }}>
                {artifact.attemptId} / {artifact.trialId ?? "attempt-wide"}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ overflowWrap: "anywhere" }}
              >
                {artifact.id}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                SHA-256
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: tokens.typography.fontFamily.mono,
                  overflowWrap: "anywhere",
                  userSelect: "text",
                }}
              >
                {artifact.sha256 ?? "Digest unavailable"}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                CREATED
              </Typography>
              <Typography variant="body2">
                {artifact.createdAt ?? "Not recorded"}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                RETENTION
              </Typography>
              <Typography variant="body2">
                {artifact.expiresAt ?? "No cloud content retained"}
              </Typography>
            </Box>
            {!contentAvailable && (
              <Alert severity="info">
                Metadata remains available. This file cannot currently be
                downloaded.
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {downloadAction}
      </DialogActions>
    </Dialog>
  );
}
