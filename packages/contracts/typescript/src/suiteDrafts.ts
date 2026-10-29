import type {
  ListSuiteDraftsData,
  GetSuiteDraftData,
  CreateSuiteDraftData,
  EditSuiteDraftData,
  ValidateSuiteDraftData,
  PublishSuiteDraftData,
} from "./generated/types.gen";
import {
  listSuiteDrafts as generatedListSuiteDrafts,
  getSuiteDraft as generatedGetSuiteDraft,
  createSuiteDraft as generatedCreateSuiteDraft,
  editSuiteDraft as generatedEditSuiteDraft,
  validateSuiteDraft as generatedValidateSuiteDraft,
  publishSuiteDraft as generatedPublishSuiteDraft,
} from "./generated/sdk.gen";
import {
  zListSuiteDraftsResponse,
  zGetSuiteDraftResponse,
  zCreateSuiteDraftResponse,
  zEditSuiteDraftResponse,
  zValidateSuiteDraftResponse,
  zPublishSuiteDraftResponse,
} from "./generated/zod.gen";
import { validateResult, type ReadOptions } from "./sdk";

export async function listSuiteDrafts(
  options: ReadOptions<ListSuiteDraftsData>,
) {
  const result = await generatedListSuiteDrafts({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListSuiteDraftsResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function getSuiteDraft(options: ReadOptions<GetSuiteDraftData>) {
  const result = await generatedGetSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function createSuiteDraft(
  options: ReadOptions<CreateSuiteDraftData>,
) {
  const result = await generatedCreateSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zCreateSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function editSuiteDraft(options: ReadOptions<EditSuiteDraftData>) {
  const result = await generatedEditSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zEditSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function validateSuiteDraft(
  options: ReadOptions<ValidateSuiteDraftData>,
) {
  const result = await generatedValidateSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zValidateSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function publishSuiteDraft(
  options: ReadOptions<PublishSuiteDraftData>,
) {
  const result = await generatedPublishSuiteDraft({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zPublishSuiteDraftResponse,
    result.data,
    result.response,
    options.client,
  );
}
