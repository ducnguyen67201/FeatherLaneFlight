import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  contractManifest,
  getBuildOptions,
  getLocalProfileOptions,
  getIntegrationProfileOptions,
  type RegisteredBuildView,
  type LocalProfileView,
  type RegisteredIntegrationProfileView,
} from "@featherlane/contracts";
import {
  registrationAccessStatus,
  type RegistrationCatalogProps,
} from "./useRegistrationCatalog";
export type RegistrationSelection = {
  kind: "build" | "local" | "integration";
  id: string;
};
type DetailRecord =
  | { kind: "build"; value: RegisteredBuildView }
  | { kind: "local"; value: LocalProfileView }
  | { kind: "integration"; value: RegisteredIntegrationProfileView };
export function useRegistrationDetail(
  { projectId, client, cacheScope, onAccessFailure }: RegistrationCatalogProps,
  selection: RegistrationSelection | null,
) {
  const common = {
    client,
    headers: { "x-flf-contract-version": contractManifest.contractVersion },
  };
  const scope = [...cacheScope, "registrations", projectId];
  const build = useQuery({
    ...getBuildOptions(
      {
        ...common,
        path: { projectId, buildId: selection?.id ?? "unselected" },
      },
      scope,
    ),
    enabled: selection?.kind === "build",
  });
  const local = useQuery({
    ...getLocalProfileOptions(
      {
        ...common,
        path: { projectId, profileId: selection?.id ?? "unselected" },
      },
      scope,
    ),
    enabled: selection?.kind === "local",
  });
  const integration = useQuery({
    ...getIntegrationProfileOptions(
      {
        ...common,
        path: { projectId, profileId: selection?.id ?? "unselected" },
      },
      scope,
    ),
    enabled: selection?.kind === "integration",
  });
  const selected =
    selection?.kind === "build"
      ? build
      : selection?.kind === "local"
        ? local
        : integration;
  const accessStatus = registrationAccessStatus(selected.error);
  useEffect(() => {
    if (accessStatus !== null && selection) {
      onAccessFailure(accessStatus);
    }
  }, [accessStatus, selection, onAccessFailure]);
  let record: DetailRecord | null = null;
  if (selection?.kind === "build" && build.data)
    record = { kind: "build", value: build.data.data };
  else if (selection?.kind === "local" && local.data)
    record = { kind: "local", value: local.data.data };
  else if (selection?.kind === "integration" && integration.data)
    record = { kind: "integration", value: integration.data.data };
  return {
    record,
    loading: selected.isPending,
    failed: selected.isError,
    accessDenied: accessStatus !== null,
    retry: () => {
      void selected.refetch();
    },
  };
}
