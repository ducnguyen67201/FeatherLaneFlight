import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRunArtifactsOptions,
  getRunDetailOptions,
  getRunEventsOptions,
} from "@featherlane/contracts";
import { runDetailDemo } from "../../mocks/browser";
import { detailModes, type DetailMode } from "../../mocks/runDetailDemo";
import { demoScope, headers, runsPrefix } from "./queries";

export const detailPrefix = (runId: string) => [
  demoScope.epoch,
  demoScope.organizationId,
  demoScope.projectId,
  "run-detail",
  runId,
];
export function useRunDetail(runId: string, tab: number) {
  const client = useQueryClient();
  const [mode, setMode] = useState<DetailMode>(() => runDetailDemo.mode(runId));
  const [changing, setChanging] = useState(false);
  const scope = detailPrefix(runId);
  const detail = useQuery({
    ...getRunDetailOptions({ path: { runId }, headers }, scope),
    refetchOnWindowFocus: false,
  });
  const events = useQuery({
    ...getRunEventsOptions(
      { path: { runId }, headers, query: { limit: 100 } },
      scope,
    ),
    enabled: !!detail.data && tab === 1,
    refetchOnWindowFocus: false,
  });
  const artifacts = useQuery({
    ...getRunArtifactsOptions({ path: { runId }, headers }, scope),
    enabled: !!detail.data && tab === 3,
    refetchOnWindowFocus: false,
  });
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: scope }),
      client.invalidateQueries({ queryKey: runsPrefix }),
    ]);
  };
  async function chooseMode(value: string) {
    const next = detailModes.find((item) => item === value);
    if (!next || changing) return;
    setChanging(true);
    try {
      if (next === "Stale view") {
        runDetailDemo.setMode(runId, "Running");
        await client.resetQueries({ queryKey: scope });
        if (
          !client.getQueryData(
            getRunDetailOptions({ path: { runId }, headers }, scope).queryKey,
          )
        )
          return;
      }
      runDetailDemo.setMode(runId, next);
      setMode(next);
      if (next === "Stale view") await invalidate();
      else {
        await client.resetQueries({ queryKey: scope });
        await client.invalidateQueries({ queryKey: runsPrefix });
      }
    } finally {
      setChanging(false);
    }
  }
  async function refresh() {
    runDetailDemo.recoverRead(runId);
    setMode(runDetailDemo.mode(runId));
    await invalidate();
  }
  return { detail, events, artifacts, mode, changing, chooseMode, refresh };
}
