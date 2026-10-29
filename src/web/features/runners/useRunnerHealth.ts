import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  contractManifest,
  createRunnerEnrollment,
  listRunnersOptions,
  revokeRunner,
  type RunnerSummary,
} from "@featherlane/contracts";
import type { ProjectAccessProps } from "../projects/useProjectAccess";

export function useRunnerHealth(props: ProjectAccessProps, projectId: string) {
  const queryClient = useQueryClient();
  const prefix = [...props.cacheScope, props.userId, "runners", projectId];
  const headers = {
    "x-flf-contract-version": contractManifest.contractVersion,
  };
  const [cursorPages, setCursorPages] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const current = useRef(true);
  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);
  const query = useQuery({
    ...listRunnersOptions(
      {
        client: props.client,
        path: { projectId },
        headers,
        query: { limit: 25, cursor: cursorPages[page] },
      },
      prefix,
    ),
    enabled: !blocked,
    refetchInterval: 10000,
  });
  const enrollment = useMutation({
    mutationFn: createRunnerEnrollment,
    retry: false,
    gcTime: 0,
  });
  const revocation = useMutation({
    mutationFn: revokeRunner,
    retry: false,
    gcTime: 0,
  });
  async function handleAccess(error: unknown) {
    if (!(error instanceof ApiError) || ![401, 403, 404].includes(error.status))
      return;
    setBlocked(true);
    enrollment.reset();
    revocation.reset();
    await queryClient.cancelQueries({ queryKey: prefix });
    queryClient.removeQueries({ queryKey: prefix });
    if (error.status === 401 || error.status === 403 || error.status === 404)
      props.onAccessFailure(error.status);
  }
  useEffect(() => {
    void handleAccess(query.error);
  }, [query.error]);
  async function createGrant(name: string, key: string) {
    if (blocked || enrollment.isPending || !current.current)
      throw new Error("Runner access is unavailable.");
    try {
      const result = await enrollment.mutateAsync({
        client: props.client,
        path: { projectId },
        headers: {
          ...headers,
          "x-csrf-token": props.csrfToken,
          "idempotency-key": key,
        },
        body: { displayName: name },
      });
      enrollment.reset();
      if (!current.current)
        throw new DOMException("Project changed.", "AbortError");
      return result.data;
    } catch (error) {
      enrollment.reset();
      await handleAccess(error);
      throw error;
    }
  }
  async function revoke(runner: RunnerSummary) {
    if (blocked || revocation.isPending || runner.projectId !== projectId)
      throw new Error("Runner access is unavailable.");
    try {
      await revocation.mutateAsync({
        client: props.client,
        path: { runnerId: runner.id },
        headers: { ...headers, "x-csrf-token": props.csrfToken },
      });
      revocation.reset();
      if (current.current)
        await queryClient.invalidateQueries({ queryKey: prefix });
    } catch (error) {
      revocation.reset();
      await handleAccess(error);
      throw error;
    }
  }
  function next() {
    const cursor = query.data?.meta.nextCursor;
    if (!cursor) return;
    setCursorPages((pages) => [...pages.slice(0, page + 1), cursor]);
    setPage(page + 1);
  }
  return {
    runners: blocked ? [] : (query.data?.data ?? []),
    loading: query.isPending,
    error: query.error,
    blocked,
    retry: () => {
      setBlocked(false);
      void query.refetch();
    },
    refresh: () => query.refetch(),
    createGrant,
    revoke,
    revoking: revocation.isPending,
    page,
    previous: () => setPage(Math.max(0, page - 1)),
    next: query.data?.meta.nextCursor ? next : undefined,
  };
}
