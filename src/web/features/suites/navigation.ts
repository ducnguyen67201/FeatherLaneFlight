export function suitePath(
  organizationId: string,
  projectId: string,
  revisionId?: string,
): string {
  const query = new URLSearchParams({ organizationId, projectId });
  const path = revisionId
    ? `/suites/${encodeURIComponent(revisionId)}`
    : "/suites";
  return `${path}?${query}`;
}
