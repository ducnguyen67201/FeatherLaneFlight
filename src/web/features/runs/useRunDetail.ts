import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getRunArtifactsOptions,
  getRunDetailOptions,
  getRunEventsOptions,
  getRunJudgmentsOptions,
} from "@featherlane/contracts";
import { useRunLiveUpdates } from "./useRunLiveUpdates";
import { runDetailDemo } from "../../mocks/browser";
import { detailModes, type DetailMode } from "../../mocks/runDetailDemo";
import {
  demoRunTransport,
  type RunTransport,
  detailPrefix,
  runScope,
  headers,
  runsQueryPrefix,
  permanentReadFailure,
  optionsQueryPrefix,
  canRefreshAutomatically,
} from "./queries";

export { detailPrefix } from "./queries";
export function useRunDetail(
  runId: string,
  tab: number,
  transport?: RunTransport,
) {
  const client = useQueryClient();
  const current = transport ?? demoRunTransport;
  const [mode, setMode] = useState<DetailMode>(() =>
    transport ? "Queued" : runDetailDemo.mode(runId),
  );
  const [accessLost, setAccessLost] = useState(false);
  const [changing, setChanging] = useState(false);
  const scope = detailPrefix(runId, current);
  const detail = useQuery({
    ...getRunDetailOptions(
      { client: current.client, path: { runId }, headers },
      scope,
    ),
    enabled: !accessLost,
    refetchInterval: (query) => {
      const error = query.state.error;
      if (!transport || accessLost || permanentReadFailure(error)) return false;
      const delay =
        error instanceof ApiError && error.retryAt !== null
          ? Math.max(10_000, error.retryAt - Date.now())
          : 10_000;
      return delay <= 60_000 ? delay : false;
    },
    refetchOnWindowFocus: false,
  });
  const events = useQuery({
    ...getRunEventsOptions(
      {
        client: current.client,
        path: { runId },
        headers,
        query: { limit: 100 },
      },
      scope,
    ),
    enabled: !accessLost && !!detail.data && (tab === 0 || tab === 1),
    refetchOnWindowFocus: false,
  });
  const judgments = useQuery({
    ...getRunJudgmentsOptions(
      { client: current.client, path: { runId }, headers },
      scope,
    ),
    enabled: !!transport && !accessLost && !!detail.data,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      !accessLost &&
      !permanentReadFailure(query.state.error) &&
      query.state.data?.data.state === "PENDING"
        ? 10000
        : false,
  });
  const artifacts = useQuery({
    ...getRunArtifactsOptions(
      { client: current.client, path: { runId }, headers },
      scope,
    ),
    enabled: !accessLost && !!detail.data && tab === 3,
    refetchOnWindowFocus: false,
  });
  function denyAccess(status: 401 | 403 | 404) {
    setAccessLost(true);
    void client.cancelQueries({ queryKey: runScope(current) }).then(() => {
      client.removeQueries({ queryKey: runScope(current) });
    });
    transport?.onAccessFailure(status);
  }
  const live = useRunLiveUpdates(
    runId,
    transport,
    accessLost ? undefined : detail.data?.data,
    denyAccess,
  );
  useEffect(() => {
    const error = [
      detail.error,
      events.error,
      artifacts.error,
      judgments.error,
    ].find(
      (item) =>
        item instanceof ApiError && [401, 403, 404].includes(item.status),
    );
    if (
      transport &&
      !accessLost &&
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    )
      denyAccess(error.status);
  }, [
    detail.error,
    events.error,
    artifacts.error,
    judgments.error,
    transport,
    accessLost,
  ]);
  const observed = detail.data?.data;
  useEffect(() => {
    if (!transport || accessLost || !observed) return;
    // Server-only cancellation/expiry can change a snapshot without an event.
    for (const prefix of [
      runsQueryPrefix(transport),
      optionsQueryPrefix(transport),
      getRunJudgmentsOptions(
        { client: transport.client, path: { runId }, headers },
        detailPrefix(runId, transport),
      ).queryKey,
    ])
      void client.invalidateQueries(
        {
          queryKey: prefix,
          predicate: (query) => canRefreshAutomatically(query.state.error),
        },
        { cancelRefetch: false },
      );
  }, [
    client,
    transport?.client,
    transport?.organizationId,
    transport?.projectId,
    runId,
    observed?.executionState,
    observed?.evaluationOutcome,
    observed?.cancellationRequestedAt,
    accessLost,
  ]);
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: scope }),
      client.invalidateQueries({ queryKey: runsQueryPrefix(current) }),
    ]);
  };
  async function chooseMode(value: string) {
    if (transport) return;
    const next = detailModes.find((item) => item === value);
    if (!next || changing) return;
    setChanging(true);
    try {
      if (next === "Stale view") {
        runDetailDemo.setMode(runId, "Running");
        await client.resetQueries({ queryKey: scope });
        if (
          !client.getQueryData(
            getRunDetailOptions(
              { client: current.client, path: { runId }, headers },
              scope,
            ).queryKey,
          )
        )
          return;
      }
      runDetailDemo.setMode(runId, next);
      setMode(next);
      if (next === "Stale view") await invalidate();
      else {
        await client.resetQueries({ queryKey: scope });
        await client.invalidateQueries({ queryKey: runsQueryPrefix(current) });
      }
    } finally {
      setChanging(false);
    }
  }
  async function refresh() {
    if (!transport) {
      runDetailDemo.recoverRead(runId);
      setMode(runDetailDemo.mode(runId));
    }
    await invalidate();
    if (
      client.getQueryState(
        getRunDetailOptions(
          { client: current.client, path: { runId }, headers },
          scope,
        ).queryKey,
      )?.status === "success"
    )
      live.restart();
  }
  return {
    detail,
    events,
    artifacts,
    judgments,
    mode,
    changing,
    chooseMode,
    refresh,
    live,
    accessLost,
    denyAccess,
  };
}
