import {
  getRunOptionsOptions,
  listRunsOptions,
  contractManifest,
  type GetRunOptionsData,
  type ListRunsData,
} from "@featherlane/contracts";

export const demoScope = {
  epoch: "local-demo",
  organizationId: "org_demo",
  projectId: "project_demo",
};
export const runsPrefix = [
  demoScope.epoch,
  demoScope.organizationId,
  demoScope.projectId,
  "runs",
];
export const optionsPrefix = [
  demoScope.epoch,
  demoScope.organizationId,
  demoScope.projectId,
  "run-options",
];
export const headers = {
  "x-flf-contract-version": contractManifest.contractVersion,
};

export function runsOptions(query: ListRunsData["query"], revision: number) {
  const options = listRunsOptions(
    {
      path: { projectId: demoScope.projectId },
      headers,
      query,
    },
    [...runsPrefix, revision],
  );
  return {
    ...options,
    staleTime: 0,
    retry: false as const,
  };
}
export function selectionOptions(
  query: GetRunOptionsData["query"],
  revision: number,
) {
  const options = getRunOptionsOptions(
    {
      path: { projectId: demoScope.projectId },
      headers,
      query,
    },
    [...optionsPrefix, revision],
  );
  return {
    ...options,
    staleTime: 0,
    retry: false as const,
  };
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request failed. Try again.";
}
