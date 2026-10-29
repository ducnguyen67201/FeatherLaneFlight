import { MenuItem, TextField } from "@mui/material";
import type { ProjectView } from "@featherlane/contracts";

type ProjectSelectorProps = {
  projects: readonly ProjectView[];
  projectId: string | null;
  disabled?: boolean;
  onChange: (projectId: string) => void;
};

export function ProjectSelector({
  projects,
  projectId,
  disabled = false,
  onChange,
}: ProjectSelectorProps) {
  const value = projects.some((project) => project.id === projectId)
    ? (projectId ?? "")
    : "";
  return (
    <TextField
      select
      label="Project"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || projects.length === 0}
      fullWidth
      slotProps={{
        select: { displayEmpty: true },
        inputLabel: { shrink: true },
      }}
    >
      <MenuItem value="" disabled>
        No project selected
      </MenuItem>
      {projects.map((project) => (
        <MenuItem
          key={project.id}
          value={project.id}
          sx={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
        >
          {project.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
