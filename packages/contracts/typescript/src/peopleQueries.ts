import { queryOptions } from "@tanstack/react-query";
import {
  getOrganizationAccessQueryKey,
  listOrganizationPeopleQueryKey,
  listEmailGrantsQueryKey,
  listDomainRulesQueryKey,
  listJoinExclusionsQueryKey,
  listManagedProjectsQueryKey,
  listProjectPeopleQueryKey,
} from "./generated/@tanstack/react-query.gen";
import {
  getOrganizationAccess,
  listOrganizationPeople,
  listEmailGrants,
  listDomainRules,
  listJoinExclusions,
  listManagedProjects,
  listProjectPeople,
} from "./people";

export function getOrganizationAccessOptions(
  options: Parameters<typeof getOrganizationAccess>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...getOrganizationAccessQueryKey(options)],
    queryFn: ({ signal }) => getOrganizationAccess({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function listOrganizationPeopleOptions(
  options: Parameters<typeof listOrganizationPeople>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listOrganizationPeopleQueryKey(options)],
    queryFn: ({ signal }) => listOrganizationPeople({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function listEmailGrantsOptions(
  options: Parameters<typeof listEmailGrants>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listEmailGrantsQueryKey(options)],
    queryFn: ({ signal }) => listEmailGrants({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function listDomainRulesOptions(
  options: Parameters<typeof listDomainRules>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listDomainRulesQueryKey(options)],
    queryFn: ({ signal }) => listDomainRules({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function listJoinExclusionsOptions(
  options: Parameters<typeof listJoinExclusions>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listJoinExclusionsQueryKey(options)],
    queryFn: ({ signal }) => listJoinExclusions({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function listManagedProjectsOptions(
  options: Parameters<typeof listManagedProjects>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listManagedProjectsQueryKey(options)],
    queryFn: ({ signal }) => listManagedProjects({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function listProjectPeopleOptions(
  options: Parameters<typeof listProjectPeople>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listProjectPeopleQueryKey(options)],
    queryFn: ({ signal }) => listProjectPeople({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
