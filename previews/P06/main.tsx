import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import {
  Box,
  CssBaseline,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import { theme, tokens } from "../../src/web/design/theme";
import {
  SignInPage,
  type SignInState,
} from "../../src/web/features/auth/SignInPage";

const states: readonly { value: SignInState; label: string }[] = [
  { value: "sign-in", label: "Sign in" },
  { value: "checking-session", label: "Checking session" },
  { value: "opening-google", label: "Opening Google" },
  { value: "access-required", label: "Access required" },
  { value: "session-expired", label: "Session expired" },
  { value: "sign-in-error", label: "Sign-in error" },
  { value: "connection-error", label: "Connection error" },
  { value: "sign-out-error", label: "Sign-out error" },
];

function Preview() {
  const [state, setState] = useState<SignInState>("sign-in");
  const [accessUnchanged, setAccessUnchanged] = useState(false);
  function changeState(next: SignInState) {
    setState(next);
    setAccessUnchanged(false);
  }
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
      >
        <Box
          component="aside"
          aria-label="Preview controls"
          sx={{
            p: 4,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Stack spacing={3}>
            <Stack
              direction="row"
              spacing={3}
              sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                P06 · Sign-in & access
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Isolated preview · Sample identity · Google is not connected
              </Typography>
            </Stack>
            <ToggleButtonGroup
              value={state}
              exclusive
              onChange={(_, next: SignInState | null) => {
                if (next) changeState(next);
              }}
              aria-label="Preview state"
              sx={{
                flexWrap: "wrap",
                gap: 2,
                "& .MuiToggleButton-root": {
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  minHeight: tokens.component.minTouchTargetPx,
                },
              }}
            >
              {states.map(({ value, label }) => (
                <ToggleButton value={value} key={value}>
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
        </Box>
        {state === "access-required" || state === "sign-out-error" ? (
          <SignInPage
            state={state}
            displayName="Alex Morgan"
            email="alex.morgan@example.com"
            accessUnchanged={accessUnchanged}
            onCheckAccess={() => setAccessUnchanged(true)}
            onSignOut={() => changeState("sign-in")}
          />
        ) : (
          <SignInPage
            state={state}
            onSignIn={() => changeState("opening-google")}
            onRetrySession={() => changeState("checking-session")}
          />
        )}
      </Box>
    </ThemeProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root");
createRoot(root).render(<Preview />);
