import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";

export type AccessRequiredPanelProps = {
  displayName: string;
  email: string;
  signOutFailed: boolean;
  accessUnchanged: boolean;
  onCheckAccess: () => void;
  onSignOut: () => void;
};

export function AccessRequiredPanel({
  displayName,
  email,
  signOutFailed,
  accessUnchanged,
  onCheckAccess,
  onSignOut,
}: AccessRequiredPanelProps) {
  return (
    <>
      {signOutFailed && (
        <Alert severity="error">
          Sign-out could not be confirmed. Your workspace is locked. Retry
          sign-out before leaving a shared device.
        </Alert>
      )}
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 4 }}>
        <Stack direction="row" spacing={3} sx={{ alignItems: "flex-start" }}>
          <VerifiedUserOutlined sx={{ color: "text.secondary", mt: 1 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
            >
              {displayName}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ overflowWrap: "anywhere" }}
            >
              {email}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Signed in with Google
            </Typography>
          </Box>
        </Stack>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Ask your organization owner to add this account. Signing in does not
        create an organization or grant project access.
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
        {signOutFailed ? (
          <Button
            variant="contained"
            startIcon={<LogoutOutlined />}
            onClick={onSignOut}
          >
            Retry sign-out
          </Button>
        ) : (
          <>
            <Button variant="contained" onClick={onCheckAccess}>
              Check access again
            </Button>
            <Button
              variant="outlined"
              startIcon={<LogoutOutlined />}
              onClick={onSignOut}
            >
              Sign out
            </Button>
          </>
        )}
      </Stack>
      {accessUnchanged && !signOutFailed && (
        <Alert severity="info" role="status">
          No organization access yet. Check with your owner, then try again.
        </Alert>
      )}
    </>
  );
}
