import { queryOptions } from "@tanstack/react-query";
import {
  listSuiteRevisionsQueryKey,
  getSuiteRevisionQueryKey,
} from "./generated/@tanstack/react-query.gen";
import type {
  ListSuiteRevisionsResponse,
  GetSuiteRevisionResponse,
} from "./generated/types.gen";
import { listSuiteRevisions, getSuiteRevision } from "./suites";

export function listSuiteRevisionsOptions(
  options: Parameters<typeof listSuiteRevisions>[0],
  scope: readonly unknown[],
) {
  const queryKey = [...scope, ...listSuiteRevisionsQueryKey(options)];
  return queryOptions<
    ListSuiteRevisionsResponse,
    Error,
    ListSuiteRevisionsResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => listSuiteRevisions({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function getSuiteRevisionOptions(
  options: Parameters<typeof getSuiteRevision>[0],
  scope: readonly unknown[],
) {
  const queryKey = [...scope, ...getSuiteRevisionQueryKey(options)];
  return queryOptions<
    GetSuiteRevisionResponse,
    Error,
    GetSuiteRevisionResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => getSuiteRevision({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
