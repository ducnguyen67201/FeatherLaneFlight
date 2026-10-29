import type { Client } from "./generated/client";
import type {
  BrowserStreamMessage,
  GetRunEventsData,
} from "./generated/types.gen";
import {
  zBrowserStreamMessage,
  zErrorEnvelope,
  zGetRunEventsHeaders,
  zGetRunEventsPath,
} from "./generated/zod.gen";
import {
  ApiError,
  ContractValidationError,
  contractManifest,
  operationPolicies,
  validateResult,
  requireClientCurrent,
} from "./transport";

const maximumFrameBytes = 262_144;
const encoder = new TextEncoder();

export class StreamInterrupted extends Error {
  readonly name = "StreamInterrupted";
  constructor() {
    super("Live updates disconnected. Recover from a validated snapshot.");
  }
}
export class StreamGap extends Error {
  readonly name = "StreamGap";
  constructor() {
    super("Live event ordering changed. Recover from a validated snapshot.");
  }
}

export type RunStreamOptions = {
  client: Client;
  origin: string;
  runId: GetRunEventsData["path"]["runId"];
  after: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  onAccessFailure: (status: 401 | 403 | 404) => void;
  onConnected?: () => void;
  onReconnect?: () => void;
};

function requireCurrent(options: RunStreamOptions) {
  requireClientCurrent(options.client);
  if (options.signal.aborted || !options.isCurrent())
    throw new DOMException("The session has changed.", "AbortError");
}

async function wait(milliseconds: number, options: RunStreamOptions) {
  requireCurrent(options);
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", abort);
      reject(new DOMException("The session has changed.", "AbortError"));
    };
    const timer = setTimeout(() => {
      options.signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    options.signal.addEventListener("abort", abort, { once: true });
    if (options.signal.aborted) abort();
  });
  requireCurrent(options);
}

async function errorResponse(response: Response, options: RunStreamOptions) {
  const reader = response.body?.getReader();
  if (!reader) throw new ContractValidationError();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let primaryError: unknown;
  try {
    for (;;) {
      const next = await reader.read();
      requireCurrent(options);
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 65_536) throw new ContractValidationError();
      chunks.push(next.value);
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await reader.cancel();
    } catch (error) {
      if (primaryError === undefined) throw error;
    } finally {
      reader.releaseLock();
    }
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(buffer),
    );
  } catch {
    throw new ContractValidationError();
  }
  const parsed = validateResult(
    zErrorEnvelope,
    payload,
    response,
    options.client,
  );
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 404
  )
    options.onAccessFailure(response.status);
  return new ApiError(response.status, parsed.error);
}

async function* frames(
  response: Response,
  options: RunStreamOptions,
  onRead: () => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new StreamInterrupted();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let data: string[] = [];
  let id: string | undefined;
  let frameBytes = 0;
  let primaryError: unknown;
  try {
    for (;;) {
      const next = await reader.read();
      onRead();
      requireCurrent(options);
      if (next.done) return; // An incomplete frame is replayed after reconnect.
      if (next.value.length > maximumFrameBytes)
        throw new ContractValidationError();
      try {
        buffer += decoder.decode(next.value, { stream: true });
      } catch {
        throw new ContractValidationError();
      }
      if (encoder.encode(buffer).length > maximumFrameBytes)
        throw new ContractValidationError();
      for (;;) {
        const match = /\r\n|\r|\n/.exec(buffer);
        if (!match) break;
        if (match[0] === "\r" && match.index === buffer.length - 1) break;
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        frameBytes += encoder.encode(line).length + match[0].length;
        if (frameBytes > maximumFrameBytes) throw new ContractValidationError();
        if (line === "") {
          if (data.length) {
            let payload: unknown;
            try {
              payload = JSON.parse(data.join("\n"));
            } catch {
              throw new ContractValidationError();
            }
            const message = validateResult(
              zBrowserStreamMessage,
              payload,
              response,
              options.client,
            );
            requireCurrent(options);
            if (
              (message.type === "RUN_EVENT" && id !== message.record.cursor) ||
              (message.type === "STREAM_RESET" && id !== undefined)
            )
              throw new ContractValidationError();
            yield message;
          }
          data = [];
          id = undefined;
          frameBytes = 0;
        } else if (!line.startsWith(":")) {
          const colon = line.indexOf(":");
          const field = colon < 0 ? line : line.slice(0, colon);
          const raw = colon < 0 ? "" : line.slice(colon + 1);
          const value = raw.startsWith(" ") ? raw.slice(1) : raw;
          if (field === "data") data.push(value);
          else if (field === "id") id = value;
        }
      }
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await reader.cancel();
    } catch (error) {
      if (primaryError === undefined) throw error;
    } finally {
      reader.releaseLock();
    }
  }
}

