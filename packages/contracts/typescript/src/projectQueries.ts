import { queryOptions } from "@tanstack/react-query";
import {
  listOrganizationsQueryKey,
  listProjectsQueryKey,
  getProjectQueryKey,
} from "./generated/@tanstack/react-query.gen";
import type {
  ListOrganizationsResponse,
  ListProjectsResponse,
  GetProjectResponse,
} from "./generated/types.gen";
import { listOrganizations, listProjects, getProject } from "./projects";

export function listOrganizationsOptions(
  options: Parameters<typeof listOrganizations>[0],
  scope: readonly unknown[],
) {
  const queryKey = [...scope, ...listOrganizationsQueryKey(options)];
  return queryOptions<
    ListOrganizationsResponse,
    Error,
    ListOrganizationsResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => listOrganizations({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
export function listProjectsOptions(
  options: Parameters<typeof listProjects>[0],
  scope: readonly unknown[],
) {
  const queryKey = [...scope, ...listProjectsQueryKey(options)];
  return queryOptions<
    ListProjectsResponse,
    Error,
    ListProjectsResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => listProjects({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
export function getProjectOptions(
  options: Parameters<typeof getProject>[0],
  scope: readonly unknown[],
) {
  const queryKey = [...scope, ...getProjectQueryKey(options)];
  return queryOptions<
    GetProjectResponse,
    Error,
    GetProjectResponse,
    typeof queryKey
  >({
    queryKey,
    queryFn: ({ signal }) => getProject({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
