import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Typography } from "@mui/material";
import {
  ApiError,
  contractManifest,
  getJudgeSuiteDraftOptions,
} from "@featherlane/contracts";
import type { DraftEditorConnection } from "./useSuiteDraftEditor";
import { SuiteDraftEditor } from "./SuiteDraftEditor";
export function SuiteDraftRoute({
  connection,
  cacheScope,
  suiteId,
  organizationId,
  backHref,
}: {
  connection: DraftEditorConnection;
  cacheScope: readonly unknown[];
  suiteId: string;
  organizationId: string;
  backHref: string;
}) {
  const queryClient = useQueryClient();
  const [blocked, setBlocked] = useState(false);
  const scope = [...cacheScope, connection.projectId, "suites"];
  function deny(status: 401 | 403 | 404) {
    setBlocked(true);
    connection.onAccessFailure(status);
    void queryClient
      .cancelQueries({ queryKey: scope })
      .then(() => queryClient.removeQueries({ queryKey: scope }));
  }
  const options = getJudgeSuiteDraftOptions(
    {
      client: connection.client,
      headers: { "x-flf-contract-version": contractManifest.contractVersion },
      path: { projectId: connection.projectId, suiteId },
    },
    scope,
  );
  const query = useQuery({
    ...options,
    enabled: !blocked,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const e = query.error;
    if (
      e instanceof ApiError &&
      (e.status === 401 || e.status === 403 || e.status === 404)
    )
      deny(e.status);
  }, [query.error]);
  if (blocked || query.isError)
    return (
      <Alert
        severity="error"
        action={
          <Button
            color="inherit"
            onClick={() => {
              setBlocked(false);
              void query.refetch();
            }}
          >
            Retry
          </Button>
        }
      >
        Could not load this draft. Check your project access and retry.
      </Alert>
    );
  if (query.isPending)
    return <Typography role="status">Loading suite draft…</Typography>;
  return (
    <SuiteDraftEditor
      key={suiteId}
      draft={query.data.data}
      connection={{ ...connection, onAccessFailure: deny }}
      scope={scope}
      organizationId={organizationId}
      backHref={backHref}
      onSaved={(draft) => {
        queryClient.setQueryData(options.queryKey, { data: draft });
        void queryClient.invalidateQueries({
          queryKey: [...scope, "draft-list"],
        });
      }}
      onPublished={() => {
        void query.refetch();
        void queryClient.invalidateQueries({ queryKey: scope });
      }}
      onReload={async () => {
        const result = await query.refetch({ throwOnError: true });
        return result.data?.data;
      }}
    />
  );
}
