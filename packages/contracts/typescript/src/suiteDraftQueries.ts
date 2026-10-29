import { queryOptions } from "@tanstack/react-query";
import {
  listSuiteDraftsQueryKey,
  getSuiteDraftQueryKey,
} from "./generated/@tanstack/react-query.gen";
import { listSuiteDrafts, getSuiteDraft } from "./suiteDrafts";

export function listSuiteDraftsOptions(
  options: Parameters<typeof listSuiteDrafts>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listSuiteDraftsQueryKey(options)],
    queryFn: ({ signal }) => listSuiteDrafts({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function getSuiteDraftOptions(
  options: Parameters<typeof getSuiteDraft>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...getSuiteDraftQueryKey(options)],
    queryFn: ({ signal }) => getSuiteDraft({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
