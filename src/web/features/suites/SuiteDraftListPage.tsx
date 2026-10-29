import {
  Alert,
  Button,
  Link,
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

import { useSuiteDraftList } from "./useSuiteDraftList";
import { PageLayout } from "../../layouts/PageLayout";
import { draftPath } from "./navigation";
import type { DraftEditorConnection } from "./useSuiteDraftEditor";
export function SuiteDraftListPage({
  connection,
  cacheScope,
  organizationId,
  backHref,
}: {
  connection: DraftEditorConnection;
  cacheScope: readonly unknown[];
  organizationId: string;
  backHref: string;
}) {
  const {
    rows,
    creating,
    notice,
    blocked,
    state,
    page,
    fetching,
    hasNext,
    create,
    retry,
    previous,
    next,
  } = useSuiteDraftList(connection, cacheScope, organizationId);
  return (
    <PageLayout
      title="Suite drafts"
      description="Create a suite or continue editing a draft."
      breadcrumbs={[
        <Link key="s" href={backHref}>
          Test suites
        </Link>,
        <Typography key="d" variant="body2">
          Drafts
        </Typography>,
      ]}
      actions={
        <Button
          variant="contained"
          startIcon={<Add />}
          disabled={creating || blocked}
          onClick={() => void create()}
        >
          {creating ? "Creating…" : "Create draft"}
        </Button>
      }
    >
      {notice && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {notice}
        </Alert>
      )}
      {state === "loading" ? (
        <Typography role="status">Loading drafts…</Typography>
      ) : state === "error" ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={retry}>
              Retry
            </Button>
          }
        >
          Could not load drafts.
        </Alert>
      ) : !rows.length ? (
        <Paper variant="outlined" sx={{ p: 8, textAlign: "center" }}>
          <Typography component="h2" variant="h2">
            No suite drafts
          </Typography>
          <Typography color="text.secondary" sx={{ my: 4 }}>
            Start from the supported synthetic nominal preset.
          </Typography>
          <Button
            variant="contained"
            disabled={creating}
            onClick={() => void create()}
          >
            Create draft
          </Button>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <TableContainer>
            <Table aria-label="Suite drafts">
              <TableHead>
                <TableRow>
                  <TableCell>Suite</TableCell>
                  <TableCell>Draft version</TableCell>
                  <TableCell>Saved</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.suiteId}>
                    <TableCell>
                      <Link
                        href={draftPath(
                          organizationId,
                          connection.projectId,
                          row.suiteId,
                        )}
                      >
                        {row.title || "Untitled suite"}
                      </Link>
                    </TableCell>
                    <TableCell>{row.draftVersion}</TableCell>
                    <TableCell>
                      {new Date(row.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack
            direction="row"
            spacing={3}
            sx={{ p: 4, justifyContent: "flex-end" }}
          >
            <Button
              variant="outlined"
              disabled={!page || fetching}
              onClick={previous}
            >
              Previous
            </Button>
            <Button
              variant="outlined"
              disabled={!hasNext || fetching}
              onClick={next}
            >
              Next
            </Button>
          </Stack>
        </Paper>
      )}
    </PageLayout>
  );
}
