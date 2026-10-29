import { useState, type ReactNode } from "react";
import { AppShell } from "../../layouts/AppShell";
import { ProjectSelector } from "../projects/ProjectSelector";
import { PeopleAccessPage } from "./PeopleAccessPage";
import { usePeopleAccess, type PeopleAccessProps } from "./usePeopleAccess";

export function AuthenticatedPeople({
  userMenu,
  ...props
}: PeopleAccessProps & { userMenu: ReactNode }) {
  const access = usePeopleAccess(props);
  const [sidebarChoice, setSidebarChoice] = useState<string | null>(null);
  const sidebarProject =
    access.allowedProjects.find((project) => project.id === sidebarChoice) ??
    access.allowedProjects[0];
  return (
    <AppShell
      activePath="/settings"
      projectSelector={
        <ProjectSelector
          projects={access.allowedProjects}
          projectId={sidebarProject?.id ?? null}
          onChange={setSidebarChoice}
          disabled={access.loading || access.error}
        />
      }
      userMenu={userMenu}
    >
      <PeopleAccessPage
        currentUserId={props.userId}
        organizationId={props.organizationId}
        accessRevoked={access.accessRevoked}
        access={access.access}
        loading={access.loading}
        error={access.error}
        people={access.people}
        emails={access.emails}
        domains={access.domains}
        exclusions={access.exclusions}
        projects={access.projects}
        project={access.project}
        projectPeople={access.projectPeople}
        pagination={access.pagination}
        onRetry={access.retry}
        onSelectProject={access.chooseProject}
        onSaveEmail={access.saveEmail}
        onSaveDomain={access.saveDomain}
        onRemovePerson={access.removePerson}
        onRemoveEmail={access.removeEmail}
        onRemoveDomain={access.removeDomain}
        onAllowJoining={access.allowJoining}
        onChangeProjectPeople={access.changeProjectPeople}
      />
    </AppShell>
  );
}
