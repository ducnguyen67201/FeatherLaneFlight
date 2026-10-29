import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  ContractValidationError,
  getRunDetailOptions,
  runEventMessages,
  requireClientCurrent,
  StreamGap,
  type RunDetail,
} from "@featherlane/contracts";
import {
  detailPrefix,
  headers,
  optionsQueryPrefix,
  canRefreshAutomatically,
  runsQueryPrefix,
  type RunTransport,
} from "./queries";

export type LiveConnection =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "recovering"
  | "paused"
  | "invalid"
  | "snapshot";

// Connection/freshness only. Run and evaluation state always come from Query.
export function useRunLiveUpdates(
  runId: string,
  transport: RunTransport | undefined,
  snapshot: RunDetail | undefined,
  onAccessFailure: (status: 401 | 403 | 404) => void,
) {
  const queries = useQueryClient();
  const [connection, setConnection] = useState<LiveConnection>("connecting");
  const [revision, setRevision] = useState(0);
  const latest = useRef({ transport, snapshot, onAccessFailure });
  latest.current = { transport, snapshot, onAccessFailure };
  const client = transport?.client;
  const projectId = transport?.projectId;
  const organizationId = transport?.organizationId;
  const ready = !!snapshot && snapshot.projectId === projectId;
  const terminal =
    !!snapshot &&
    ["COMPLETED", "CANCELED", "ERROR"].includes(snapshot.executionState);

  useEffect(() => {
    const current = latest.current.transport;
    const snapshot = latest.current.snapshot;
    if (!current || !snapshot || !ready) return;
    const initialCursor = snapshot.serverEventCursor;
    const streamClient = current.client;
    const streamProject = current.projectId;
    if (terminal) {
      setConnection("snapshot");
      return;
    }
    const controller = new AbortController();
    let invalidation: ReturnType<typeof setTimeout> | undefined;
    const isCurrent = () => {
      if (controller.signal.aborted) return false;
      try {
        requireClientCurrent(streamClient);
        return true;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          throw error;
        controller.abort();
        return false;
      }
    };
    const invalidate = () => {
      if (!isCurrent()) return;
      // Coalesce event bursts; inactive pages are marked stale, not fetched.
      invalidation ??= setTimeout(() => {
        invalidation = undefined;
        if (!isCurrent()) return;
        for (const prefix of [
          detailPrefix(runId, current),
          runsQueryPrefix(current),
          optionsQueryPrefix(current),
        ])
          void queries.invalidateQueries(
            {
              queryKey: prefix,
              predicate: (query) => canRefreshAutomatically(query.state.error),
            },
            { cancelRefetch: false },
          );
      }, 250);
    };
    setConnection("connecting");
    async function listen() {
      let cursor = initialCursor;
      let recovered = false;
      for (;;) {
        try {
          let reset = false;
          for await (const message of runEventMessages({
            client: streamClient,
            origin: window.location.origin,
            runId,
            after: cursor,
            signal: controller.signal,
            isCurrent,
            onAccessFailure: (status) => {
              if (!isCurrent()) return;
              controller.abort();
              latest.current.onAccessFailure(status);
            },
            onConnected: () => {
              if (isCurrent()) setConnection("connected");
            },
            onReconnect: () => {
              if (isCurrent()) setConnection("reconnecting");
            },
          })) {
            if (!isCurrent()) return;
            if (message.type === "STREAM_RESET") {
              reset = true;
              break;
            }
            // No event payload is inserted into any resource cache.
            invalidate();
          }
          if (!reset) return;
        } catch (error) {
          if (
            !isCurrent() ||
            (error instanceof DOMException && error.name === "AbortError")
          )
            return;
          if (error instanceof ContractValidationError) {
            setConnection("invalid");
            return;
          }
          if (!(
            error instanceof StreamGap ||
            (error instanceof ApiError &&
              error.status === 410 &&
              error.detail.code === "CURSOR_EXPIRED")
          )) {
            setConnection("paused");
            return;
          }
        }
        // One automatic snapshot recovery per subscription; repeated resets need
        // an explicit refresh rather than an unbounded reconnect loop.
        if (recovered || !isCurrent()) {
          if (isCurrent()) setConnection("paused");
          return;
        }
        recovered = true;
        setConnection("recovering");
        try {
          const result = await queries.fetchQuery({
            ...getRunDetailOptions(
              { client: streamClient, path: { runId }, headers },
              detailPrefix(runId, current),
            ),
            staleTime: 0,
          });
          if (!isCurrent()) return;
          if (result.data.projectId !== streamProject)
            throw new ContractValidationError();
          cursor = result.data.serverEventCursor;
          invalidate();
        } catch (error) {
          if (!isCurrent()) return;
          if (
            error instanceof ApiError &&
            (error.status === 401 ||
              error.status === 403 ||
              error.status === 404)
          ) {
            controller.abort();
            latest.current.onAccessFailure(error.status);
          } else
            setConnection(
              error instanceof ContractValidationError ? "invalid" : "paused",
            );
          return;
        }
      }
    }
    void listen();
    return () => {
      controller.abort();
      clearTimeout(invalidation);
    };
  }, [
    queries,
    client,
    organizationId,
    projectId,
    runId,
    ready,
    terminal,
    revision,
  ]);

  return { connection, restart: () => setRevision((value) => value + 1) };
}
