import { useEffect, useState } from "react";
import {
  Alert,
  AlertTitle,
  Button,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import Sync from "@mui/icons-material/Sync";
import WarningAmber from "@mui/icons-material/WarningAmber";
import ErrorOutlined from "@mui/icons-material/ErrorOutlined";
import { ContractValidationError } from "@featherlane/contracts";
import type { LiveConnection } from "./useRunLiveUpdates";

export function RunLiveStatus({
  connection,
  snapshotAt,
  validatedAt,
  error,
  refreshing,
  onRetry,
}: {
  connection: LiveConnection;
  snapshotAt: string;
  validatedAt: number;
  error: Error | null;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const invalid =
    connection === "invalid" || error instanceof ContractValidationError;
  const stale = !!error || now - validatedAt > 30_000;
  const recovering = connection === "recovering";
  const disconnected = ["reconnecting", "paused", "connecting"].includes(
    connection,
  );
  const warning = stale || disconnected || recovering;
  const Icon = invalid
    ? ErrorOutlined
    : recovering || disconnected
      ? Sync
      : stale
        ? WarningAmber
        : CheckCircleOutlined;
  const message = invalid
    ? "Live updates paused · invalid stream or snapshot"
    : stale
      ? "Snapshot stale · refresh needed"
      : recovering
        ? "Refreshing snapshot · event cursor changed"
        : connection === "connecting"
          ? "Connecting live updates · last snapshot shown"
          : connection === "reconnecting"
            ? "Reconnecting · last snapshot shown"
            : connection === "paused"
              ? "Live updates paused · snapshot polling continues"
              : connection === "snapshot"
                ? "Terminal server snapshot · live stream closed"
                : "Live updates connected";
  return (
    <Paper sx={{ p: 4 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          gap: 3,
          justifyContent: "space-between",
          alignItems: { sm: "center" },
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center" }}
          role="status"
          aria-atomic="true"
        >
          <Icon
            color={invalid ? "error" : warning ? "warning" : "success"}
            fontSize="small"
          />
          <Typography variant="body2">{message}</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Last valid snapshot · {snapshotAt.replace("T", " ").replace("Z", "")}{" "}
          UTC
        </Typography>
      </Stack>
      {(invalid || warning) && (
        <Alert
          role="region"
          aria-label="Live update recovery"
          severity={invalid ? "error" : "warning"}
          sx={{
            mt: 4,
            flexWrap: { xs: "wrap", sm: "nowrap" },
            "& .MuiAlert-message": { minWidth: 0, flex: 1 },
            "& .MuiAlert-action": {
              flexBasis: { xs: "100%", sm: "auto" },
              pl: { xs: 0, sm: 2 },
              mr: 0,
              pt: { xs: 2, sm: 0 },
              justifyContent: "flex-start",
            },
          }}
          action={
            <Button disabled={refreshing} onClick={onRetry}>
              {invalid ? "Refresh snapshot" : "Retry now"}
            </Button>
          }
        >
          <AlertTitle>
            {invalid
              ? "Stream message or snapshot could not be validated"
              : recovering
                ? "Recovering from a fresh server snapshot"
                : stale
                  ? "The displayed snapshot may be out of date"
                  : "Connection interrupted"}
          </AlertTitle>
          {invalid
            ? "Updates are paused. Refresh to check compatibility and load a validated snapshot. No invalid values were applied."
            : recovering
              ? "Loading a consistent snapshot before resuming live updates."
              : "Execution and evaluation show the last validated snapshot. Bounded polling will keep trying after transient failures; disconnection does not confirm a stop or result."}
        </Alert>
      )}
    </Paper>
  );
}
