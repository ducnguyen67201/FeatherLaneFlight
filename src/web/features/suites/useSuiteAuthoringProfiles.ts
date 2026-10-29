import { useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ApiError,
  contractManifest,
  listIntegrationProfiles,
  getIntegrationProfileOptions,
} from "@featherlane/contracts";
import type { DraftEditorConnection } from "./useSuiteDraftEditor";
export function useSuiteAuthoringProfiles(
  connection: DraftEditorConnection,
  scope: readonly unknown[],
  selectedId: string | null,
) {
  const common = {
    client: connection.client,
    path: { projectId: connection.projectId },
    headers: { "x-flf-contract-version": contractManifest.contractVersion },
  };
  const list = useInfiniteQuery({
    queryKey: [...scope, "authoring-profiles"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listIntegrationProfiles({
        ...common,
        query: { limit: 100, cursor: pageParam },
        signal,
      }),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    retry: false,
  });
  const selected = useQuery({
    ...getIntegrationProfileOptions(
      {
        ...common,
        path: {
          projectId: connection.projectId,
          profileId: selectedId ?? "unselected",
        },
      },
      scope,
    ),
    enabled: !!selectedId,
  });
  const error = list.error ?? selected.error;
  useEffect(() => {
    const failures = [list.error, selected.error];
    for (const failure of failures) {
      if (
        failure instanceof ApiError &&
        (failure.status === 401 ||
          failure.status === 403 ||
          (failure === list.error && failure.status === 404))
      )
        connection.onAccessFailure(
          failure.status === 401 ? 401 : failure.status === 403 ? 403 : 404,
        );
    }
  }, [list.error, selected.error]);
  const all = [
    ...(list.data?.pages.flatMap((p) => p.data) ?? []),
    ...(selected.data ? [selected.data.data] : []),
  ];
  const profiles = all
    .filter((p) => p.runtimeFamily === "SYNTHETIC")
    .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
  return {
    profiles,
    error,
    loading: list.isPending,
    more: list.hasNextPage,
    fetching: list.isFetchingNextPage,
    loadMore: () => void list.fetchNextPage(),
    retry: () => {
      void list.refetch();
      if (selectedId) void selected.refetch();
    },
  };
}
