import { useRef, useState } from "react";
import {
  Box,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError, type ProjectView } from "@featherlane/contracts";
import {
  zOrganizationView,
  zProjectView,
} from "@featherlane/contracts/validators";
import {
  ProjectsWorkspace,
  type WorkspaceDisplayState,
} from "../features/projects/ProjectsWorkspace";
import samples from "./projects.json";

// UI-only sample adapter. No API, auth provider, session, or browser storage.
const organizations = zOrganizationView.array().parse(samples.organizations);
const initialProjects = zProjectView.array().parse(samples.projects);
const modes = [
  { value: "ready", label: "Populated" },
  { value: "empty", label: "No projects" },
  { value: "loading", label: "Loading" },
  { value: "error", label: "Request error" },
  { value: "access-required", label: "Access required" },
  { value: "access-removed", label: "Access removed" },
] as const;
type DemoMode = (typeof modes)[number]["value"];

export function ProjectsDemo() {
  const [mode, setMode] = useState<DemoMode>("ready");
  const [rejectCreate, setRejectCreate] = useState(false);
  const [projects, setProjects] = useState<ProjectView[]>(initialProjects);
  const [organizationId, setOrganizationId] = useState<string | null>(
    organizations[0]?.id ?? null,
  );
  const [projectId, setProjectId] = useState<string | null>(
    initialProjects[0]?.id ?? null,
  );
  const [notice, setNotice] = useState("");
  const scope = useRef(organizationId);
  scope.current = mode === "ready" || mode === "empty" ? organizationId : null;
  const visibleProjects =
    mode === "empty"
      ? []
      : projects.filter((project) => project.organizationId === organizationId);
  const state: WorkspaceDisplayState = mode === "empty" ? "ready" : mode;

  function changeOrganization(id: string) {
    setOrganizationId(id);
    setProjectId(
      mode === "empty"
        ? null
        : (projects.find((project) => project.organizationId === id)?.id ??
            null),
    );
    setNotice("");
  }
  function selectProject(id: string) {
    if (!visibleProjects.some((project) => project.id === id)) return;
    setProjectId(id);
    setNotice("Project selected in the local sample workspace.");
  }
  async function createProject(id: string, name: string) {
    const reject = rejectCreate;
    const wasEmpty = mode === "empty";
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    if (scope.current !== id) return;
    if (reject)
      throw new ApiError(422, {
        code: "VALIDATION_FAILED",
        message: "Simulated creation rejection",
        details: [],
        requestId: "demo_project_creation",
      });
    const project = zProjectView.parse({
      id: `project_${crypto.randomUUID()}`,
      organizationId: id,
      name,
    });
    setProjects((current) => [
      ...(wasEmpty
        ? current.filter((item) => item.organizationId !== id)
        : current),
      project,
    ]);
    setProjectId(project.id);
    setMode("ready");
    setNotice(
      `“${project.name}” created and selected locally. It will reset on reload.`,
    );
  }
  const controls = (
    <Paper variant="outlined" sx={{ p: 3, mb: 6 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={4}
        sx={{ alignItems: { md: "center" } }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Organization & projects · UI demo
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Local sample data. Backend is not connected; changes reset on
            reload.
          </Typography>
        </Box>
        <TextField
          select
          label="Workspace state"
          value={mode}
          onChange={(event) => {
            const next = modes.find(
              (item) => item.value === event.target.value,
            );
            if (!next) return;
            setMode(next.value);
            setNotice("");
            if (next.value === "empty") setProjectId(null);
            else if (next.value === "ready")
              setProjectId(
                projects.find(
                  (project) => project.organizationId === organizationId,
                )?.id ?? null,
              );
          }}
          sx={{ minWidth: 190 }}
        >
          {modes.map((item) => (
            <MenuItem key={item.value} value={item.value}>
              {item.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Sample creation"
          value={rejectCreate ? "reject" : "accept"}
          onChange={(event) => setRejectCreate(event.target.value === "reject")}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="accept">Accept locally</MenuItem>
          <MenuItem value="reject">Reject submission</MenuItem>
        </TextField>
      </Stack>
    </Paper>
  );
  return (
    <ProjectsWorkspace
      organizations={state === "access-required" ? [] : organizations}
      projects={visibleProjects}
      organizationId={scope.current}
      projectId={mode === "empty" ? null : projectId}
      state={state}
      userMenu={<Typography variant="body2">Alex Morgan</Typography>}
      beforeContent={controls}
      notice={notice}
      onOrganizationChange={changeOrganization}
      onProjectChange={selectProject}
      onCreate={createProject}
      onRetry={() => {
        setMode("ready");
        setProjectId(
          projects.find((project) => project.organizationId === organizationId)
            ?.id ?? null,
        );
        setNotice("");
      }}
    />
  );
}
