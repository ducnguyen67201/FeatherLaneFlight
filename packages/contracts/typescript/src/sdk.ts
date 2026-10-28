import type {
  CreateRunData,
  GetRunOptionsData,
  GetContractMetaData,
  ListRunsData,
  GetSessionData,
  LogoutData,
} from "./generated/types.gen";
import {
  getContractMeta as generatedMeta,
  listRuns as generatedRuns,
  getRunOptions as generatedRunOptions,
  createRun as generatedCreateRun,
  getSession as generatedGetSession,
  logout as generatedLogout,
  type Options,
} from "./generated/sdk.gen";
import type { TDataShape } from "./generated/client";
import {
  zGetContractMetaResponse,
  zListRunsResponse,
  zGetRunOptionsResponse,
  zCreateRunResponse,
  zGetSessionResponse,
  zLogoutResponse,
} from "./generated/zod.gen";
import { validateResult } from "./transport";

export { validateResult } from "./transport";

export type ReadOptions<T extends TDataShape> = Omit<
  Options<T, true>,
  | "throwOnError"
  | "responseStyle"
  | "parseAs"
  | "requestValidator"
  | "responseValidator"
  | "responseTransformer"
  | "url"
  | "method"
>;

// Errors from the transport are Error subclasses, never a successful resource
// or a generated field-result whose error type still describes raw wire JSON.
export async function getContractMeta(
  options?: ReadOptions<GetContractMetaData>,
) {
  const client = options?.client;
  const response = await generatedMeta({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  // Fetch transforms and empty-body shortcuts run after its response validator.
  return validateResult(
    zGetContractMetaResponse,
    response.data,
    response.response,
    client,
  );
}

export async function listRuns(options: ReadOptions<ListRunsData>) {
  const client = options.client;
  const response = await generatedRuns({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListRunsResponse,
    response.data,
    response.response,
    client,
  );
}

export async function getRunOptions(options: ReadOptions<GetRunOptionsData>) {
  const client = options.client;
  const response = await generatedRunOptions({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetRunOptionsResponse,
    response.data,
    response.response,
    client,
  );
}

export async function createRun(options: ReadOptions<CreateRunData>) {
  const client = options.client;
  const response = await generatedCreateRun({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zCreateRunResponse,
    response.data,
    response.response,
    client,
  );
}

export async function getSession(options: ReadOptions<GetSessionData>) {
  const client = options.client;
  const response = await generatedGetSession({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetSessionResponse,
    response.data,
    response.response,
    client,
  );
}

export async function logout(options: ReadOptions<LogoutData>) {
  const client = options.client;
  const response = await generatedLogout({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zLogoutResponse,
    response.data,
    response.response,
    client,
  );
}
