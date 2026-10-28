import { mutationOptions, queryOptions } from "@tanstack/react-query";
import {
  getContractMetaQueryKey,
  listRunsQueryKey,
  getRunOptionsQueryKey,
  createRunMutation as generatedCreateRunMutation,
} from "./generated/@tanstack/react-query.gen";
import type {
  GetContractMetaResponse,
  ListRunsResponse,
  GetRunOptionsResponse,
} from "./generated/types.gen";
import { getContractMeta, listRuns, getRunOptions, createRun } from "./sdk";

// Later feature modules add authenticated scope and freshness policy.
// Validation and typed errors resolve before Query can cache a resource.
export function createRunMutation() {
  const generated = generatedCreateRunMutation();
  // The generated error type describes wire JSON; public policy throws Error subclasses.
  const options = {
    mutationFn: createRun,
    retry: false as const,
  };
  return generated.mutationKey
    ? mutationOptions({ ...options, mutationKey: generated.mutationKey })
    : mutationOptions(options);
}

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

export function listRunsOptions(
  options: Parameters<typeof listRuns>[0],
  scope: readonly unknown[] = [],
) {
  const queryKey = [...scope, ...listRunsQueryKey(options)];
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

export function getRunOptionsOptions(
  options: Parameters<typeof getRunOptions>[0],
  scope: readonly unknown[] = [],
) {
  const queryKey = [...scope, ...getRunOptionsQueryKey(options)];
  return queryOptions<
    GetRunOptionsResponse,
    Error,
    GetRunOptionsResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => getRunOptions({ ...options, signal }),
    retry: false,
  });
}
