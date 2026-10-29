import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@mui/material";
import {
  SessionController,
  type AuthenticatedSession,
} from "./sessionController";
import { SignInPage } from "./SignInPage";
import { SignOutPage } from "./SignOutPage";

export type AuthenticatedWorkspaceProps = Omit<
  AuthenticatedSession,
  "queryClient"
> & {
  cacheScope: readonly ["auth", number, string];
  onSignOut: () => Promise<void>;
  onSessionExpired: () => void;
};

export function AuthBoundary({
  children,
}: {
  children: (props: AuthenticatedWorkspaceProps) => ReactNode;
}) {
  const [controller] = useState(
    () =>
      new SessionController(window.location.origin, (url) =>
        window.location.assign(url),
      ),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    if (
      [
        "sign-in",
        "session-expired",
        "sign-in-error",
        "connection-error",
      ].includes(state.state) &&
      window.location.pathname !== "/sign-in"
    ) {
      window.history.replaceState(null, "", "/sign-in");
    }
  }, [state.state]);
  useEffect(() => {
    void controller.checkSession();
    const recheck = () => {
      const current = controller.getSnapshot().state;
      if (
        document.visibilityState === "visible" &&
        (current === "authenticated" || current === "opening-google")
      ) {
        void controller.checkSession();
      }
    };
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [controller]);

  if (state.state === "authenticated") {
    return (
      <QueryClientProvider client={state.queryClient} key={state.authEpoch}>
        {children({
          session: state.session,
          authEpoch: state.authEpoch,
          cacheScope: ["auth", state.authEpoch, state.session.user.id],
          client: state.client,
          onSignOut: () => controller.signOut(state.authEpoch),
          onSessionExpired: () => controller.expireSession(state.authEpoch),
        })}
      </QueryClientProvider>
    );
  }
  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {state.state === "sign-out-error" ? (
        <SignOutPage
          state="error"
          user={state.session.user}
          onRetry={() => {
            void controller.signOut();
          }}
        />
      ) : state.state === "signing-out" ? (
        <SignOutPage state="pending" />
      ) : (
        <SignInPage
          state={state.state}
          onSignIn={controller.signIn}
          onRetrySession={() => {
            void controller.checkSession();
          }}
        />
      )}
    </Box>
  );
}
