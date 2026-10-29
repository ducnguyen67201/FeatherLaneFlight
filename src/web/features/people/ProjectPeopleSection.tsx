import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type {
  ChangeProjectPeopleRequest,
  ProjectPersonView,
  ProjectView,
} from "@featherlane/contracts";
import {
  AccessPageNavigation,
  AccessSection,
  type AccessPagination,
} from "./AccessSection";
import { PersonStatus } from "./PersonStatus";

type Props = {
  projects: readonly ProjectView[];
  project: ProjectView | null;
  people: readonly ProjectPersonView[];
  ownerId: string;
  draft: Record<string, boolean>;
  onDraftChange: (draft: Record<string, boolean>) => void;
  projectPagination?: AccessPagination;
  peoplePagination?: AccessPagination;
  onSelectProject: (id: string) => void;
  onSave: (
    projectId: string,
    body: ChangeProjectPeopleRequest,
  ) => Promise<void>;
  onSaved: (message: string) => void;
};

export function ProjectPeopleSection({
  projects,
  project,
  people,
  ownerId,
  draft,
  onDraftChange,
  projectPagination,
  peoplePagination,
  onSelectProject,
  onSave,
  onSaved,
}: Props) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const refreshing = Boolean(
    projectPagination?.pending || peoplePagination?.pending,
  );
  const changes = people.flatMap((person) => {
    const value = draft[person.user.id];
    return value === undefined || value === person.hasAccess
      ? []
      : [{ userId: person.user.id, hasAccess: value }];
  });
  const dirty = changes.length > 0;
  async function save() {
    if (!project || saving.current || refreshing || !dirty) return;
    saving.current = true;
    setPending(true);
    setFailed(false);
    try {
      await onSave(project.id, { changes });
      onDraftChange({});
      onSaved(`Project access saved for ${project.name}.`);
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  return (
    <AccessSection
      title="Project people"
      description="Assign organization members to each project. Only the owner can change these assignments."
    >
      {projects.length ? (
        <Box sx={{ px: 5, pb: 5 }}>
          <TextField
            select
            label="Project"
            size="small"
            value={project?.id ?? ""}
            onChange={(e) => {
              onDraftChange({});
              setFailed(false);
              onSelectProject(e.target.value);
            }}
            sx={{ width: "100%", maxWidth: 360 }}
            disabled={pending || dirty || refreshing}
          >
            <MenuItem value="" disabled>
              Select a project
            </MenuItem>
            {projects.map((p) => (
              <MenuItem
                key={p.id}
                value={p.id}
                sx={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
              >
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      ) : (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ px: 5, pb: 5 }}
        >
          No projects on this page. The organization owner can create projects
          in Settings.
        </Typography>
      )}
      {projectPagination && (
        <AccessPageNavigation
          {...projectPagination}
          onPrevious={
            projectPagination.onPrevious
              ? () => {
                  onDraftChange({});
                  projectPagination.onPrevious?.();
                }
              : undefined
          }
          onNext={
            projectPagination.onNext
              ? () => {
                  onDraftChange({});
                  projectPagination.onNext?.();
                }
              : undefined
          }
          disabled={pending || dirty || refreshing}
        />
      )}
      {project && (
        <>
          <TableContainer
            tabIndex={0}
            aria-label="Project people; scroll horizontally if needed"
          >
            <Table aria-label="Project people" sx={{ minWidth: 520 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Organization member</TableCell>
                  <TableCell>Organization access</TableCell>
                  <TableCell align="right">Project access</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.user.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {person.user.displayName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {person.user.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <PersonStatus owner={person.user.id === ownerId} />
                    </TableCell>
                    <TableCell align="right">
                      <Checkbox
                        checked={draft[person.user.id] ?? person.hasAccess}
                        disabled={pending || refreshing}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next = { ...draft };
                          if (checked === person.hasAccess)
                            delete next[person.user.id];
                          else next[person.user.id] = checked;
                          onDraftChange(next);
                        }}
                        slotProps={{
                          input: {
                            "aria-label": `Give ${person.user.displayName} access to ${project.name}`,
                          },
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!people.length && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography variant="body2" color="text.secondary">
                        No organization members on this page.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {peoplePagination && (
            <AccessPageNavigation
              {...peoplePagination}
              onPrevious={
                peoplePagination.onPrevious
                  ? () => {
                      onDraftChange({});
                      peoplePagination.onPrevious?.();
                    }
                  : undefined
              }
              onNext={
                peoplePagination.onNext
                  ? () => {
                      onDraftChange({});
                      peoplePagination.onNext?.();
                    }
                  : undefined
              }
              disabled={pending || dirty || refreshing}
            />
          )}
        </>
      )}
      <Stack spacing={4} sx={{ p: 5 }}>
        {failed && (
          <Alert severity="error">
            Project access could not be saved. Your changes are preserved.
            Retry, or discard and reload the page to check the current state.
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary">
          Saved emails appear here after the person signs in and becomes an
          organization member.
        </Typography>
        <Stack
          direction="row"
          spacing={3}
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 3,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {dirty
              ? "Unsaved project access changes"
              : "Project assignments are explicit for each person."}
          </Typography>
          <Stack direction="row" spacing={3}>
            {dirty && (
              <Button
                variant="outlined"
                color="secondary"
                disabled={pending}
                onClick={() => {
                  onDraftChange({});
                  setFailed(false);
                }}
              >
                Discard
              </Button>
            )}
            <Button
              variant="contained"
              disabled={pending || refreshing || !dirty || !project}
              onClick={() => void save()}
              startIcon={
                pending ? (
                  <CircularProgress color="inherit" size={16} />
                ) : undefined
              }
            >
              {pending
                ? "Saving…"
                : failed
                  ? "Retry save"
                  : "Save project access"}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </AccessSection>
  );
}
