import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  contractManifest,
  getOrganizationAccessOptions,
  listOrganizationPeopleOptions,
  listEmailGrantsOptions,
  listDomainRulesOptions,
  listJoinExclusionsOptions,
  listManagedProjectsOptions,
  listProjectPeopleOptions,
  listProjectsOptions,
  type createValidatedClient,
} from "@featherlane/contracts";

function useCursorPage() {
  const [history, setHistory] = useState<(string | null)[]>([null]);
  return {
    cursor: history.at(-1) ?? null,
    previous:
      history.length > 1
        ? () => setHistory((values) => values.slice(0, -1))
        : undefined,
    next: (cursor: string) => setHistory((values) => [...values, cursor]),
    reset: () => setHistory([null]),
  };
}

type Props = {
  userId: string;
  organizationId: string;
  client: ReturnType<typeof createValidatedClient>;
  scope: readonly unknown[];
  blocked: boolean;
};

// Query composition and bounded cursor navigation stay separate from auth/mutations.
export function usePeopleQueries({
  userId,
  organizationId,
  client,
  scope,
  blocked,
}: Props) {
  const headers = {
    "x-flf-contract-version": contractManifest.contractVersion,
  };
  const path = { orgId: organizationId };
  const adminScope = [...scope, "admin"];
  const overview = useQuery({
    ...getOrganizationAccessOptions({ client, headers, path }, scope),
    enabled: !blocked,
    refetchInterval: 30000,
  });
  const owner =
    !blocked && !overview.error && overview.data?.data.owner?.id === userId;
  const peoplePage = useCursorPage();
  const emailPage = useCursorPage();
  const domainPage = useCursorPage();
  const exclusionPage = useCursorPage();
  const projectPage = useCursorPage();
  const projectPeoplePage = useCursorPage();
  const people = useQuery({
    ...listOrganizationPeopleOptions(
      {
        client,
        headers,
        path,
        query: { limit: 50, cursor: peoplePage.cursor },
      },
      adminScope,
    ),
    enabled: owner,
    placeholderData: keepPreviousData,
  });
  const emails = useQuery({
    ...listEmailGrantsOptions(
      { client, headers, path, query: { limit: 50, cursor: emailPage.cursor } },
      adminScope,
    ),
    enabled: owner,
    placeholderData: keepPreviousData,
  });
  const domains = useQuery({
    ...listDomainRulesOptions(
      {
        client,
        headers,
        path,
        query: { limit: 50, cursor: domainPage.cursor },
      },
      adminScope,
    ),
    enabled: owner,
    placeholderData: keepPreviousData,
  });
  const exclusions = useQuery({
    ...listJoinExclusionsOptions(
      {
        client,
        headers,
        path,
        query: { limit: 50, cursor: exclusionPage.cursor },
      },
      adminScope,
    ),
    enabled: owner,
    placeholderData: keepPreviousData,
  });
  const projects = useQuery({
    ...listManagedProjectsOptions(
      {
        client,
        headers,
        path,
        query: { limit: 50, cursor: projectPage.cursor },
      },
      adminScope,
    ),
    enabled: owner,
    placeholderData: keepPreviousData,
  });
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const project =
    projects.data?.data.find((item) => item.id === projectChoice) ??
    projects.data?.data[0] ??
    null;
  const projectPeople = useQuery({
    ...listProjectPeopleOptions(
      {
        client,
        headers,
        path: { ...path, projectId: project?.id ?? "unselected" },
        query: { limit: 50, cursor: projectPeoplePage.cursor },
      },
      adminScope,
    ),
    enabled: owner && project !== null,
    meta: { projectId: project?.id },
    placeholderData: (previous, previousQuery) =>
      previousQuery?.meta?.projectId === project?.id ? previous : undefined,
  });
  // Sidebar discovery still requires explicit project grants. Admin metadata is
  // never used as proof that an owner may open a project's resources.
  const allowedProjects = useQuery({
    ...listProjectsOptions({ client, headers, path, query: { limit: 100 } }, [
      ...scope,
      "sidebar",
    ]),
    enabled: !blocked && !overview.error && overview.isSuccess,
  });
  function chooseProject(id: string) {
    projectPeoplePage.reset();
    setProjectChoice(id);
  }
  function previousProjects() {
    projectPage.previous?.();
    projectPeoplePage.reset();
    setProjectChoice(null);
  }
  function nextProjects(cursor: string) {
    projectPage.next(cursor);
    projectPeoplePage.reset();
    setProjectChoice(null);
  }
  return {
    overview,
    owner,
    people,
    emails,
    domains,
    exclusions,
    projects,
    projectPeople,
    project,
    allowedProjects,
    chooseProject,
    pages: {
      people: peoplePage,
      emails: emailPage,
      domains: domainPage,
      exclusions: exclusionPage,
      projects: {
        ...projectPage,
        previous: projectPage.previous ? previousProjects : undefined,
        next: nextProjects,
      },
      projectPeople: projectPeoplePage,
    },
  };
}