/** Framing, bounded reconnect and resume only. Consumers invalidate existing queries. */
export async function* runEventMessages(
  options: RunStreamOptions,
): AsyncGenerator<BrowserStreamMessage> {
  const origin = new URL(options.origin);
  if (origin.origin !== options.origin || origin.username || origin.password)
    throw new Error("Live updates require the application origin.");
  zGetRunEventsPath.parse({ runId: options.runId });
  zGetRunEventsHeaders.parse({
    "x-flf-contract-version": contractManifest.contractVersion,
    "Last-Event-ID": options.after,
  });
  const configuredOrigin = options.client.getConfig().baseUrl;
  if (
    (configuredOrigin && new URL(configuredOrigin).origin !== options.origin) ||
    (typeof window !== "undefined" && window.location.origin !== options.origin)
  )
    throw new Error("Live updates must use the current application origin.");
  const path = operationPolicies.getRunEvents.path.replace(
    "{runId}",
    encodeURIComponent(options.runId),
  );
  const url = new URL(path, origin);
  let cursor = options.after;
  let retries = 0;
  const seen = new Map<
    string,
    { sequence: number; eventId: string; cursor: string }
  >();
  for (;;) {
    requireCurrent(options);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 45_000);
    let idleTimeout: ReturnType<typeof setTimeout> | undefined;
    const readProgress = () => {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(abort, 15_000);
    };
    readProgress();
    const started = Date.now();
    let retryDelay = 1000;
    try {
      const response = await fetch(url, {
        method: operationPolicies.getRunEvents.method,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "text/event-stream",
          "x-flf-contract-version": contractManifest.contractVersion,
          "Last-Event-ID": cursor,
        },
      });
      requireCurrent(options);
      if (!response.ok) {
        const error = await errorResponse(response, options);
        const header = response.headers.get("Retry-After");
        const seconds = Number(header);
        const retryAfter = Number.isFinite(seconds)
          ? seconds
          : header
            ? Math.max(0, (Date.parse(header) - Date.now()) / 1000)
            : 0;
        if (
          (response.status === 429 || response.status >= 500) &&
          Number.isFinite(retryAfter) &&
          retryAfter > 0
        ) {
          if (retryAfter > 30) retries = 2;
          else retryDelay = retryAfter * 1000;
        }
        throw error;
      }
      if (
        response.headers.get("content-type")?.split(";", 1)[0] !==
        "text/event-stream"
      )
        throw new ContractValidationError();
      options.onConnected?.();
      for await (const message of frames(response, options, readProgress)) {
        if (message.type === "RUN_EVENT") {
          const event = message.record.event;
          const prior = seen.get(event.attemptId);
          if (
            prior &&
            prior.cursor === message.record.cursor &&
            prior.sequence === event.sequence &&
            prior.eventId === event.eventId
          )
            continue;
          if (prior && event.sequence !== prior.sequence + 1)
            throw new StreamGap();
          if (!prior && seen.size >= 10) throw new StreamGap();
          seen.set(event.attemptId, {
            sequence: event.sequence,
            eventId: event.eventId,
            cursor: message.record.cursor,
          });
          cursor = message.record.cursor;
        }
        yield message;
        if (message.type === "STREAM_RESET") return;
      }
      // The server intentionally rotates healthy connections at thirty seconds.
      if (Date.now() - started >= 20_000) retries = 0;
      else throw new StreamInterrupted();
    } catch (error) {
      requireCurrent(options);
      if (
        error instanceof ContractValidationError ||
        error instanceof StreamGap ||
        (error instanceof ApiError &&
          error.status !== 429 &&
          error.status < 500)
      )
        throw error;
      if (!(
        error instanceof TypeError ||
        error instanceof StreamInterrupted ||
        error instanceof ApiError ||
        (error instanceof DOMException && error.name === "AbortError")
      ))
        throw error;
      if (retries >= 2) throw error;
      retries += 1;
    } finally {
      clearTimeout(timeout);
      clearTimeout(idleTimeout);
      options.signal.removeEventListener("abort", abort);
      controller.abort();
    }
    options.onReconnect?.();
    await wait(retryDelay, options);
  }
}
