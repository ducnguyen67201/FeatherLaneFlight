import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  cancelRunMutation,
  type RunSummary,
} from "@featherlane/contracts";
import { demoRunTransport, headers, runsQueryPrefix } from "./queries";
import { detailPrefix } from "./useRunDetail";

export function useRunCancellation(
  runId: string,
  transport = demoRunTransport,
) {
  const client = useQueryClient();
  const mutation = useMutation(cancelRunMutation());
  const key = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [receipt, setReceipt] = useState<RunSummary | null>(null);
  const rejected =
    mutation.error instanceof ApiError &&
    mutation.error.status === 409 &&
    mutation.error.detail.code === "VALIDATION_FAILED";
  const uncertain = mutation.isError && !rejected;
  async function request() {
    if (inFlight.current) return;
    inFlight.current = true;
    key.current ??= crypto.randomUUID();
    try {
      const result = await mutation.mutateAsync({
        client: transport.client,
        path: { runId },
        headers: {
          ...headers,
          "x-csrf-token": transport.csrfToken,
          "idempotency-key": key.current,
        },
        body: { schemaVersion: 1 },
      });
      setReceipt(result.data);
      key.current = null;
      await Promise.all([
        client.invalidateQueries({ queryKey: detailPrefix(runId, transport) }),
        client.invalidateQueries({ queryKey: runsQueryPrefix(transport) }),
      ]);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403 || error.status === 404)
      )
        transport.onAccessFailure(error.status);
      // Retain the same key for an uncertain replay.
    } finally {
      inFlight.current = false;
    }
  }
  function reset() {
    if (!inFlight.current) {
      key.current = null;
      setReceipt(null);
      mutation.reset();
    }
  }
  return {
    request,
    reset,
    pending: mutation.isPending,
    error: mutation.error,
    uncertain,
    receipt,
  };
}
