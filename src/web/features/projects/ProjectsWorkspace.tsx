import { useRef, type ReactNode } from "react";
import {
  Alert,
  AlertTitle,
  Button,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import LockOutlined from "@mui/icons-material/LockOutlined";
import type { OrganizationView, ProjectView } from "@featherlane/contracts";
import { AppShell } from "../../layouts/AppShell";
import { PageLayout } from "../../layouts/PageLayout";
import { ProjectSelector } from "./ProjectSelector";
import { OrganizationSettings } from "./OrganizationSettings";
import { ProjectsTable } from "./ProjectsTable";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { useCreateProjectForm } from "./useCreateProjectForm";

export type WorkspaceDisplayState =
  "ready" | "loading" | "error" | "access-required" | "access-removed";
type ProjectsWorkspaceProps = {
  organizations: readonly OrganizationView[];
  projects: readonly ProjectView[];
  organizationId: string | null;
  projectId: string | null;
  state: WorkspaceDisplayState;
  userMenu: ReactNode;
  beforeContent?: ReactNode;
  notice?: string;
  onOrganizationChange: (organizationId: string) => void;
  onProjectChange: (projectId: string) => void;
  onRetry: () => void;
  onCreate: (organizationId: string, name: string) => Promise<void>;
};

export function ProjectsWorkspace({
  organizations,
  projects,
  organizationId,
  projectId,
  state,
  userMenu,
  beforeContent,
  notice,
  onOrganizationChange,
  onProjectChange,
  onRetry,
  onCreate,
}: ProjectsWorkspaceProps) {
  const organization =
    state === "ready"
      ? organizations.find((item) => item.id === organizationId)
      : undefined;
  const visibleProjects = organization
    ? projects.filter((project) => project.organizationId === organization.id)
    : [];
  const form = useCreateProjectForm(organization?.id ?? null, onCreate);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  function startCreate() {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    form.start();
  }
  function restoreFocus() {
    if (openerRef.current?.isConnected) openerRef.current.focus();
    else if (createButtonRef.current) createButtonRef.current.focus();
    else document.getElementById("main")?.focus();
  }
  const showAccessRequired =
    state === "access-required" || (state === "ready" && !organization);
  const selector = (
    <ProjectSelector
      projects={visibleProjects}
      projectId={projectId}
      disabled={!organization}
      onChange={onProjectChange}
    />
  );

  return (
    <AppShell
      activePath="/settings"
      projectSelector={selector}
      userMenu={userMenu}
    >
      {beforeContent}
      <PageLayout
        breadcrumbs={[
          <Typography key="settings" variant="body2">
            Settings
          </Typography>,
          <Typography key="projects" variant="body2">
            Organization & projects
          </Typography>,
        ]}
        title="Organization & projects"
        description="Manage your organization’s projects. Switch projects from the sidebar."
        actions={
          organization && (
            <Button
              ref={createButtonRef}
              variant="contained"
              startIcon={<Add />}
              onClick={startCreate}
            >
              Create project
            </Button>
          )
        }
      >
        {notice && organization && (
          <Alert severity="success" sx={{ mb: 5, overflowWrap: "anywhere" }}>
            {notice}
          </Alert>
        )}
        {state === "loading" ? (
          <Paper variant="outlined" sx={{ p: 5 }}>
            <Typography component="h2" variant="h2" role="status">
              Loading organization and projects…
            </Typography>
            <Stack spacing={3} sx={{ mt: 4 }}>
              <Skeleton height={48} />
              <Skeleton height={120} />
            </Stack>
          </Paper>
        ) : state === "error" ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={onRetry}>
                Try again
              </Button>
            }
          >
            <AlertTitle>
              Organization and projects could not be loaded
            </AlertTitle>
            Project content is hidden until access can be verified.
          </Alert>
        ) : showAccessRequired || state === "access-removed" ? (
          <Paper variant="outlined" sx={{ p: 5 }}>
            <Typography component="h2" variant="h2" sx={{ mb: 4 }}>
              {state === "access-removed"
                ? "Project access removed"
                : "Organization access required"}
            </Typography>
            <Alert severity="warning" icon={<LockOutlined />}>
              <AlertTitle>
                {state === "access-removed"
                  ? "Your membership is no longer active"
                  : "You have no organization membership"}
              </AlertTitle>
              {state === "access-removed"
                ? "Protected project content is hidden. Ask the operator to restore your organization and project membership."
                : "Ask the operator to add you to an organization and its projects. Organizations are not joined automatically."}
            </Alert>
            <Button variant="outlined" sx={{ mt: 5 }} onClick={onRetry}>
              Refresh access
            </Button>
          </Paper>
        ) : (
          organization && (
            <Stack spacing={6}>
              <OrganizationSettings
                organizations={organizations}
                organizationId={organization.id}
                onChange={onOrganizationChange}
              />
              <ProjectsTable
                projects={visibleProjects}
                projectId={projectId}
                onSelect={onProjectChange}
                onCreate={startCreate}
              />
            </Stack>
          )
        )}
      </PageLayout>
      <CreateProjectDialog
        open={form.open && !!organization}
        organizationName={organization?.name ?? ""}
        name={form.name}
        pending={form.pending}
        error={form.error}
        onNameChange={form.changeName}
        onClose={form.close}
        onExited={restoreFocus}
        onSubmit={() => {
          void form.submit();
        }}
      />
    </AppShell>
  );
}
