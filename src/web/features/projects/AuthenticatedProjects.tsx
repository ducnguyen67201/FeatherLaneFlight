import { useEffect, useState, type ReactNode } from "react";
import { Alert } from "@mui/material";
import { ProjectsWorkspace, type SettingsSection } from "./ProjectsWorkspace";
import { useProjectAccess, type ProjectAccessProps } from "./useProjectAccess";
import { peoplePath } from "../people/navigation";
import { RegistrationCatalog } from "../registration/RegistrationCatalog";

type AuthenticatedProjectsProps = ProjectAccessProps & { userMenu: ReactNode };

// P06.5 mounts this inside its identity-owned QueryClientProvider, keyed by epoch.
// Session transport, login/logout, and global identity/cache policy stay there.
export function AuthenticatedProjects({
  userMenu,
  ...props
}: AuthenticatedProjectsProps) {
  const access = useProjectAccess(props);
  const [section, setSection] = useState<SettingsSection>(() =>
    window.location.pathname === "/settings/builds"
      ? "registrations"
      : "projects",
  );
  useEffect(() => {
    const changed = () =>
      setSection(
        window.location.pathname === "/settings/builds"
          ? "registrations"
          : "projects",
      );
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  function chooseSection(next: SettingsSection) {
    if (next === section) return;
    window.history.pushState(
      null,
      "",
      next === "registrations" ? "/settings/builds" : "/settings",
    );
    setSection(next);
  }
  return (
    <ProjectsWorkspace
      organizations={access.organizations}
      projects={access.projects}
      organizationId={access.organizationId}
      projectId={access.projectId}
      state={access.state}
      canCreate={access.canCreateProject}
      peopleHref={
        access.organizationId ? peoplePath(access.organizationId) : undefined
      }
      userMenu={userMenu}
      section={section}
      onSectionChange={chooseSection}
      registrationCatalog={
        access.state === "ready" && access.projectId ? (
          <RegistrationCatalog
            key={`${props.userId}:${access.organizationId}:${access.projectId}`}
            projectId={access.projectId}
            client={props.client}
            cacheScope={props.cacheScope}
            onAccessFailure={props.onAccessFailure}
          />
        ) : (
          <Alert severity="info">
            Select an accessible project to inspect its registrations.
          </Alert>
        )
      }
      onOrganizationChange={access.chooseOrganization}
      onProjectChange={access.chooseProject}
      onCreate={access.submit}
      onRetry={access.retry}
      moreOrganizations={access.moreOrganizations}
      moreProjects={access.moreProjects}
      loadingMoreOrganizations={access.loadingMoreOrganizations}
      loadingMoreProjects={access.loadingMoreProjects}
    />
  );
}
