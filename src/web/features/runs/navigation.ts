export function runsPath(
  organizationId: string,
  projectId: string,
  runId?: string,
) {
  return `${runId ? `/runs/${encodeURIComponent(runId)}` : "/runs"}?${new URLSearchParams({ organizationId, projectId })}`;
}
