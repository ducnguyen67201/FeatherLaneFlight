export function peoplePath(organizationId: string): string {
  return `/settings/orgs/${encodeURIComponent(organizationId)}/people`;
}

export function peopleOrganization(path: string): string | null {
  return (
    /^\/settings\/orgs\/([A-Za-z0-9_-]{1,128})\/people\/?$/.exec(path)?.[1] ??
    null
  );
}
