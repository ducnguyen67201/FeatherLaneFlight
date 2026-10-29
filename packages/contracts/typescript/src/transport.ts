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
    readonly retryAt: number | null = null,
  ) {
    super(detail.message);
  }
  get requestId(): string {
    return this.detail.requestId;
  }
}

export type SessionTransportPolicy = {
  origin: string;
  isCurrent: () => boolean;
  csrfToken: () => string | null;
  onUnauthorized: (error: ApiError) => void;
};

const sessionChecks = new WeakMap<Client, () => void>();

/** Reuse the same epoch guard for raw stream reads and generated JSON reads. */
export function requireClientCurrent(client: Client) {
  sessionChecks.get(client)?.();
}

/** Validate the final generated result, including the supplied client's auth epoch. */
export function validateResult<T>(
  schema: ZodType<T>,
  data: unknown,
  response: Response,
  client: Client = defaultClient,
): T {
  const parsed = schema.safeParse(data);
  // Generated body reads, validation and transforms all finish before this check.
  requireClientCurrent(client);
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

function installValidation(
  client: Client,
  session?: SessionTransportPolicy,
): Client {
  client.setConfig({
    headers: {
      "x-flf-contract-version": contractManifest.contractVersion,
      Accept: "application/json",
    },
    credentials: "same-origin",
  });
  const requireCurrent = () => {
    if (session && !session.isCurrent()) {
      throw new DOMException("The session has changed.", "AbortError");
    }
  };
  if (session) {
    sessionChecks.set(client, requireCurrent);
    client.interceptors.request.use((request) => {
      requireCurrent();
      if (new URL(request.url).origin !== session.origin) {
        throw new Error(
          "Authenticated requests must use the application origin.",
        );
      }
      // Generated request validation already ran. Clone rather than mutate its headers.
      const headers = new Headers(request.headers);
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const csrf = session.csrfToken();
        if (!csrf) throw new Error("A current session is required.");
        headers.set("X-CSRF-Token", csrf);
      }
      return new Request(request, {
        headers,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      });
    });
  }
  client.interceptors.response.use(async (response, _request, options) => {
    requireCurrent();
    const requestId = zErrorBody.shape.requestId.safeParse(
      response.headers.get("X-Request-ID"),
    );
    const invalid = () =>
      new ContractValidationError(requestId.success ? requestId.data : null);
    const policy = Object.values(operationPolicies).find(
      (operation) =>
        operation.method === options.method && operation.path === options.url,
    );
    const responses: Readonly<Record<string, ZodType | null>> | undefined =
      policy?.responses;
    const validator = responses?.[String(response.status)];
    if (response.status === 204 && validator === null) {
      if ((await response.clone().arrayBuffer()).byteLength !== 0) {
        throw invalid();
      }
      requireCurrent();
      return response;
    }
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
    requireCurrent();
    if (!parsed.success) throw invalid();
    if (!response.ok) {
      const envelope = zErrorEnvelope.safeParse(parsed.data);
      if (!envelope.success) throw invalid();
      const header = response.headers.get("Retry-After");
      const seconds = header === null ? NaN : Number(header);
      const retryAt = Number.isFinite(seconds)
        ? Date.now() + Math.max(0, seconds) * 1000
        : header
          ? Date.parse(header)
          : NaN;
      const error = new ApiError(
        response.status,
        envelope.data.error,
        Number.isFinite(retryAt) ? retryAt : null,
      );
      if (response.status === 401) session?.onUnauthorized(error);
      throw error;
    }
    return response;
  });
  client.interceptors.error.use((error) =>
    error instanceof ZodError ? new ContractValidationError() : error,
  );
  return client;
}

/** Isolated client for a specific transport/origin. Validation is always installed. */
export function createValidatedClient(
  config: Config = {},
  session?: SessionTransportPolicy,
): Client {
  return installValidation(createClient(config), session);
}

export const client = installValidation(defaultClient);
export {
  contractManifest,
  operationPolicies,
  browserNavigationPolicies,
} from "./generated/policy.gen";
