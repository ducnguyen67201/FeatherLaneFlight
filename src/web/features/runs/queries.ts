import {
  ApiError,
  ContractValidationError,
  getRunOptionsOptions,
  listRunsOptions,
  contractManifest,
  client,
  type createValidatedClient,
  type GetRunOptionsData,
  type ListRunsData,
} from "@featherlane/contracts";

export const demoScope = {
  epoch: "local-demo",
  organizationId: "org_demo",
  projectId: "project_demo",
};
export type RunTransport = {
  client: ReturnType<typeof createValidatedClient>;
  cacheScope: readonly unknown[];
  organizationId: string;
  projectId: string;
  csrfToken: string;
  onAccessFailure: (status: 401 | 403 | 404) => void;
};
// Used only by the explicit demo entry; authenticated pages supply their own scope.
export const demoRunTransport: RunTransport = {
  client,
  cacheScope: [demoScope.epoch],
  organizationId: demoScope.organizationId,
  projectId: demoScope.projectId,
  csrfToken: "0".repeat(64),
  onAccessFailure: () => {},
};
export const runScope = (transport: RunTransport) => [
  ...transport.cacheScope,
  transport.organizationId,
  transport.projectId,
];
export const detailPrefix = (runId: string, transport = demoRunTransport) => [
  ...runScope(transport),
  "run-detail",
  runId,
];
export const runsQueryPrefix = (transport: RunTransport) => [
  ...runScope(transport),
  "runs",
];
export const optionsQueryPrefix = (transport: RunTransport) => [
  ...runScope(transport),
  "run-options",
];
export const runsPrefix = runsQueryPrefix(demoRunTransport);
export const optionsPrefix = optionsQueryPrefix(demoRunTransport);
export const headers = {
  "x-flf-contract-version": contractManifest.contractVersion,
};

export function runsOptions(
  query: ListRunsData["query"],
  revision: number,
  transport = demoRunTransport,
) {
  const options = listRunsOptions(
    {
      client: transport.client,
      path: { projectId: transport.projectId },
      headers,
      query,
    },
    [...runsQueryPrefix(transport), revision],
  );
  return { ...options, staleTime: 0, retry: false as const };
}
export function selectionOptions(
  query: GetRunOptionsData["query"],
  revision: number,
  transport = demoRunTransport,
) {
  const options = getRunOptionsOptions(
    {
      client: transport.client,
      path: { projectId: transport.projectId },
      headers,
      query,
    },
    [...optionsQueryPrefix(transport), revision],
  );
  return { ...options, staleTime: 0, retry: false as const };
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request failed. Try again.";
}

export function permanentReadFailure(error: unknown) {
  return (
    error instanceof ContractValidationError ||
    (error instanceof ApiError && error.status < 500 && error.status !== 429)
  );
}

export function canRefreshAutomatically(error: unknown) {
  return (
    !permanentReadFailure(error) &&
    !(error instanceof ApiError && (error.retryAt ?? 0) > Date.now())
  );
}
