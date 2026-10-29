import { queryOptions } from "@tanstack/react-query";
import { listRunnersQueryKey } from "./generated/@tanstack/react-query.gen";
import type { ListRunnersResponse } from "./generated/types.gen";
import { listRunners } from "./runners";

export function listRunnersOptions(
  options: Parameters<typeof listRunners>[0],
  scope: readonly unknown[],
) {
  const queryKey = [...scope, ...listRunnersQueryKey(options)];
  return queryOptions<
    ListRunnersResponse,
    Error,
    ListRunnersResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => listRunners({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
