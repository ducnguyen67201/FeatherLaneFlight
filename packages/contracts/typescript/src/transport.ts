import { ZodError, type ZodType } from "zod";
import { createClient, type Client, type Config } from "./generated/client";
import { client as defaultClient } from "./generated/client.gen";
import { contractManifest, operationPolicies } from "./generated/policy.gen";
import { zErrorBody, zErrorEnvelope } from "./generated/zod.gen";
import type { ErrorBody } from "./generated/types.gen";

export class ContractValidationError extends Error {
  readonly name = "ContractValidationError";
  constructor(readonly requestId: string | null = null) {
    super(
      "The API payload does not match this client. Refresh or check contract compatibility.",
    );
  }
}

export class ApiError extends Error {
  readonly name = "ApiError";
  constructor(
    readonly status: number,
    readonly detail: ErrorBody,
  ) {
    super(detail.message);
  }
  get requestId(): string {
    return this.detail.requestId;
  }
}

function installValidation(client: Client): Client {
  client.setConfig({
    headers: {
      "x-flf-contract-version": contractManifest.contractVersion,
      Accept: "application/json",
    },
    credentials: "same-origin",
  });
  client.interceptors.response.use(async (response, _request, options) => {
    const requestId = zErrorBody.shape.requestId.safeParse(
      response.headers.get("X-Request-ID"),
    );
    const invalid = () =>
      new ContractValidationError(requestId.success ? requestId.data : null);
    const policy = Object.values(operationPolicies).find(
      (operation) =>
        operation.method === options.method && operation.path === options.url,
    );
    const responses: Readonly<Record<string, ZodType>> | undefined =
      policy?.responses;
    const validator = responses?.[String(response.status)];
    if (
      !validator ||
      response.headers.get("content-type")?.split(";")[0]?.trim() !==
        "application/json"
    ) {
      throw invalid();
    }
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch (error) {
      if (error instanceof SyntaxError) throw invalid();
      throw error;
    }
    const parsed = await validator.safeParseAsync(body);
    if (!parsed.success) throw invalid();
    if (!response.ok) {
      const envelope = zErrorEnvelope.safeParse(parsed.data);
      if (!envelope.success) throw invalid();
      throw new ApiError(response.status, envelope.data.error);
    }
    return response;
  });
  client.interceptors.error.use((error) =>
    error instanceof ZodError ? new ContractValidationError() : error,
  );
  return client;
}

/** Isolated client for a specific transport/origin. Validation is always installed. */
export function createValidatedClient(config: Config = {}): Client {
  return installValidation(createClient(config));
}

export const client = installValidation(defaultClient);
export { contractManifest, operationPolicies } from "./generated/policy.gen";
