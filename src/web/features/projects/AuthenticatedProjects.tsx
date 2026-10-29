import type { ReactNode } from "react";
import { ProjectsWorkspace } from "./ProjectsWorkspace";
import { useProjectAccess, type ProjectAccessProps } from "./useProjectAccess";

type AuthenticatedProjectsProps = ProjectAccessProps & { userMenu: ReactNode };

// P06.5 mounts this inside its identity-owned QueryClientProvider, keyed by epoch.
// Session transport, login/logout, and global identity/cache policy stay there.
export function AuthenticatedProjects({
  userMenu,
  ...props
}: AuthenticatedProjectsProps) {
  const access = useProjectAccess(props);
  return (
    <ProjectsWorkspace
      organizations={access.organizations}
      projects={access.projects}
      organizationId={access.organizationId}
      projectId={access.projectId}
      state={access.state}
      userMenu={userMenu}
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
