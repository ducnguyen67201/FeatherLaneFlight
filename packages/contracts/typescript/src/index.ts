// Initialize the default client before exposing the generated SDK or query options.
export {
  client,
  createValidatedClient,
  ApiError,
  ContractValidationError,
  contractManifest,
  operationPolicies,
  browserNavigationPolicies,
  validateResult,
  type SessionTransportPolicy,
} from "./transport";
export * from "./generated/types.gen";
export {
  getContractMeta,
  listRuns,
  getRunOptions,
  createRun,
  getRunDetail,
  getRunEvents,
  getRunArtifacts,
  cancelRun,
  getSession,
  logout,
} from "./sdk";
export {
  getContractMetaQueryKey,
  listRunsQueryKey,
  getRunOptionsQueryKey,
  getRunDetailQueryKey,
  getRunEventsQueryKey,
  getRunArtifactsQueryKey,
  getSessionQueryKey,
} from "./generated/@tanstack/react-query.gen";
export {
  getContractMetaOptions,
  listRunsOptions,
  getRunOptionsOptions,
  createRunMutation,
  getRunDetailOptions,
  getRunEventsOptions,
  getRunArtifactsOptions,
  cancelRunMutation,
  getSessionOptions,
  logoutMutation,
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

export {
  getOrganizationAccess,
  listOrganizationPeople,
  listEmailGrants,
  saveEmailGrant,
  removeEmailGrant,
  listDomainRules,
  saveDomainRule,
  removeDomainRule,
  listJoinExclusions,
  allowAutomaticJoining,
  removeOrganizationPerson,
  listManagedProjects,
  listProjectPeople,
  changeProjectPeople,
} from "./people";
export {
  getOrganizationAccessOptions,
  listOrganizationPeopleOptions,
  listEmailGrantsOptions,
  listDomainRulesOptions,
  listJoinExclusionsOptions,
  listManagedProjectsOptions,
  listProjectPeopleOptions,
} from "./peopleQueries";

export { listRunners, createRunnerEnrollment, revokeRunner } from "./runners";
export { listRunnersOptions } from "./runnerQueries";
