import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Link, Skeleton, Stack } from "@mui/material";
import { AppShell } from "../../layouts/AppShell";
import { ProjectSelector } from "../projects/ProjectSelector";
import {
  useProjectAccess,
  type ProjectAccessProps,
} from "../projects/useProjectAccess";
import { RunsWorkspace } from "./RunsWorkspace";

import { runsPath } from "./navigation";

type Props = ProjectAccessProps & { userMenu: ReactNode };
export function AuthenticatedRuns(props: Props) {
  const [search, setSearch] = useState(() => window.location.search);
  useEffect(() => {
    const changed = () => setSearch(window.location.search);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  return (
    <RunsProjectWorkspace
      key={search}
      {...props}
      search={search}
      onScopeChange={setSearch}
    />
  );
}

function RunsProjectWorkspace({
  userMenu,
  search,
  onScopeChange,
  ...props
}: Props & { search: string; onScopeChange: (value: string) => void }) {
  const queryClient = useQueryClient();
  const query = new URLSearchParams(search);
  const access = useProjectAccess({
    ...props,
    initialOrganizationId: query.get("organizationId"),
    initialProjectId: query.get("projectId"),
  });
  const [blocked, setBlocked] = useState(false);
  const ready = access.state === "ready" && !blocked;
  const project = ready
    ? access.projects.find(
        (item) =>
          item.id === access.projectId &&
          item.organizationId === access.organizationId,
      )
    : undefined;
  const projectSelector = (
    <Stack spacing={3}>
      <ProjectSelector
        projects={
          ready
            ? access.projects.filter(
                (item) => item.organizationId === access.organizationId,
              )
            : []
        }
        projectId={project?.id ?? null}
        disabled={!ready}
        onChange={(id) => {
          if (!access.organizationId) return;
          window.history.replaceState(
            null,
            "",
            runsPath(access.organizationId, id),
          );
          onScopeChange(window.location.search);
        }}
      />
      {access.moreProjects && (
        <Button
          size="small"
          disabled={access.loadingMoreProjects}
          onClick={access.moreProjects}
        >
          Load more projects
        </Button>
      )}
    </Stack>
  );
  if (project)
    return (
      <RunsWorkspace
        key={project.id}
        projectName={project.name}
        projectSelector={projectSelector}
        userMenu={userMenu}
        transport={{
          client: props.client,
          cacheScope: props.cacheScope,
          organizationId: project.organizationId,
          projectId: project.id,
          csrfToken: props.csrfToken,
          onAccessFailure: (status) => {
            setBlocked(true);
            const prefix = [
              ...props.cacheScope,
              project.organizationId,
              project.id,
            ];
            void queryClient
              .cancelQueries({ queryKey: prefix })
              .then(() => queryClient.removeQueries({ queryKey: prefix }));
            props.onAccessFailure(status);
          },
        }}
      />
    );
  return (
    <AppShell
      activePath="/runs"
      projectSelector={projectSelector}
      userMenu={userMenu}
    >
      <Box component="main" id="main" tabIndex={-1}>
        {access.state === "loading" ? (
          <Skeleton height={120} />
        ) : (
          <Alert
            severity={
              blocked ||
              access.state === "error" ||
              access.state === "access-removed"
                ? "warning"
                : "info"
            }
            action={
              <Button
                color="inherit"
                onClick={() => {
                  setBlocked(false);
                  access.retry();
                }}
              >
                Retry
              </Button>
            }
          >
            Choose an accessible organization and project in{" "}
            <Link href="/settings" color="inherit">
              Settings
            </Link>{" "}
            to view runs and submit a new request.
          </Alert>
        )}
      </Box>
    </AppShell>
  );
}
