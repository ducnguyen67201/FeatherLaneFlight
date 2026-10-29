import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  contractManifest,
  listBuildsOptions,
  listLocalProfilesOptions,
  listIntegrationProfilesOptions,
  type createValidatedClient,
} from "@featherlane/contracts";
import type { CatalogPaginationProps } from "./CatalogPagination";

export type RegistrationCatalogProps = {
  projectId: string;
  client: ReturnType<typeof createValidatedClient>;
  cacheScope: readonly unknown[];
  onAccessFailure: (status: 401 | 403 | 404) => void;
};

function useCatalogCursor() {
  const [navigation, setNavigation] = useState<{
    page: number;
    cursors: (string | null)[];
  }>({ page: 0, cursors: [null] });
  function controls(
    nextCursor: string | null,
    pending: boolean,
  ): CatalogPaginationProps {
    return {
      page: navigation.page,
      hasNext: nextCursor !== null,
      pending,
      onPrevious: () =>
        setNavigation((current) => ({
          ...current,
          page: Math.max(0, current.page - 1),
        })),
      onNext: () => {
        if (nextCursor && !pending)
          setNavigation((current) => ({
            page: current.page + 1,
            cursors: [
              ...current.cursors.slice(0, current.page + 1),
              nextCursor,
            ],
          }));
      },
    };
  }
  return { cursor: navigation.cursors[navigation.page] ?? null, controls };
}

export function registrationAccessStatus(
  error: unknown,
): 401 | 403 | 404 | null {
  return error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
    ? error.status
    : null;
}

export function useRegistrationCatalog({
  projectId,
  client,
  cacheScope,
  onAccessFailure,
}: RegistrationCatalogProps) {
  const queryClient = useQueryClient();
  const buildCursor = useCatalogCursor();
  const localCursor = useCatalogCursor();
  const integrationCursor = useCatalogCursor();
  const [blocked, setBlocked] = useState(false);
  const prefix = [...cacheScope, "registrations", projectId];
  const common = {
    client,
    path: { projectId },
    headers: { "x-flf-contract-version": contractManifest.contractVersion },
  };
  const builds = useQuery({
    ...listBuildsOptions(
      { ...common, query: { limit: 25, cursor: buildCursor.cursor } },
      prefix,
    ),
    enabled: !blocked,
    refetchInterval: 30000,
  });
  const locals = useQuery({
    ...listLocalProfilesOptions(
      { ...common, query: { limit: 25, cursor: localCursor.cursor } },
      prefix,
    ),
    enabled: !blocked,
    refetchInterval: 30000,
  });
  const integrations = useQuery({
    ...listIntegrationProfilesOptions(
      { ...common, query: { limit: 25, cursor: integrationCursor.cursor } },
      prefix,
    ),
    enabled: !blocked,
    refetchInterval: 30000,
  });
  const errors = [builds.error, locals.error, integrations.error];
  const error = errors.find((value) => value !== null);
  const accessStatus =
    errors.map(registrationAccessStatus).find((value) => value !== null) ??
    null;
  const accessLost = blocked || accessStatus !== null;
  useEffect(() => {
    if (accessStatus === null || blocked) return;
    setBlocked(true);
    void queryClient
      .cancelQueries({ queryKey: prefix })
      .then(() => queryClient.removeQueries({ queryKey: prefix }));
    onAccessFailure(accessStatus);
  }, [accessStatus, blocked, projectId, client, onAccessFailure, queryClient]);

  const pending =
    builds.isFetching || locals.isFetching || integrations.isFetching;
  return {
    builds: accessLost ? [] : (builds.data?.data ?? []),
    localProfiles: accessLost ? [] : (locals.data?.data ?? []),
    integrationProfiles: accessLost ? [] : (integrations.data?.data ?? []),
    buildPagination: buildCursor.controls(
      builds.data?.meta.nextCursor ?? null,
      builds.isFetching,
    ),
    localPagination: localCursor.controls(
      locals.data?.meta.nextCursor ?? null,
      locals.isFetching,
    ),
    integrationPagination: integrationCursor.controls(
      integrations.data?.meta.nextCursor ?? null,
      integrations.isFetching,
    ),
    loading:
      !error &&
      (builds.isPending || locals.isPending || integrations.isPending),
    initialError:
      !!error && (!builds.data || !locals.data || !integrations.data),
    refreshError:
      !!error && !!builds.data && !!locals.data && !!integrations.data,
    accessLost,
    pending,
    refresh: () => {
      if (!accessLost) void queryClient.invalidateQueries({ queryKey: prefix });
    },
  };
}
