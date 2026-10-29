import { useEffect } from "react";
import {
  AuthBoundary,
  type AuthenticatedWorkspaceProps,
} from "../features/auth/AuthBoundary";
import { AccountControl } from "../features/auth/AccountControl";
import { AuthenticatedProjects } from "../features/projects/AuthenticatedProjects";

type ProjectWorkspaceProps = Omit<AuthenticatedWorkspaceProps, "authEpoch">;

function ProjectWorkspace({
  session,
  client,
  cacheScope,
  onSignOut,
  onSessionExpired,
}: ProjectWorkspaceProps) {
  useEffect(() => {
    // Settings is the current live feature. Run workflows still belong to the explicit demo.
    if (window.location.pathname !== "/settings")
      window.history.replaceState(null, "", "/settings");
  }, []);
  return (
    <AuthenticatedProjects
      userId={session.user.id}
      csrfToken={session.csrfToken}
      client={client}
      cacheScope={cacheScope}
      userMenu={<AccountControl user={session.user} onSignOut={onSignOut} />}
      onAccessFailure={(status) => {
        if (status === 401) onSessionExpired();
      }}
    />
  );
}

export function AuthenticatedApp() {
  return (
    <AuthBoundary>
      {({ session, client, cacheScope, onSignOut, onSessionExpired }) => (
        <ProjectWorkspace
          session={session}
          client={client}
          cacheScope={cacheScope}
          onSignOut={onSignOut}
          onSessionExpired={onSessionExpired}
        />
      )}
    </AuthBoundary>
  );
}
