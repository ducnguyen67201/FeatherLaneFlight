import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  ApiError,
  contractManifest,
  createProject,
  getProjectOptions,
  getOrganizationAccessOptions,
  listOrganizations,
  listOrganizationsOptions,
  listProjects,
  listProjectsOptions,
  type createValidatedClient,
  type OrganizationListEnvelope,
  type ProjectListEnvelope,
} from "@featherlane/contracts";
import type { WorkspaceDisplayState } from "./ProjectsWorkspace";

export type ProjectAccessProps = {
  userId: string;
  csrfToken: string;
  client: ReturnType<typeof createValidatedClient>;
  cacheScope: readonly unknown[];
  onAccessFailure: (status: 401 | 403 | 404) => void;
};
const initialCursor: string | null = null;

export function useProjectAccess({
  userId,
  csrfToken,
  client,
  cacheScope,
  onAccessFailure,
  initialOrganizationId = null,
  initialProjectId = null,
}: ProjectAccessProps & {
  initialOrganizationId?: string | null;
  initialProjectId?: string | null;
}) {
  const queryClient = useQueryClient();
  const prefix = [...cacheScope, userId, "project-access"];
  const headers = {
    "x-flf-contract-version": contractManifest.contractVersion,
  };
  const [organizationChoice, setOrganizationChoice] = useState<string | null>(
    initialOrganizationId,
  );
  const [projectChoice, setProjectChoice] = useState<string | null>(
    initialProjectId,
  );
  const [blocked, setBlocked] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const active = useRef(true);
  const recoveryGeneration = useRef(0);
  const failed = useRef(false);
  const failureHandler = useRef(onAccessFailure);
  failureHandler.current = onAccessFailure;
  const organizationOptions = listOrganizationsOptions(
    { client, headers, query: { limit: 100 } },
    prefix,
  );
  const organizationsKey = [...organizationOptions.queryKey, "pages"];
  const organizationsQuery = useInfiniteQuery<
    OrganizationListEnvelope,
    Error,
    InfiniteData<OrganizationListEnvelope>,
    readonly unknown[],
    string | null
  >({
    queryKey: organizationsKey,
    initialPageParam: initialCursor,
    queryFn: ({ pageParam, signal }) =>
      listOrganizations({
        client,
        headers,
        query: { limit: 100, cursor: pageParam },
        signal,
      }),
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    retry: false,
    staleTime: 0,
    refetchInterval: 30000,
    enabled: !blocked,
  });
  const organizations =
    organizationsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const organizationId = organizationChoice ?? organizations[0]?.id ?? null;
  const organizationAccess = useQuery({
    ...getOrganizationAccessOptions(
      { client, headers, path: { orgId: organizationId ?? "unselected" } },
      [...prefix, organizationId],
    ),
    enabled: !!organizationId && !blocked,
    refetchInterval: 30000,
  });
  const canCreateProject =
    !blocked &&
    !organizationAccess.error &&
    organizationAccess.data?.data.owner?.id === userId;
  const projectOptions = listProjectsOptions(
    {
      client,
      headers,
      path: { orgId: organizationId ?? "unselected" },
      query: { limit: 100 },
    },
    [...prefix, organizationId],
  ).queryKey;
  const projectsKey = [...projectOptions, "pages"];
  const projectsQuery = useInfiniteQuery<
    ProjectListEnvelope,
    Error,
    InfiniteData<ProjectListEnvelope>,
    readonly unknown[],
    string | null
  >({
    queryKey: projectsKey,
    initialPageParam: initialCursor,
    queryFn: ({ pageParam, signal }) => {
      if (!organizationId) throw new Error("Select an organization first.");
      return listProjects({
        client,
        headers,
        path: { orgId: organizationId },
        query: { limit: 100, cursor: pageParam },
        signal,
      });
    },
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    retry: false,
    staleTime: 0,
    refetchInterval: 30000,
    enabled: !!organizationId && !blocked,
  });
  const loadedProjects =
    projectsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const projectId = projectChoice ?? loadedProjects[0]?.id ?? null;
  const selectedQuery = useQuery({
    ...getProjectOptions(
      { client, headers, path: { projectId: projectId ?? "unselected" } },
      [...prefix, organizationId],
    ),
    enabled: !!projectId && !blocked,
    refetchInterval: 30000,
  });
  const selected = selectedQuery.data?.data;
  const projects =
    selected &&
    selected.organizationId === organizationId &&
    !loadedProjects.some((project) => project.id === selected.id)
      ? [...loadedProjects, selected]
      : loadedProjects;
  const create = useMutation({ mutationFn: createProject, retry: false });
  const currentScope = useRef(organizationId);
  currentScope.current = blocked || !canCreateProject ? null : organizationId;
  const error =
    organizationsQuery.error ??
    organizationAccess.error ??
    projectsQuery.error ??
    selectedQuery.error;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      recoveryGeneration.current += 1;
    };
  }, []);
  async function accessFailure(value: unknown) {
    if (
      !(value instanceof ApiError) ||
      (value.status !== 401 && value.status !== 403 && value.status !== 404) ||
      failed.current
    )
      return;
    failed.current = true;
    const generation = ++recoveryGeneration.current;
    const isCurrent = () =>
      active.current && recoveryGeneration.current === generation;
    currentScope.current = null;
    setBlocked(true);
    setOrganizationChoice(null);
    setProjectChoice(null);
    await queryClient.cancelQueries({ queryKey: prefix });
    if (!isCurrent()) return;
    queryClient.removeQueries({ queryKey: prefix });
    failureHandler.current(value.status);
    if (value.status === 401) return;
    // Refresh real discovery, but keep protected content hidden until the user retries.
    // Infinite-query cache data must retain its pages/pageParams shape.
    try {
      const response = await listOrganizations({
        client,
        headers,
        query: { limit: 100 },
      });
      if (isCurrent())
        queryClient.setQueryData<
          InfiniteData<OrganizationListEnvelope, string | null>
        >(organizationsKey, {
          pages: [response],
          pageParams: [null],
        });
    } catch (refreshError) {
      if (isCurrent()) {
        setRecoveryFailed(true);
        if (refreshError instanceof ApiError && refreshError.status === 401)
          failureHandler.current(401);
      }
    }
  }
  useEffect(() => {
    void accessFailure(error);
  }, [error]);

  let state: WorkspaceDisplayState = "ready";
  if (recoveryFailed) state = "error";
  else if (blocked) state = "access-removed";
  else if (error) state = "error";
  else if (
    organizationsQuery.isPending ||
    (organizationId && organizationAccess.isPending) ||
    (organizationId && projectsQuery.isPending) ||
    (projectId && selectedQuery.isPending)
  )
    state = "loading";
  else if (!organizations.length) state = "access-required";

  function chooseOrganization(id: string) {
    void queryClient.cancelQueries({ queryKey: [...prefix, organizationId] });
    queryClient.removeQueries({ queryKey: [...prefix, organizationId] });
    setOrganizationChoice(id);
    setProjectChoice(null);
  }
  function chooseProject(id: string) {
    setProjectChoice(id);
  }
  async function submit(id: string, name: string, key: string) {
    if (!canCreateProject || id !== organizationId)
      throw new Error(
        "Only the current organization owner can create projects.",
      );
    try {
      const response = await create.mutateAsync({
        client,
        path: { orgId: id },
        headers: {
          ...headers,
          "x-csrf-token": csrfToken,
          "idempotency-key": key,
        },
        body: { name },
      });
      if (!active.current || currentScope.current !== id) return;
      const options = getProjectOptions(
        { client, headers, path: { projectId: response.data.id } },
        [...prefix, id],
      );
      queryClient.setQueryData(options.queryKey, response);
      chooseProject(response.data.id);
      await queryClient.invalidateQueries({ queryKey: projectsKey });
    } catch (value) {
      await accessFailure(value);
      throw value;
    }
  }
  function retry() {
    recoveryGeneration.current += 1;
    failed.current = false;
    setBlocked(false);
    setRecoveryFailed(false);
    setOrganizationChoice(initialOrganizationId);
    setProjectChoice(initialProjectId);
    void queryClient.invalidateQueries({ queryKey: prefix });
  }
  return {
    organizations,
    projects,
    organizationId,
    projectId,
    canCreateProject,
    state,
    chooseOrganization,
    chooseProject,
    submit,
    retry,
    moreOrganizations: organizationsQuery.hasNextPage
      ? () => {
          void organizationsQuery.fetchNextPage();
        }
      : undefined,
    moreProjects: projectsQuery.hasNextPage
      ? () => {
          void projectsQuery.fetchNextPage();
        }
      : undefined,
    loadingMoreOrganizations: organizationsQuery.isFetchingNextPage,
    loadingMoreProjects: projectsQuery.isFetchingNextPage,
  };
}
