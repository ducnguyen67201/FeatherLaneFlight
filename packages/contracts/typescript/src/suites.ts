import type {
  GetSuiteRevisionData,
  ListSuiteRevisionsData,
} from "./generated/types.gen";
import {
  getSuiteRevision as generatedGet,
  listSuiteRevisions as generatedList,
} from "./generated/sdk.gen";
import {
  zGetSuiteRevisionResponse,
  zListSuiteRevisionsResponse,
} from "./generated/zod.gen";
import { validateResult, type ReadOptions } from "./sdk";

export async function listSuiteRevisions(
  options: ReadOptions<ListSuiteRevisionsData>,
) {
  const result = await generatedList({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListSuiteRevisionsResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function getSuiteRevision(
  options: ReadOptions<GetSuiteRevisionData>,
) {
  const result = await generatedGet({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetSuiteRevisionResponse,
    result.data,
    result.response,
    options.client,
  );
}
