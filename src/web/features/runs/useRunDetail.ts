import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getRunArtifactsOptions,
  getRunDetailOptions,
  getRunEventsOptions,
} from "@featherlane/contracts";
import { runDetailDemo } from "../../mocks/browser";
import { detailModes, type DetailMode } from "../../mocks/runDetailDemo";
import {
  demoRunTransport,
  type RunTransport,
  runScope,
  headers,
  runsQueryPrefix,
} from "./queries";

export const detailPrefix = (runId: string, transport = demoRunTransport) => [
  ...runScope(transport),
  "run-detail",
  runId,
];
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
  const [changing, setChanging] = useState(false);
  const scope = detailPrefix(runId, current);
  const detail = useQuery({
    ...getRunDetailOptions(
      { client: current.client, path: { runId }, headers },
      scope,
    ),
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
    enabled: !!detail.data && tab === 1,
    refetchOnWindowFocus: false,
  });
  const artifacts = useQuery({
    ...getRunArtifactsOptions(
      { client: current.client, path: { runId }, headers },
      scope,
    ),
    enabled: !!detail.data && tab === 3,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const error = detail.error;
    if (
      transport &&
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    )
      transport.onAccessFailure(error.status);
  }, [detail.error, transport]);
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
  }
  return { detail, events, artifacts, mode, changing, chooseMode, refresh };
}
