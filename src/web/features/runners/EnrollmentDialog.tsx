import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopy from "@mui/icons-material/ContentCopy";
import type { EnrollmentGrant } from "@featherlane/contracts";
import { useEnrollmentGrant } from "./useEnrollmentGrant";

type Props = {
  projectName: string;
  onClose: () => void;
  onCreate: (name: string, key: string) => Promise<EnrollmentGrant>;
};
export function EnrollmentDialog({ projectName, onClose, onCreate }: Props) {
  const {
    name,
    changeName,
    grant,
    state,
    copied,
    copyFailed,
    expired,
    create,
    copy,
    close: closeGrant,
  } = useEnrollmentGrant(onCreate);
  const close = () => closeGrant(onClose);
  return (
    <Dialog
      open
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-labelledby="enroll-title"
    >
      <DialogTitle id="enroll-title">Enroll a runner</DialogTitle>
      <DialogContent>
        <Stack spacing={4}>
          <Typography variant="body2" color="text.secondary">
            Optional: connect your own machine to {projectName}.
          </Typography>
          {expired ? (
            <Alert severity="warning">
              <AlertTitle>Grant expired</AlertTitle>Create a new grant to
              continue.
            </Alert>
          ) : grant ? (
            <>
              <Alert severity="success">
                <AlertTitle>Enrollment grant created</AlertTitle>One use ·
                expires {new Date(grant.expiresAt).toLocaleTimeString()}. Copy
                it before closing.
              </Alert>
              <Typography variant="body2">
                1. On the machine with the runner package installed, start
                enrollment:
              </Typography>
              <Paper variant="outlined" sx={{ p: 4 }}>
                <Typography component="code" variant="code">
                  uv run --package featherlane-runner flf-runner enroll
                </Typography>
              </Paper>
              <Typography variant="body2">
                2. Enter this service origin, then paste the grant into the
                private prompt.
              </Typography>
              <Typography variant="code" sx={{ overflowWrap: "anywhere" }}>
                {window.location.origin}
              </Typography>
              <Paper variant="outlined" sx={{ p: 4 }}>
                <Typography
                  component="code"
                  variant="code"
                  sx={{ display: "block", overflowWrap: "anywhere" }}
                >
                  {grant.token}
                </Typography>
                <Button startIcon={<ContentCopy />} onClick={() => void copy()}>
                  Copy grant
                </Button>
                {copied && (
                  <Typography role="status" variant="body2">
                    Grant copied.
                  </Typography>
                )}
                {copyFailed && (
                  <Alert severity="warning">
                    Copy failed. Select and copy the grant above.
                  </Alert>
                )}
              </Paper>
              <Typography variant="body2" color="text.secondary">
                Keep this grant private. It is removed from this view when you
                close. The runner saves its own credential locally.
              </Typography>
            </>
          ) : (
            <>
              {(state === "error" || state === "uncertain") && (
                <Alert severity="error">
                  <AlertTitle>
                    {state === "uncertain"
                      ? "Grant creation unconfirmed"
                      : "Could not create a grant"}
                  </AlertTitle>
                  {state === "uncertain"
                    ? "The response was interrupted. Retry the same request to recover its result."
                    : "The request was rejected. Check your project access and retry."}
                </Alert>
              )}
              <TextField
                label="Machine name"
                value={name}
                onChange={(e) => changeName(e.target.value)}
                disabled={state === "pending" || state === "uncertain"}
                slotProps={{ htmlInput: { maxLength: 128 } }}
              />
              <Paper variant="outlined" sx={{ p: 4 }}>
                <Typography variant="body2">{projectName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  One runner · one project · valid for 10 minutes
                </Typography>
              </Paper>
              <Typography variant="body2">
                Create a one-use grant, then paste it into the runner’s private
                enrollment prompt on your machine.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enrollment connects the runner and reports its health.
                Simulation execution is not available yet.
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={state === "pending"}>
          {grant ? "Done" : "Cancel"}
        </Button>
        {(!grant || expired) && (
          <Button
            variant="contained"
            disabled={state === "pending" || !name.trim()}
            onClick={() => void create()}
          >
            {state === "pending"
              ? "Creating grant…"
              : state === "uncertain"
                ? "Retry same request"
                : expired
                  ? "Create new grant"
                  : "Create grant"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
