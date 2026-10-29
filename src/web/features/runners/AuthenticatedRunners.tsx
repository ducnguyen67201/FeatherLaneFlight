import type { ReactNode } from "react";
import {
  Alert,
  Button,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
} from "@mui/material";
import { AppShell } from "../../layouts/AppShell";
import { ProjectSelector } from "../projects/ProjectSelector";
import {
  useProjectAccess,
  type ProjectAccessProps,
} from "../projects/useProjectAccess";
import { RunnersPage } from "./RunnersPage";
import { useRunnerHealth } from "./useRunnerHealth";

function ProjectRunners({
  projectId,
  projectName,
  ...props
}: ProjectAccessProps & { projectId: string; projectName: string }) {
  const health = useRunnerHealth(props, projectId);
  return (
    <RunnersPage
      projectName={projectName}
      runners={health.runners}
      loading={health.loading}
      error={!!health.error}
      blocked={health.blocked}
      revoking={health.revoking}
      page={health.page}
      onRetry={health.retry}
      onRefresh={() => {
        void health.refresh();
      }}
      onCreateGrant={health.createGrant}
      onRevoke={health.revoke}
      onPreviousPage={health.previous}
      onNextPage={health.next}
    />
  );
}
export function AuthenticatedRunners({
  userMenu,
  ...props
}: ProjectAccessProps & { userMenu: ReactNode }) {
  const access = useProjectAccess(props);
  const ready = access.state === "ready";
  const project = ready
    ? access.projects.find((item) => item.id === access.projectId)
    : undefined;
  return (
    <AppShell
      activePath="/runners"
      userMenu={userMenu}
      projectSelector={
        <Stack spacing={3}>
          <TextField
            select
            label="Organization"
            value={ready ? (access.organizationId ?? "") : ""}
            onChange={(e) => access.chooseOrganization(e.target.value)}
            disabled={!ready || !access.organizations.length}
            slotProps={{ inputLabel: { shrink: true } }}
          >
            {access.organizations.map((org) => (
              <MenuItem key={org.id} value={org.id}>
                {org.name}
              </MenuItem>
            ))}
          </TextField>
          {access.moreOrganizations && (
            <Button
              disabled={access.loadingMoreOrganizations}
              onClick={access.moreOrganizations}
            >
              More organizations
            </Button>
          )}
          <ProjectSelector
            projects={ready ? access.projects : []}
            projectId={access.projectId}
            disabled={!ready}
            onChange={access.chooseProject}
          />
          {access.moreProjects && (
            <Button
              disabled={access.loadingMoreProjects}
              onClick={access.moreProjects}
            >
              More projects
            </Button>
          )}
        </Stack>
      }
    >
      {access.state === "loading" ? (
        <Skeleton variant="rounded" height={160} />
      ) : !ready ? (
        <Alert severity={access.state === "error" ? "error" : "warning"}>
          Project access is unavailable.{" "}
          <Button onClick={access.retry}>Retry</Button>
        </Alert>
      ) : project ? (
        <ProjectRunners
          key={project.id}
          {...props}
          projectId={project.id}
          projectName={project.name}
        />
      ) : (
        <Alert severity="info">
          Select a project in Settings before connecting a machine.
        </Alert>
      )}
    </AppShell>
  );
}
