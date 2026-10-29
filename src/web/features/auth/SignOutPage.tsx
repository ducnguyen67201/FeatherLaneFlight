import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import type { SessionUser } from "@featherlane/contracts";
import { AuthPageLayout } from "./AuthPageLayout";

type SignOutPageProps =
  | { state: "pending" }
  | { state: "error"; user: SessionUser; onRetry: () => void };

export function SignOutPage(props: SignOutPageProps) {
  const pending = props.state === "pending";
  return (
    <AuthPageLayout
      title={pending ? "Signing out" : "Confirm sign-out"}
      description={
        pending
          ? "Your project data is hidden while we end your session."
          : "Project data is hidden while we confirm your session has ended."
      }
    >
      {props.state === "pending" ? (
        <Stack
          direction="row"
          spacing={3}
          sx={{ alignItems: "center" }}
          role="status"
        >
          <CircularProgress size={20} aria-label="Signing out" />
          <Typography variant="body2" color="text.secondary">
            Signing out…
          </Typography>
        </Stack>
      ) : (
        <>
          <Alert severity="error">
            Sign-out could not be confirmed. Your workspace is locked. Retry
            sign-out before leaving a shared device.
          </Alert>
          <Box
            sx={{ p: 4, border: 1, borderColor: "divider", borderRadius: 1 }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
            >
              {props.user.displayName}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ overflowWrap: "anywhere" }}
            >
              {props.user.email}
            </Typography>
          </Box>
          <Button
            autoFocus
            variant="contained"
            startIcon={<LogoutOutlined />}
            onClick={props.onRetry}
          >
            Retry sign-out
          </Button>
        </>
      )}
      <Divider />
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <LockOutlined fontSize="small" color="disabled" />
        <Typography variant="caption" color="text.secondary">
          {pending
            ? "Please wait while sign-out is confirmed."
            : "Keep this page open and retry before leaving a shared device."}
        </Typography>
      </Stack>
    </AuthPageLayout>
  );
}
