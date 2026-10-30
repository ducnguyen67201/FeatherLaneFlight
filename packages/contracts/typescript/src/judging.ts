import { queryOptions } from "@tanstack/react-query";
import { validateResult, type ReadOptions } from "./sdk";
import type { GetJudgeSuiteDraftData } from "./generated/types.gen";
import { getJudgeSuiteDraft as generatedGetJudgeSuiteDraft } from "./generated/sdk.gen";
import { zGetJudgeSuiteDraftResponse } from "./generated/zod.gen";
import type { EditJudgeSuiteDraftData } from "./generated/types.gen";
import { editJudgeSuiteDraft as generatedEditJudgeSuiteDraft } from "./generated/sdk.gen";
import { zEditJudgeSuiteDraftResponse } from "./generated/zod.gen";
import type { ValidateJudgeSuiteDraftData } from "./generated/types.gen";
import { validateJudgeSuiteDraft as generatedValidateJudgeSuiteDraft } from "./generated/sdk.gen";
import { zValidateJudgeSuiteDraftResponse } from "./generated/zod.gen";
import type { PublishJudgeSuiteDraftData } from "./generated/types.gen";
import { publishJudgeSuiteDraft as generatedPublishJudgeSuiteDraft } from "./generated/sdk.gen";
import { zPublishJudgeSuiteDraftResponse } from "./generated/zod.gen";
import type { GetRunJudgmentsData } from "./generated/types.gen";
import { getRunJudgments as generatedGetRunJudgments } from "./generated/sdk.gen";
import { zGetRunJudgmentsResponse } from "./generated/zod.gen";
import type { SuggestJudgeSuiteCriteriaData } from "./generated/types.gen";
import { suggestJudgeSuiteCriteria as generatedSuggestJudgeSuiteCriteria } from "./generated/sdk.gen";
import { zSuggestJudgeSuiteCriteriaResponse } from "./generated/zod.gen";
import type { GetJudgeCriteriaSuggestionStatusData } from "./generated/types.gen";
import { getJudgeCriteriaSuggestionStatus as generatedGetJudgeCriteriaSuggestionStatus } from "./generated/sdk.gen";
import { zGetJudgeCriteriaSuggestionStatusResponse } from "./generated/zod.gen";

export async function getJudgeSuiteDraft(
  options: ReadOptions<GetJudgeSuiteDraftData>,
) {
  const result = await generatedGetJudgeSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetJudgeSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function editJudgeSuiteDraft(
  options: ReadOptions<EditJudgeSuiteDraftData>,
) {
  const result = await generatedEditJudgeSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zEditJudgeSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function validateJudgeSuiteDraft(
  options: ReadOptions<ValidateJudgeSuiteDraftData>,
) {
  const result = await generatedValidateJudgeSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zValidateJudgeSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function publishJudgeSuiteDraft(
  options: ReadOptions<PublishJudgeSuiteDraftData>,
) {
  const result = await generatedPublishJudgeSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zPublishJudgeSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function getRunJudgments(
  options: ReadOptions<GetRunJudgmentsData>,
) {
  const result = await generatedGetRunJudgments({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetRunJudgmentsResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function suggestJudgeSuiteCriteria(
  options: ReadOptions<SuggestJudgeSuiteCriteriaData>,
) {
  const result = await generatedSuggestJudgeSuiteCriteria({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zSuggestJudgeSuiteCriteriaResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function getJudgeCriteriaSuggestionStatus(
  options: ReadOptions<GetJudgeCriteriaSuggestionStatusData>,
) {
  const result = await generatedGetJudgeCriteriaSuggestionStatus({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetJudgeCriteriaSuggestionStatusResponse,
    result.data,
    result.response,
    options.client,
  );
}

export function getJudgeSuiteDraftOptions(
  options: Parameters<typeof getJudgeSuiteDraft>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, "getJudgeSuiteDraft", options.path],
    queryFn: ({ signal }) => getJudgeSuiteDraft({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function getRunJudgmentsOptions(
  options: Parameters<typeof getRunJudgments>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, "getRunJudgments", options.path],
    queryFn: ({ signal }) => getRunJudgments({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function getJudgeCriteriaSuggestionStatusOptions(
  options: Parameters<typeof getJudgeCriteriaSuggestionStatus>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, "getJudgeCriteriaSuggestionStatus", options.path],
    queryFn: ({ signal }) =>
      getJudgeCriteriaSuggestionStatus({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
