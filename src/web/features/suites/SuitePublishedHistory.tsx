import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
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
import {
  ApiError,
  contractManifest,
  listSuiteRevisions,
  type createValidatedClient,
} from "@featherlane/contracts";
import { suitePath } from "./navigation";
export function SuitePublishedHistory({
  client,
  scope,
  projectId,
  organizationId,
  suiteId,
  onAccessFailure,
}: {
  client: ReturnType<typeof createValidatedClient>;
  scope: readonly unknown[];
  projectId: string;
  organizationId: string;
  suiteId: string;
  onAccessFailure: (status: 401 | 403 | 404) => void;
}) {
  const history = useInfiniteQuery({
    queryKey: [...scope, "history", suiteId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listSuiteRevisions({
        client,
        headers: { "x-flf-contract-version": contractManifest.contractVersion },
        path: { projectId },
        query: { suiteId, limit: 10, cursor: pageParam },
        signal,
      }),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    retry: false,
  });
  useEffect(() => {
    const e = history.error;
    if (
      e instanceof ApiError &&
      (e.status === 401 || e.status === 403 || e.status === 404)
    )
      onAccessFailure(e.status);
  }, [history.error]);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, md: 6 } }}>
      <Typography component="h2" variant="h2" sx={{ mb: 4 }}>
        Published history
      </Typography>
      {history.isPending ? (
        <Typography role="status">Loading history…</Typography>
      ) : history.isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => void history.refetch()}>
              Retry
            </Button>
          }
        >
          Could not load published history.
        </Alert>
      ) : !history.data.pages.some((p) => p.data.length) ? (
        <Typography color="text.secondary">
          No published revisions yet.
        </Typography>
      ) : (
        <>
          <TableContainer>
            <Table aria-label="Published suite history">
              <TableHead>
                <TableRow>
                  <TableCell>Revision</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Published</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.data.pages
                  .flatMap((p) => p.data)
                  .map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={suitePath(organizationId, projectId, r.id)}>
                          Revision {r.revision}
                        </Link>
                      </TableCell>
                      <TableCell>PUBLISHED</TableCell>
                      <TableCell>
                        {new Date(r.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          {history.hasNextPage && (
            <Stack sx={{ mt: 4, alignItems: "flex-start" }}>
              <Button
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                More revisions
              </Button>
            </Stack>
          )}
        </>
      )}
    </Paper>
  );
}
