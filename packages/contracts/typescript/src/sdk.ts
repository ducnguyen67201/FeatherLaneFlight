import type {
  CreateRunData,
  GetRunDetailData,
  GetRunEventsData,
  GetRunArtifactsData,
  CancelRunData,
  GetRunOptionsData,
  GetContractMetaData,
  ListRunsData,
} from "./generated/types.gen";
import {
  getContractMeta as generatedMeta,
  listRuns as generatedRuns,
  getRunOptions as generatedRunOptions,
  createRun as generatedCreateRun,
  getRunDetail as generatedDetail,
  getRunEvents as generatedEvents,
  getRunArtifacts as generatedArtifacts,
  cancelRun as generatedCancel,
  type Options,
} from "./generated/sdk.gen";
import type { TDataShape } from "./generated/client";
import type { ZodType } from "zod";
import {
  zErrorBody,
  zGetContractMetaResponse,
  zListRunsResponse,
  zGetRunOptionsResponse,
  zCreateRunResponse,
  zGetRunDetailResponse,
  zGetRunEventsResponse,
  zGetRunArtifactsResponse,
  zCancelRunResponse,
} from "./generated/zod.gen";
import { ContractValidationError } from "./transport";

type ReadOptions<T extends TDataShape> = Omit<
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

function validateResult<T>(
  schema: ZodType<T>,
  data: unknown,
  response: Response,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const requestId = zErrorBody.shape.requestId.safeParse(
      response.headers.get("X-Request-ID"),
    );
    throw new ContractValidationError(
      requestId.success ? requestId.data : null,
    );
  }
  return parsed.data;
}

// Errors from the transport are Error subclasses, never a successful resource
// or a generated field-result whose error type still describes raw wire JSON.
export async function getContractMeta(
  options?: ReadOptions<GetContractMetaData>,
) {
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
  );
}

export async function listRuns(options: ReadOptions<ListRunsData>) {
  const response = await generatedRuns({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(zListRunsResponse, response.data, response.response);
}

export async function getRunOptions(options: ReadOptions<GetRunOptionsData>) {
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
  );
}

export async function createRun(options: ReadOptions<CreateRunData>) {
  const response = await generatedCreateRun({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(zCreateRunResponse, response.data, response.response);
}

export async function getRunDetail(options: ReadOptions<GetRunDetailData>) {
  const response = await generatedDetail({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetRunDetailResponse,
    response.data,
    response.response,
  );
}

export async function getRunEvents(options: ReadOptions<GetRunEventsData>) {
  const response = await generatedEvents({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetRunEventsResponse,
    response.data,
    response.response,
  );
}

export async function getRunArtifacts(
  options: ReadOptions<GetRunArtifactsData>,
) {
  const response = await generatedArtifacts({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetRunArtifactsResponse,
    response.data,
    response.response,
  );
}

export async function cancelRun(options: ReadOptions<CancelRunData>) {
  const response = await generatedCancel({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(zCancelRunResponse, response.data, response.response);
}
