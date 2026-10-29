import { useEffect } from "react";
import {
  AuthBoundary,
  type AuthenticatedWorkspaceProps,
} from "../features/auth/AuthBoundary";
import { AccountControl } from "../features/auth/AccountControl";
import { AuthenticatedProjects } from "../features/projects/AuthenticatedProjects";
import { AuthenticatedPeople } from "../features/people/AuthenticatedPeople";
import { AuthenticatedRunners } from "../features/runners/AuthenticatedRunners";
import { peopleOrganization } from "../features/people/navigation";

type WorkspaceProps = Omit<AuthenticatedWorkspaceProps, "authEpoch">;

function Workspace({
  session,
  client,
  cacheScope,
  onSignOut,
  onSessionExpired,
}: WorkspaceProps) {
  const organizationId = peopleOrganization(window.location.pathname);
  useEffect(() => {
    // Live Settings/people routes share auth; run workflows remain in the explicit demo.
    if (
      !organizationId &&
      !["/settings", "/runners"].includes(window.location.pathname)
    )
      window.history.replaceState(null, "", "/settings");
  }, [organizationId]);
  const userMenu = <AccountControl user={session.user} onSignOut={onSignOut} />;
  const onAccessFailure = (status: 401 | 403 | 404) => {
    if (status === 401) onSessionExpired();
  };
  if (window.location.pathname === "/runners")
    return (
      <AuthenticatedRunners
        userId={session.user.id}
        csrfToken={session.csrfToken}
        client={client}
        cacheScope={cacheScope}
        userMenu={userMenu}
        onAccessFailure={onAccessFailure}
      />
    );
  if (organizationId)
    return (
      <AuthenticatedPeople
        key={organizationId}
        userId={session.user.id}
        organizationId={organizationId}
        csrfToken={session.csrfToken}
        client={client}
        cacheScope={cacheScope}
        userMenu={userMenu}
        onAccessFailure={onAccessFailure}
      />
    );
  return (
    <AuthenticatedProjects
      userId={session.user.id}
      csrfToken={session.csrfToken}
      client={client}
      cacheScope={cacheScope}
      userMenu={userMenu}
      onAccessFailure={onAccessFailure}
    />
  );
}

export function AuthenticatedApp() {
  return (
    <AuthBoundary>
      {({ session, client, cacheScope, onSignOut, onSessionExpired }) => (
        <Workspace
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
