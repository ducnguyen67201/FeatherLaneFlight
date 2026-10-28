import { queryOptions } from "@tanstack/react-query";
import {
  getContractMetaQueryKey,
  listRunsQueryKey,
} from "./generated/@tanstack/react-query.gen";
import type {
  GetContractMetaResponse,
  ListRunsResponse,
} from "./generated/types.gen";
import { getContractMeta, listRuns } from "./sdk";

// Later feature modules add authenticated scope and freshness policy.
// Validation and typed errors resolve before Query can cache a resource.
export function getContractMetaOptions(
  options?: Parameters<typeof getContractMeta>[0],
) {
  const queryKey = getContractMetaQueryKey(options);
  return queryOptions<
    GetContractMetaResponse,
    Error,
    GetContractMetaResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => getContractMeta({ ...options, signal }),
    retry: false,
  });
}

export function listRunsOptions(options: Parameters<typeof listRuns>[0]) {
  const queryKey = listRunsQueryKey(options);
  return queryOptions<
    ListRunsResponse,
    Error,
    ListRunsResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => listRuns({ ...options, signal }),
    retry: false,
  });
}
