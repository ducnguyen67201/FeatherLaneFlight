// Initialize the default client before exposing the generated SDK or query options.
export {
  client,
  createValidatedClient,
  ApiError,
  ContractValidationError,
  contractManifest,
  operationPolicies,
  browserNavigationPolicies,
  type SessionTransportPolicy,
  validateResult,
} from "./transport";
export * from "./generated/types.gen";
export {
  getContractMeta,
  listRuns,
  getRunOptions,
  createRun,
  getSession,
  logout,
} from "./sdk";
export {
  getContractMetaQueryKey,
  listRunsQueryKey,
  getRunOptionsQueryKey,
  getSessionQueryKey,
} from "./generated/@tanstack/react-query.gen";
export {
  getContractMetaOptions,
  listRunsOptions,
  getRunOptionsOptions,
  createRunMutation,
  getSessionOptions,
  logoutMutation,
} from "./queries";
