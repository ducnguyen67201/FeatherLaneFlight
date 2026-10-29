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
export { getContractMeta, listRuns, getRunOptions, createRun } from "./sdk";
export {
  getContractMetaQueryKey,
  listRunsQueryKey,
  getRunOptionsQueryKey,
} from "./generated/@tanstack/react-query.gen";
export {
  getContractMetaOptions,
  listRunsOptions,
  getRunOptionsOptions,
  createRunMutation,
} from "./queries";
export {
  listOrganizations,
  listProjects,
  getProject,
  createProject,
} from "./projects";
export {
  listOrganizationsOptions,
  listProjectsOptions,
  getProjectOptions,
} from "./projectQueries";
