import { queryOptions } from "@tanstack/react-query";

import {
  listBuildsQueryKey,
  getBuildQueryKey,
  listLocalProfilesQueryKey,
  getLocalProfileQueryKey,
  listIntegrationProfilesQueryKey,
  getIntegrationProfileQueryKey,
} from "./generated/@tanstack/react-query.gen";

import {
  listBuilds,
  getBuild,
  listLocalProfiles,
  getLocalProfile,
  listIntegrationProfiles,
  getIntegrationProfile,
} from "./registration";

export function listBuildsOptions(
  options: Parameters<typeof listBuilds>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listBuildsQueryKey(options)],
    queryFn: ({ signal }) => listBuilds({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function getBuildOptions(
  options: Parameters<typeof getBuild>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...getBuildQueryKey(options)],
    queryFn: ({ signal }) => getBuild({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function listLocalProfilesOptions(
  options: Parameters<typeof listLocalProfiles>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listLocalProfilesQueryKey(options)],
    queryFn: ({ signal }) => listLocalProfiles({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function getLocalProfileOptions(
  options: Parameters<typeof getLocalProfile>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...getLocalProfileQueryKey(options)],
    queryFn: ({ signal }) => getLocalProfile({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function listIntegrationProfilesOptions(
  options: Parameters<typeof listIntegrationProfiles>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...listIntegrationProfilesQueryKey(options)],
    queryFn: ({ signal }) => listIntegrationProfiles({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}

export function getIntegrationProfileOptions(
  options: Parameters<typeof getIntegrationProfile>[0],
  scope: readonly unknown[],
) {
  return queryOptions({
    queryKey: [...scope, ...getIntegrationProfileQueryKey(options)],
    queryFn: ({ signal }) => getIntegrationProfile({ ...options, signal }),
    retry: false,
    staleTime: 0,
  });
}
