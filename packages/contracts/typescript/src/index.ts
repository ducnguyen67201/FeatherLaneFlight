// Initialize the default client before exposing the generated SDK or query options.
export {
  client,
  createValidatedClient,
  ApiError,
  ContractValidationError,
  contractManifest,
  operationPolicies,
} from "./transport";
export * from "./generated/types.gen";
export { getContractMeta, listRuns } from "./sdk";
export {
  getContractMetaQueryKey,
  listRunsQueryKey,
} from "./generated/@tanstack/react-query.gen";
export { getContractMetaOptions, listRunsOptions } from "./queries";
