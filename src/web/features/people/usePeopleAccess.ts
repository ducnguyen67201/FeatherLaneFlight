import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, type createValidatedClient } from "@featherlane/contracts";
import type { AccessPagination } from "./AccessSection";
import { usePeopleQueries } from "./usePeopleQueries";
import { usePeopleMutations } from "./usePeopleMutations";

export type PeopleAccessProps = {
  userId: string;
  organizationId: string;
  csrfToken: string;
  client: ReturnType<typeof createValidatedClient>;
  cacheScope: readonly unknown[];
  onAccessFailure: (status: 401 | 403 | 404) => void;
};

function pagination(
  page: { previous?: () => void; next: (cursor: string) => void },
  nextCursor: string | null | undefined,
  pending: boolean,
): AccessPagination {
  return {
    onPrevious: page.previous,
    onNext: nextCursor ? () => page.next(nextCursor) : undefined,
    pending,
  };
}

// AuthBoundary keys this controller by session epoch; its parent also keys org.
// Query objects stay here. Presentation receives only records and named actions.
export function usePeopleAccess(props: PeopleAccessProps) {
  const { userId, organizationId, client, cacheScope, onAccessFailure } = props;
  const queryClient = useQueryClient();
  const [scope] = useState<readonly unknown[]>(() => [
    ...cacheScope,
    userId,
    "people-access",
    organizationId,
  ]);
  const [blocked, setBlocked] = useState(false);
  const queries = usePeopleQueries({
    userId,
    organizationId,
    client,
    scope,
    blocked,
  });
  const active = useRef(true);
  const generation = useRef(0);
  const recoveryGeneration = useRef(0);
  const failed = useRef(false);
  const owner = useRef(false);
  owner.current = queries.owner && !blocked;
  const failureHandler = useRef(onAccessFailure);
  failureHandler.current = onAccessFailure;
  const hadOwnership = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current += 1;
      recoveryGeneration.current += 1;
      void queryClient.cancelQueries({ queryKey: scope });
      queryClient.removeQueries({ queryKey: scope });
    };
  }, [queryClient, scope]);

  useEffect(() => {
    if (hadOwnership.current && !queries.owner) {
      generation.current += 1;
      const admin = [...scope, "admin"];
      void queryClient.cancelQueries({ queryKey: admin });
      queryClient.removeQueries({ queryKey: admin });
    }
    hadOwnership.current = queries.owner;
  }, [queries.owner, queryClient, scope]);

  async function accessFailure(error: unknown) {
    if (
      !(error instanceof ApiError) ||
      ![401, 403, 404].includes(error.status) ||
      failed.current ||
      !active.current
    )
      return;
    failed.current = true;
    const recovery = ++recoveryGeneration.current;
    owner.current = false;
    generation.current += 1;
    setBlocked(true);
    await queryClient.cancelQueries({ queryKey: scope });
    if (!active.current || recoveryGeneration.current !== recovery) return;
    queryClient.removeQueries({ queryKey: scope });
    if (error.status === 401 || error.status === 403 || error.status === 404)
      failureHandler.current(error.status);
  }
  const adminQueries = [
    queries.people,
    queries.emails,
    queries.domains,
    queries.exclusions,
    queries.projects,
  ];
  const error =
    queries.overview.error ??
    queries.allowedProjects.error ??
    (queries.owner
      ? (adminQueries.find((query) => query.error)?.error ??
        queries.projectPeople.error)
      : null);
  useEffect(() => {
    void accessFailure(error);
  }, [error]);
  const mutations = usePeopleMutations({
    ...props,
    scope,
    captureAccess: () => {
      const captured = generation.current;
      return () =>
        active.current && owner.current && generation.current === captured;
    },
    onFailure: accessFailure,
  });
  function retry() {
    generation.current += 1;
    recoveryGeneration.current += 1;
    failed.current = false;
    setBlocked(false);
    void queryClient.resetQueries({ queryKey: scope });
  }
  const loading =
    !blocked &&
    !error &&
    (queries.overview.isPending ||
      (queries.overview.isSuccess && queries.allowedProjects.isPending) ||
      (queries.owner &&
        (adminQueries.some((query) => query.isPending) ||
          (queries.project !== null && queries.projectPeople.isPending))));
  const showAdmin = queries.owner && !blocked && !error && !loading;
  return {
    access: !blocked && !error ? (queries.overview.data?.data ?? null) : null,
    loading,
    error: blocked || Boolean(error),
    accessRevoked:
      blocked ||
      (error instanceof ApiError && [401, 403, 404].includes(error.status)) ||
      (queries.overview.isSuccess &&
        queries.overview.data.data.owner?.id !== userId),
    people: showAdmin ? (queries.people.data?.data ?? []) : [],
    emails: showAdmin ? (queries.emails.data?.data ?? []) : [],
    domains: showAdmin ? (queries.domains.data?.data ?? []) : [],
    exclusions: showAdmin ? (queries.exclusions.data?.data ?? []) : [],
    projects: showAdmin ? (queries.projects.data?.data ?? []) : [],
    project: showAdmin ? queries.project : null,
    projectPeople: showAdmin ? (queries.projectPeople.data?.data ?? []) : [],
    allowedProjects:
      !blocked && !error ? (queries.allowedProjects.data?.data ?? []) : [],
    pagination: {
      people: pagination(
        queries.pages.people,
        queries.people.data?.meta.nextCursor,
        queries.people.isFetching,
      ),
      emails: pagination(
        queries.pages.emails,
        queries.emails.data?.meta.nextCursor,
        queries.emails.isFetching,
      ),
      domains: pagination(
        queries.pages.domains,
        queries.domains.data?.meta.nextCursor,
        queries.domains.isFetching,
      ),
      exclusions: pagination(
        queries.pages.exclusions,
        queries.exclusions.data?.meta.nextCursor,
        queries.exclusions.isFetching,
      ),
      projects: pagination(
        queries.pages.projects,
        queries.projects.data?.meta.nextCursor,
        queries.projects.isFetching,
      ),
      projectPeople: pagination(
        queries.pages.projectPeople,
        queries.projectPeople.data?.meta.nextCursor,
        queries.projectPeople.isFetching,
      ),
    },
    chooseProject: queries.chooseProject,
    retry,
    ...mutations,
  };
}
