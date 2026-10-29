import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  contractManifest,
  createSuiteDraft,
  listSuiteDraftsOptions,
} from "@featherlane/contracts";
import { draftPath } from "./navigation";
import type { DraftEditorConnection } from "./useSuiteDraftEditor";
export function useSuiteDraftList(
  connection: DraftEditorConnection,
  cacheScope: readonly unknown[],
  organizationId: string,
) {
  const [cursor, setCursor] = useState<{
    page: number;
    values: (string | null)[];
  }>({ page: 0, values: [null] });
  const [blocked, setBlocked] = useState(false),
    [creating, setCreating] = useState(false),
    [notice, setNotice] = useState("");
  const pending = useRef(false),
    key = useRef(crypto.randomUUID()),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const qc = useQueryClient();
  const scope = [...cacheScope, connection.projectId, "suites"];
  const query = useQuery({
    ...listSuiteDraftsOptions(
      {
        client: connection.client,
        headers: { "x-flf-contract-version": contractManifest.contractVersion },
        path: { projectId: connection.projectId },
        query: { limit: 10, cursor: cursor.values[cursor.page] ?? null },
      },
      [...scope, "draft-list"],
    ),
    enabled: !blocked,
  });
  function handle(error: unknown) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      setBlocked(true);
      connection.onAccessFailure(error.status);
      void qc
        .cancelQueries({ queryKey: scope })
        .then(() => qc.removeQueries({ queryKey: scope }));
    } else
      setNotice(
        error instanceof Error ? error.message : "Could not create a draft.",
      );
  }
  useEffect(() => {
    if (query.error) handle(query.error);
  }, [query.error]);
  async function create() {
    if (pending.current) return;
    pending.current = true;
    setCreating(true);
    setNotice("");
    try {
      const r = await createSuiteDraft({
        client: connection.client,
        path: { projectId: connection.projectId },
        headers: {
          "x-flf-contract-version": contractManifest.contractVersion,
          "x-csrf-token": connection.csrfToken,
          "idempotency-key": key.current,
        },
        body: {},
      });
      if (active.current)
        window.location.assign(
          draftPath(organizationId, connection.projectId, r.data.suiteId),
        );
    } catch (e) {
      if (active.current) handle(e);
    } finally {
      pending.current = false;
      if (active.current) setCreating(false);
    }
  }
  const rows = blocked || query.isError ? [] : (query.data?.data ?? []);
  return {
    rows,
    creating,
    notice,
    blocked,
    page: cursor.page,
    fetching: query.isFetching,
    hasNext: !!query.data?.meta.nextCursor,
    state:
      blocked || query.isError
        ? "error"
        : query.isPending
          ? "loading"
          : "ready",
    create,
    retry: () => {
      setBlocked(false);
      void query.refetch();
    },
    previous: () => {
      if (cursor.page && !query.isFetching)
        setCursor((c) => ({ ...c, page: c.page - 1 }));
    },
    next: () => {
      const next = query.data?.meta.nextCursor;
      if (next && !query.isFetching)
        setCursor((c) => ({
          page: c.page + 1,
          values: [...c.values.slice(0, c.page + 1), next],
        }));
    },
  };
}
