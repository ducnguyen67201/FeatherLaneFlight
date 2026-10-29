import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import type { RunnerSummary } from "@featherlane/contracts";
import { StatusBadge } from "../../components/StatusBadge";
import { capacity, connection } from "../../design/statusPresentation";

export function RunnerDetails({
  runner,
  onClose,
  onRevoke,
  pending,
}: {
  runner: RunnerSummary;
  onClose: () => void;
  onRevoke: () => Promise<void>;
  pending: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(false);
  async function revoke() {
    setError(false);
    try {
      await onRevoke();
      setConfirm(false);
    } catch {
      setError(true);
    }
  }
  return (
    <>
      <Dialog
        open
        onClose={() => {
          if (!pending) onClose();
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="machine-title"
      >
        <DialogTitle id="machine-title">{runner.displayName}</DialogTitle>
        <DialogContent>
          <Stack spacing={4}>
            <Stack direction="row" spacing={3}>
              <StatusBadge value={connection[runner.connectionState]} />
              <StatusBadge value={capacity[runner.capacityState]} />
            </Stack>
            <Typography variant="body2">
              {runner.localProfiles.length} local profiles ·{" "}
              {runner.availableBuilds.length} declared builds
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {runner.hostPlatform} · Protocol {runner.protocolVersion} ·
              contract {runner.contractVersion}. Declared inputs are not
              verified capabilities.
            </Typography>
            <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
              Runner {runner.id}
            </Typography>
            <Typography variant="body2">
              Credential expires{" "}
              {new Date(runner.credentialExpiresAt).toLocaleString()}.
            </Typography>
            {runner.diagnostics.map((item) => (
              <Typography
                key={item.code}
                variant="body2"
                color="text.secondary"
              >
                {item.code === "NOT_CONFIGURED"
                  ? "Simulation execution is not configured."
                  : item.code === "LOCAL_CLEANUP_REQUIRED"
                    ? "Local cleanup is required."
                    : item.code === "LOCALLY_DISABLED"
                      ? "The machine is locally disabled."
                      : "Local input metadata declared; qualification is separate."}
              </Typography>
            ))}
            {runner.revokedAt ? (
              <Alert severity="warning">
                Machine access revoked. Re-enroll locally with a new grant to
                reconnect.
              </Alert>
            ) : (
              <Button
                variant="outlined"
                color="error"
                disabled={pending || runner.capacityState === "BUSY"}
                onClick={() => setConfirm(true)}
              >
                Revoke machine access
              </Button>
            )}
            {runner.capacityState === "BUSY" && (
              <Typography variant="body2">
                Access changes require an idle machine.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={pending} onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirm}
        onClose={() => {
          if (!pending) setConfirm(false);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="revoke-title"
      >
        <DialogTitle id="revoke-title">Revoke machine access?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {runner.displayName} will no longer authenticate or report health.
            Reconnecting requires a new enrollment grant.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 4 }}>
              Revocation unconfirmed. Refresh the machine state or retry; access
              is not shown as revoked until acknowledged.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={pending} onClick={() => setConfirm(false)}>
            Keep access
          </Button>
          <Button
            disabled={pending}
            variant="contained"
            color="error"
            onClick={() => void revoke()}
          >
            {pending ? "Revoking…" : "Revoke access"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
