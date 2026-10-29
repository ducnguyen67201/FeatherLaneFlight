import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { createValidatedClient } from "@featherlane/contracts";
import { SuiteCatalogPage } from "./SuiteCatalogPage";
import { SuiteDetailPage } from "./SuiteDetailPage";
import { useSuiteCatalog } from "./useSuiteCatalog";
import { suitePath } from "./navigation";

function selectedRevision(): string | null {
  const match = window.location.pathname.match(
    /^\/suites\/([A-Za-z0-9_-]+)\/?$/,
  );
  return match?.[1] ?? null;
}
type Props = {
  client: ReturnType<typeof createValidatedClient>;
  cacheScope: readonly unknown[];
  organizationId: string;
  projectId: string;
  projectName: string;
  onAccessFailure: (status: 401 | 403 | 404) => void;
};
export function SuiteWorkspace(props: Props) {
  const [revisionId, setRevisionId] = useState(selectedRevision);
  const lastOpened = useRef<string | null>(null);
  const queries = useSuiteCatalog({ ...props, revisionId });
  const catalogHref = suitePath(props.organizationId, props.projectId);
  const revisionHref = (id: string) =>
    suitePath(props.organizationId, props.projectId, id);
  useEffect(() => {
    const update = () => setRevisionId(selectedRevision());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    if (
      revisionId ||
      queries.list.isPending ||
      queries.list.isFetching ||
      !lastOpened.current
    )
      return;
    (
      document.getElementById(`suite-link-${lastOpened.current}`) ??
      document.getElementById("main")
    )?.focus();
    lastOpened.current = null;
  }, [
    revisionId,
    queries.list.isPending,
    queries.list.isFetching,
    queries.list.data,
  ]);
  function follow(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    window.history.pushState(null, "", path);
    setRevisionId(selectedRevision());
  }
  if (revisionId)
    return (
      <SuiteDetailPage
        projectName={props.projectName}
        catalogHref={catalogHref}
        loading={queries.detail.isPending && !queries.blocked}
        failed={queries.detail.isError || queries.blocked}
        suite={
          queries.detail.isError || queries.blocked
            ? undefined
            : queries.detail.data?.data
        }
        onBack={(event) => {
          if (queries.blocked) queries.retry();
          follow(event, catalogHref);
        }}
        onRetry={queries.retry}
      />
    );
  return (
    <SuiteCatalogPage
      projectName={props.projectName}
      revisionHref={revisionHref}
      rows={
        queries.list.isError || queries.blocked
          ? []
          : (queries.list.data?.data ?? [])
      }
      state={
        queries.list.isError || queries.blocked
          ? "error"
          : queries.list.isPending
            ? "loading"
            : "ready"
      }
      search={queries.filters.search}
      requiredCheck={queries.filters.requiredCheck}
      onSearch={(search) => queries.changeFilters({ search })}
      onCheck={(requiredCheck) => queries.changeFilters({ requiredCheck })}
      onReset={queries.clearFilters}
      onRetry={queries.retry}
      onOpen={(event, id) => {
        lastOpened.current = id;
        follow(event, revisionHref(id));
      }}
      page={queries.filters.page}
      fetching={queries.list.isFetching}
      hasNext={!!queries.list.data?.meta.nextCursor}
      onPrevious={queries.previous}
      onNext={queries.next}
    />
  );
}
