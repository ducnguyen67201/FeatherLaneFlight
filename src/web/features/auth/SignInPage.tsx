import {
  Alert,
  Button,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import Google from "@mui/icons-material/Google";
import { AuthPageLayout } from "./AuthPageLayout";
import { AccessRequiredPanel } from "./AccessRequiredPanel";

type SignedOutState =
  | "sign-in"
  | "checking-session"
  | "opening-google"
  | "session-expired"
  | "sign-in-error"
  | "connection-error";
type AccessState = "access-required" | "sign-out-error";

export type SignInState = SignedOutState | AccessState;

export type SignInPageProps =
  | {
      state: SignedOutState;
      onSignIn: () => void;
      onRetrySession: () => void;
    }
  | {
      state: AccessState;
      displayName: string;
      email: string;
      accessUnchanged: boolean;
      onCheckAccess: () => void;
      onSignOut: () => void;
    };

const copy: Record<SignInState, { title: string; description: string }> = {
  "sign-in": {
    title: "Sign in to FeatherLaneFlight",
    description:
      "Review simulation runs, inspect evidence, and compare flight software builds in your team’s projects.",
  },
  "checking-session": {
    title: "Checking your session",
    description: "Your workspace will open after your session is confirmed.",
  },
  "opening-google": {
    title: "Continue in Google",
    description: "Complete sign-in in Google, then return to your workspace.",
  },
  "access-required": {
    title: "Organization access required",
    description:
      "You’re signed in. An organization owner needs to grant you access before you can open a project.",
  },
  "session-expired": {
    title: "Sign in to FeatherLaneFlight",
    description:
      "Review simulation runs, inspect evidence, and compare flight software builds in your team’s projects.",
  },
  "sign-in-error": {
    title: "Sign in to FeatherLaneFlight",
    description:
      "Review simulation runs, inspect evidence, and compare flight software builds in your team’s projects.",
  },
  "connection-error": {
    title: "Sign in to FeatherLaneFlight",
    description:
      "Review simulation runs, inspect evidence, and compare flight software builds in your team’s projects.",
  },
  "sign-out-error": {
    title: "Confirm sign-out",
    description:
      "Project data is hidden while we confirm your session has ended.",
  },
};

// Presentation only: the session controller owns transitions and all network effects.
export function SignInPage(props: SignInPageProps) {
  const { state } = props;
  const checking = state === "checking-session";
  const pending = checking || state === "opening-google";
  const access =
    props.state === "access-required" || props.state === "sign-out-error";

  return (
    <AuthPageLayout
      title={copy[state].title}
      description={copy[state].description}
    >
      {"displayName" in props ? (
        <AccessRequiredPanel
          displayName={props.displayName}
          email={props.email}
          signOutFailed={props.state === "sign-out-error"}
          accessUnchanged={props.accessUnchanged}
          onCheckAccess={props.onCheckAccess}
          onSignOut={props.onSignOut}
        />
      ) : (
        <>
          {state === "session-expired" && (
            <Alert severity="warning">
              Your session has expired. Sign in again to continue.
            </Alert>
          )}
          {state === "sign-in-error" && (
            <Alert severity="error">
              Sign-in could not be completed. Try again, or contact your
              workspace operator if this continues.
            </Alert>
          )}
          {state === "connection-error" && (
            <Alert severity="error">
              We couldn’t check your session. Check your connection and try
              again.
            </Alert>
          )}
          {pending ? (
            <Stack
              direction="row"
              spacing={3}
              sx={{ alignItems: "center" }}
              role="status"
            >
              <CircularProgress
                size={20}
                aria-label={checking ? "Checking session" : "Opening Google"}
              />
              <Typography variant="body2" color="text.secondary">
                {checking ? "Checking session…" : "Opening Google…"}
              </Typography>
            </Stack>
          ) : state === "connection-error" ? (
            <Button variant="contained" onClick={props.onRetrySession}>
              Retry session check
            </Button>
          ) : (
            <>
              <Button
                variant="contained"
                startIcon={<Google />}
                onClick={props.onSignIn}
              >
                Continue with Google
              </Button>
              <Typography variant="body2" color="text.secondary">
                Use the Google account your organization owner has granted
                access to.
              </Typography>
            </>
          )}
        </>
      )}
      <Divider />
      <Typography variant="caption" color="text.secondary">
        {access
          ? "Need to use another account? Sign out, then continue with Google."
          : "Your organization controls access to its projects and simulation evidence."}
      </Typography>
    </AuthPageLayout>
  );
}
