import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import type { ProjectView } from "@featherlane/contracts";

type ProjectsTableProps = {
  projects: readonly ProjectView[];
  projectId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
};

export function ProjectsTable({
  projects,
  projectId,
  onSelect,
  onCreate,
}: ProjectsTableProps) {
  return (
    <Paper variant="outlined" sx={{ p: 5, minWidth: 0 }}>
      <Typography component="h2" variant="h2" sx={{ mb: 4 }}>
        Projects
      </Typography>
      {projects.length === 0 ? (
        <Box sx={{ py: 5 }}>
          <Typography>No projects available</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Create a project, or ask the operator to add you to an existing one.
          </Typography>
          <Button
            startIcon={<Add />}
            variant="outlined"
            sx={{ mt: 4 }}
            onClick={onCreate}
          >
            Create first project
          </Button>
        </Box>
      ) : (
        <TableContainer
          tabIndex={0}
          aria-label="Your projects; scroll horizontally if needed"
        >
          <Table aria-label="Your organization projects">
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell align="right">Selection</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{ alignItems: "center" }}
                    >
                      <FolderOutlined fontSize="small" color="disabled" />
                      <Typography
                        variant="body2"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {project.name}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="outlined"
                      color={project.id === projectId ? "secondary" : "primary"}
                      aria-label={`${project.id === projectId ? "Selected" : "Use"} ${project.name}`}
                      aria-pressed={project.id === projectId}
                      startIcon={
                        project.id === projectId ? (
                          <CheckCircleOutlined />
                        ) : undefined
                      }
                      onClick={() => onSelect(project.id)}
                    >
                      {project.id === projectId ? "Selected" : "Use project"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
