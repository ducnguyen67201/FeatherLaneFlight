import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getRunArtifacts,
  getRunArtifactsOptions,
  readArtifactContent,
  requireClientCurrent,
  type ArtifactListEnvelope,
  type ArtifactView,
} from "@featherlane/contracts";
import {
  canRefreshAutomatically,
  detailPrefix,
  headers,
  type RunTransport,
} from "./queries";

type Options = {
  runId: string;
  transport: RunTransport | undefined;
  artifacts: ArtifactView[];
  accessLost: boolean;
  snapshotVersion: number;
  onAccessFailure: (status: 401 | 403 | 404) => void;
};

export function useEvidenceDownloads(options: Options) {
  const queries = useQueryClient();
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<AbortController | null>(null);
  const { runId, transport, accessLost, snapshotVersion } = options;

  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [
      runId,
      transport?.client,
      transport?.organizationId,
      transport?.projectId,
      accessLost,
    ],
  );

  useEffect(() => {
    if (!transport || accessLost || !snapshotVersion) return;
    // Evidence can finish or expire without a runner event. Reuse P15's
    // snapshot cadence; inactive metadata queries are only marked stale.
    void queries.invalidateQueries(
      {
        queryKey: getRunArtifactsOptions(
          { client: transport.client, path: { runId }, headers },
          detailPrefix(runId, transport),
        ).queryKey,
        predicate: (query) => canRefreshAutomatically(query.state.error),
      },
      { cancelRefetch: false },
    );
  }, [
    queries,
    runId,
    transport?.client,
    transport?.organizationId,
    transport?.projectId,
    accessLost,
    snapshotVersion,
  ]);

  async function download(artifact: ArtifactView) {
    const start = latest.current;
    const transport = start.transport;
    if (!transport || start.accessLost || active.current)
      throw new Error("Evidence download is unavailable.");
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(60_000),
    ]);
    active.current = controller;
    const scopeCurrent = () => {
      const current = latest.current;
      return (
        !signal.aborted &&
        !current.accessLost &&
        current.runId === start.runId &&
        current.transport?.client === transport.client &&
        current.transport.organizationId === transport.organizationId &&
        current.transport.projectId === transport.projectId
      );
    };
    const requireCurrent = () => {
      requireClientCurrent(transport.client);
      if (!scopeCurrent())
        throw new DOMException("The download context changed.", "AbortError");
    };
    const query = getRunArtifactsOptions(
      { client: transport.client, path: { runId: start.runId }, headers },
      detailPrefix(start.runId, transport),
    );
    try {
      // Revalidate availability and membership before reading private bytes.
      let page: ArtifactListEnvelope;
      try {
        page = await queries.fetchQuery({
          ...query,
          staleTime: 0,
          queryFn: ({ signal: querySignal }) =>
            getRunArtifacts({
              client: transport.client,
              path: { runId: start.runId },
              headers,
              signal: AbortSignal.any([querySignal, signal]),
            }),
        });
      } catch (error) {
        if (
          scopeCurrent() &&
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403 || error.status === 404)
        )
          latest.current.onAccessFailure(error.status);
        throw error;
      }
      requireCurrent();
      const fresh = page.data.find(
        (item) =>
          item.id === artifact.id &&
          item.attemptId === artifact.attemptId &&
          item.trialId === artifact.trialId,
      );
      if (!fresh) throw new Error("The file is no longer available.");
      const result = await readArtifactContent({
        client: transport.client,
        origin: window.location.origin,
        artifact: fresh,
        signal,
        isCurrent: () =>
          scopeCurrent() &&
          latest.current.artifacts.some(
            (item) =>
              item.id === fresh.id &&
              item.sha256 === fresh.sha256 &&
              item.verificationState === "VERIFIED" &&
              item.availability === "AVAILABLE",
          ),
        onAccessFailure: (status) => {
          if (scopeCurrent()) latest.current.onAccessFailure(status);
        },
      });
      requireCurrent();
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      try {
        requireCurrent();
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (scopeCurrent())
        void queries.invalidateQueries({ queryKey: query.queryKey });
      throw error;
    } finally {
      controller.abort();
      if (active.current === controller) active.current = null;
    }
  }

  return { download };
}
