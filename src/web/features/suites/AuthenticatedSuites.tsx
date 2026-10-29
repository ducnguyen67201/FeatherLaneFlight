import { useEffect, useState, type ReactNode } from "react";
import { Alert, Box, Button, Link, Skeleton, Stack } from "@mui/material";
import { AppShell } from "../../layouts/AppShell";
import { ProjectSelector } from "../projects/ProjectSelector";
import {
  useProjectAccess,
  type ProjectAccessProps,
} from "../projects/useProjectAccess";
import { SuiteWorkspace } from "./SuiteWorkspace";
import { suitePath } from "./navigation";

type Props = ProjectAccessProps & { userMenu: ReactNode };

export function AuthenticatedSuites(props: Props) {
  const [search, setSearch] = useState(() => window.location.search);
  useEffect(() => {
    const changed = () => setSearch(window.location.search);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  return (
    <SuiteProjectWorkspace
      key={search}
      {...props}
      search={search}
      onScopeChange={setSearch}
    />
  );
}

function SuiteProjectWorkspace({
  userMenu,
  search,
  onScopeChange,
  ...props
}: Props & { search: string; onScopeChange: (value: string) => void }) {
  const query = new URLSearchParams(search);
  const access = useProjectAccess({
    ...props,
    initialOrganizationId: query.get("organizationId"),
    initialProjectId: query.get("projectId"),
  });
  const project =
    access.state === "ready"
      ? access.projects.find(
          (item) =>
            item.id === access.projectId &&
            item.organizationId === access.organizationId,
        )
      : undefined;
  const ready = access.state === "ready";
  return (
    <AppShell
      activePath="/suites"
      projectSelector={
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
                suitePath(access.organizationId, id),
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
      }
      userMenu={userMenu}
    >
      {access.state === "loading" ? (
        <Box component="main" id="main" tabIndex={-1}>
          <Skeleton height={120} />
        </Box>
      ) : project ? (
        <SuiteWorkspace
          key={project.id}
          organizationId={project.organizationId}
          projectId={project.id}
          projectName={project.name}
          client={props.client}
          cacheScope={[...props.cacheScope, props.userId]}
          onAccessFailure={props.onAccessFailure}
        />
      ) : (
        <Box component="main" id="main" tabIndex={-1}>
          <Alert
            severity={
              access.state === "error" || access.state === "access-removed"
                ? "warning"
                : "info"
            }
            action={
              <Button color="inherit" onClick={access.retry}>
                Retry
              </Button>
            }
          >
            Choose an accessible organization and project in{" "}
            <Link href="/settings" color="inherit">
              Settings
            </Link>{" "}
            to view published suites.
          </Alert>
        </Box>
      )}
    </AppShell>
  );
}
