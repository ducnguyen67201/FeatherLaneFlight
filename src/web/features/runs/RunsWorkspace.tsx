import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { RunsPage, initialRunsListContext } from "./RunsPage";
import { runsPath } from "./navigation";
import type { RunTransport } from "./queries";
import { RunDetailPage } from "./RunDetailPage";

function selectedRun() {
  const match = window.location.pathname.match(/^\/runs\/([^/]+)\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
export function RunsWorkspace({
  transport,
  projectName,
  projectSelector,
  userMenu,
}: {
  transport?: RunTransport;
  projectName?: string;
  projectSelector?: ReactNode;
  userMenu?: ReactNode;
}) {
  const listHref = transport
    ? runsPath(transport.organizationId, transport.projectId)
    : "/runs";
  const detailHref = (id: string) =>
    transport
      ? runsPath(transport.organizationId, transport.projectId, id)
      : `/runs/${encodeURIComponent(id)}`;
  const lastOpened = useRef<string | null>(selectedRun());
  const [listContext, setListContext] = useState(initialRunsListContext);
  const [runId, setRunId] = useState(selectedRun);
  useEffect(() => {
    const update = () => setRunId(selectedRun());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function follow(event: MouseEvent, path: string) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    window.history.pushState(null, "", path);
    setRunId(selectedRun());
  }
  function followRunsLink(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const link = event.target.closest("a");
    if (
      link &&
      !link.target &&
      link.origin === window.location.origin &&
      link.pathname === "/runs"
    )
      follow(event, listHref);
  }
  return (
    <div onClick={followRunsLink}>
      {runId ? (
        <RunDetailPage
          key={runId}
          runId={runId}
          transport={transport}
          projectName={projectName}
          projectSelector={projectSelector}
          userMenu={userMenu}
          listHref={listHref}
          onBack={(event) => follow(event, listHref)}
        />
      ) : (
        <RunsPage
          transport={transport}
          projectName={projectName}
          projectSelector={projectSelector}
          userMenu={userMenu}
          returnFocusRunId={lastOpened.current}
          listContext={listContext}
          setListContext={setListContext}
          onOpen={(event, id) => {
            lastOpened.current = id;
            follow(event, detailHref(id));
          }}
        />
      )}
    </div>
  );
}
