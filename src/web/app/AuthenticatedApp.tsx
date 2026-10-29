import { useEffect } from "react";
import {
  AuthBoundary,
  type AuthenticatedWorkspaceProps,
} from "../features/auth/AuthBoundary";
import { AccountControl } from "../features/auth/AccountControl";
import { AuthenticatedProjects } from "../features/projects/AuthenticatedProjects";
import { AuthenticatedPeople } from "../features/people/AuthenticatedPeople";
import { AuthenticatedRunners } from "../features/runners/AuthenticatedRunners";
import { AuthenticatedSuites } from "../features/suites/AuthenticatedSuites";
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
  const suitesRoute = /^\/suites(?:\/[A-Za-z0-9_-]+)?\/?$/.test(
    window.location.pathname,
  );
  useEffect(() => {
    // Live Settings, People, Runners and Suites share authentication.
    if (
      !organizationId &&
      !suitesRoute &&
      !["/settings", "/settings/builds", "/runners"].includes(
        window.location.pathname,
      )
    )
      window.history.replaceState(null, "", "/settings");
  }, [organizationId, suitesRoute]);
  const userMenu = <AccountControl user={session.user} onSignOut={onSignOut} />;
  const onAccessFailure = (status: 401 | 403 | 404) => {
    if (status === 401) onSessionExpired();
  };
  if (suitesRoute)
    return (
      <AuthenticatedSuites
        userId={session.user.id}
        csrfToken={session.csrfToken}
        client={client}
        cacheScope={cacheScope}
        userMenu={userMenu}
        onAccessFailure={onAccessFailure}
      />
    );
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
