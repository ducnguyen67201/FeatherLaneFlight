import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  contractManifest,
  getSuiteRevisionOptions,
  listSuiteRevisionsOptions,
  type createValidatedClient,
} from "@featherlane/contracts";
import type { CheckKind } from "./SuiteCatalogPage";

type Props = {
  client: ReturnType<typeof createValidatedClient>;
  cacheScope: readonly unknown[];
  projectId: string;
  revisionId: string | null;
  onAccessFailure: (status: 401 | 403 | 404) => void;
};
export function useSuiteCatalog({
  client,
  cacheScope,
  projectId,
  revisionId,
  onAccessFailure,
}: Props) {
  const [filters, setFilters] = useState<{
    search: string;
    requiredCheck: CheckKind | null;
    cursors: (string | null)[];
    page: number;
  }>({
    search: "",
    requiredCheck: null,
    cursors: [null],
    page: 0,
  });
  const [blocked, setBlocked] = useState(false);
  const failed = useRef(false);
  const queryClient = useQueryClient();
  const prefix = [...cacheScope, projectId, "suites"];
  const headers = {
    "x-flf-contract-version": contractManifest.contractVersion,
  };
  const list = useQuery({
    ...listSuiteRevisionsOptions(
      {
        client,
        headers,
        path: { projectId },
        query: {
          limit: 10,
          cursor: filters.cursors[filters.page] ?? null,
          search: filters.search.trim() || null,
          requiredCheck: filters.requiredCheck,
        },
      },
      prefix,
    ),
    enabled: !revisionId && !blocked,
  });
  const detail = useQuery({
    ...getSuiteRevisionOptions(
      {
        client,
        headers,
        path: { projectId, suiteRevisionId: revisionId ?? "unselected" },
      },
      prefix,
    ),
    enabled: !!revisionId && !blocked,
  });
  const error = revisionId ? detail.error : list.error;
  const handler = useRef(onAccessFailure);
  handler.current = onAccessFailure;
  useEffect(() => {
    if (
      !(error instanceof ApiError) ||
      ![401, 403, 404].includes(error.status) ||
      failed.current
    )
      return;
    failed.current = true;
    setBlocked(true);
    if (error.status === 401) handler.current(401);
    void queryClient
      .cancelQueries({ queryKey: prefix })
      .then(() => queryClient.removeQueries({ queryKey: prefix }));
  }, [error, projectId, queryClient]);
  function changeFilters(
    change: Partial<Pick<typeof filters, "search" | "requiredCheck">>,
  ) {
    setFilters((current) => ({
      ...current,
      ...change,
      cursors: [null],
      page: 0,
    }));
  }
  function retry() {
    failed.current = false;
    setBlocked(false);
    void queryClient.invalidateQueries({ queryKey: prefix });
  }
  return {
    filters,
    list,
    detail,
    blocked,
    changeFilters,
    retry,
    clearFilters: () => changeFilters({ search: "", requiredCheck: null }),
    previous: () => {
      if (!list.isFetching)
        setFilters((current) => ({
          ...current,
          page: Math.max(0, current.page - 1),
        }));
    },
    next: () => {
      const cursor = list.data?.meta.nextCursor;
      if (!cursor || list.isFetching) return;
      setFilters((current) => ({
        ...current,
        cursors: [...current.cursors.slice(0, current.page + 1), cursor],
        page: current.page + 1,
      }));
    },
  };
}
