import type { ZodType } from "zod";
import type { Client } from "./generated/client";
import type { ArtifactView } from "./generated/types.gen";
import {
  binaryTransportPolicies,
  contractManifest,
} from "./generated/policy.gen";
import {
  zArtifactView,
  zDownloadArtifactPath,
  zErrorEnvelope,
} from "./generated/zod.gen";
import {
  ApiError,
  ContractValidationError,
  requireClientCurrent,
  validateResult,
} from "./transport";

export type ArtifactDownloadOptions = {
  client: Client;
  origin: string;
  artifact: ArtifactView;
  signal: AbortSignal;
  isCurrent: () => boolean;
  onAccessFailure: (status: 401 | 403) => void;
};

function requireCurrent(options: ArtifactDownloadOptions) {
  requireClientCurrent(options.client);
  if (options.signal.aborted || !options.isCurrent())
    throw new DOMException("The download context changed.", "AbortError");
}

async function readBytes(
  response: Response,
  limit: number,
  options: ArtifactDownloadOptions,
  exact = false,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    if (exact && limit === 0) return new Uint8Array(0);
    throw new ContractValidationError();
  }
  const bytes = new Uint8Array(limit);
  let size = 0;
  let failed = false;
  try {
    for (;;) {
      const next = await reader.read();
      requireCurrent(options);
      if (next.done) break;
      if (size + next.value.length > limit) throw new ContractValidationError();
      bytes.set(next.value, size);
      size += next.value.length;
    }
    if (exact && size !== limit) throw new ContractValidationError();
    return bytes.slice(0, size);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await reader.cancel();
    } catch (error) {
      if (!failed) throw error;
    } finally {
      reader.releaseLock();
    }
  }
}

/** One bounded binary operation; JSON SDK interceptors never consume this body. */
export async function readArtifactContent(
  options: ArtifactDownloadOptions,
): Promise<{ blob: Blob; filename: string }> {
  requireCurrent(options);
  const parsed = zArtifactView.safeParse(options.artifact);
  if (!parsed.success) throw new ContractValidationError();
  const artifact = parsed.data;
  if (
    artifact.verificationState !== "VERIFIED" ||
    artifact.availability !== "AVAILABLE" ||
    artifact.byteLength === null ||
    artifact.sha256 === null ||
    artifact.expiresAt === null ||
    Date.parse(artifact.expiresAt) <= Date.now() ||
    artifact.byteLength > 104_857_600
  )
    throw new Error("This evidence is not available for download.");
  const path = zDownloadArtifactPath.safeParse({ artifactId: artifact.id });
  if (!path.success) throw new ContractValidationError();
  const origin = new URL(options.origin);
  const config = options.client.getConfig();
  if (
    origin.origin !== options.origin ||
    (config.baseUrl &&
      new URL(config.baseUrl, origin).origin !== origin.origin) ||
    (typeof window !== "undefined" && window.location.origin !== origin.origin)
  )
    throw new Error("Evidence downloads must use the application origin.");
  const policy = binaryTransportPolicies.downloadArtifact;
  const url = new URL(
    policy.path.replace(
      "{artifactId}",
      encodeURIComponent(path.data.artifactId),
    ),
    origin,
  );
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 60_000);
  try {
    requireCurrent(options);
    const response = await (config.fetch ?? globalThis.fetch)(url, {
      method: policy.method,
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: artifact.mediaType,
        "x-flf-contract-version": contractManifest.contractVersion,
      },
    });
    requireCurrent(options);
    if (response.status !== 200) {
      const responses: Readonly<Record<string, ZodType | null>> =
        policy.responses;
      const validator = responses[String(response.status)];
      if (
        !validator ||
        response.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
          "application/json"
      ) {
        await response.body?.cancel();
        throw new ContractValidationError();
      }
      const bytes = await readBytes(response, 65_536, options);
      let payload: unknown;
      try {
        payload = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        throw new ContractValidationError();
      }
      const validated = validateResult(
        validator,
        payload,
        response,
        options.client,
      );
      const envelope = zErrorEnvelope.safeParse(validated);
      if (!envelope.success) throw new ContractValidationError();
      const error = new ApiError(response.status, envelope.data.error);
      if (response.status === 401 || response.status === 403)
        options.onAccessFailure(response.status);
      throw error;
    }
    const disposition =
      /^attachment;\s*filename="([A-Za-z0-9][A-Za-z0-9._-]{0,100})"$/i.exec(
        response.headers.get("content-disposition") ?? "",
      );
    const length = response.headers.get("content-length");
    if (
      !disposition?.[1] ||
      length !== String(artifact.byteLength) ||
      response.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
        artifact.mediaType ||
      response.headers.get("x-content-type-options") !== "nosniff"
    ) {
      await response.body?.cancel();
      throw new ContractValidationError();
    }
    const bytes = await readBytes(response, artifact.byteLength, options, true);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    requireCurrent(options);
    if (controller.signal.aborted)
      throw new DOMException("The download timed out.", "AbortError");
    const actual = Array.from(new Uint8Array(hash), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    if (
      actual !== artifact.sha256 ||
      Date.parse(artifact.expiresAt) <= Date.now()
    )
      throw new ContractValidationError();
    return {
      blob: new Blob([bytes], { type: artifact.mediaType }),
      filename: disposition[1],
    };
  } finally {
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", abort);
    controller.abort();
  }
}
