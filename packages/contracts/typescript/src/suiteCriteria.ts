import type {
  GetSuiteCriteriaSuggestionStatusData,
  SuggestSuiteCriteriaData,
} from "./generated/types.gen";
import {
  getSuiteCriteriaSuggestionStatus as generatedStatus,
  suggestSuiteCriteria as generatedSuggest,
} from "./generated/sdk.gen";
import { getSuiteCriteriaSuggestionStatusQueryKey } from "./generated/@tanstack/react-query.gen";
import {
  zGetSuiteCriteriaSuggestionStatusResponse,
  zSuggestSuiteCriteriaResponse,
} from "./generated/zod.gen";
import { queryOptions } from "@tanstack/react-query";
import { validateResult, type ReadOptions } from "./sdk";

export async function getSuiteCriteriaSuggestionStatus(
  options: ReadOptions<GetSuiteCriteriaSuggestionStatusData>,
) {
  const result = await generatedStatus({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetSuiteCriteriaSuggestionStatusResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function suggestSuiteCriteria(
  options: ReadOptions<SuggestSuiteCriteriaData>,
) {
  const result = await generatedSuggest({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zSuggestSuiteCriteriaResponse,
    result.data,
    result.response,
    options.client,
  );
}

export function getSuiteCriteriaSuggestionStatusOptions(
  options: Parameters<typeof getSuiteCriteriaSuggestionStatus>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...getSuiteCriteriaSuggestionStatusQueryKey(options)],
    queryFn: ({ signal }) =>
      getSuiteCriteriaSuggestionStatus({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
