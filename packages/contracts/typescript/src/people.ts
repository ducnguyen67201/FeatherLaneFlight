import type {
  GetOrganizationAccessData,
  ListOrganizationPeopleData,
  ListEmailGrantsData,
  SaveEmailGrantData,
  RemoveEmailGrantData,
  ListDomainRulesData,
  SaveDomainRuleData,
  RemoveDomainRuleData,
  ListJoinExclusionsData,
  AllowAutomaticJoiningData,
  RemoveOrganizationPersonData,
  ListManagedProjectsData,
  ListProjectPeopleData,
  ChangeProjectPeopleData,
} from "./generated/types.gen";
import {
  getOrganizationAccess as generatedGetOrganizationAccess,
  listOrganizationPeople as generatedListOrganizationPeople,
  listEmailGrants as generatedListEmailGrants,
  saveEmailGrant as generatedSaveEmailGrant,
  removeEmailGrant as generatedRemoveEmailGrant,
  listDomainRules as generatedListDomainRules,
  saveDomainRule as generatedSaveDomainRule,
  removeDomainRule as generatedRemoveDomainRule,
  listJoinExclusions as generatedListJoinExclusions,
  allowAutomaticJoining as generatedAllowAutomaticJoining,
  removeOrganizationPerson as generatedRemoveOrganizationPerson,
  listManagedProjects as generatedListManagedProjects,
  listProjectPeople as generatedListProjectPeople,
  changeProjectPeople as generatedChangeProjectPeople,
} from "./generated/sdk.gen";
import {
  zGetOrganizationAccessResponse,
  zListOrganizationPeopleResponse,
  zListEmailGrantsResponse,
  zSaveEmailGrantResponse,
  zRemoveEmailGrantResponse,
  zListDomainRulesResponse,
  zSaveDomainRuleResponse,
  zRemoveDomainRuleResponse,
  zListJoinExclusionsResponse,
  zAllowAutomaticJoiningResponse,
  zRemoveOrganizationPersonResponse,
  zListManagedProjectsResponse,
  zListProjectPeopleResponse,
  zChangeProjectPeopleResponse,
} from "./generated/zod.gen";
import { validateResult, type ReadOptions } from "./sdk";

export async function getOrganizationAccess(
  options: ReadOptions<GetOrganizationAccessData>,
) {
  const client = options.client;
  const result = await generatedGetOrganizationAccess({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetOrganizationAccessResponse,
    result.data,
    result.response,
    client,
  );
}

export async function listOrganizationPeople(
  options: ReadOptions<ListOrganizationPeopleData>,
) {
  const client = options.client;
  const result = await generatedListOrganizationPeople({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListOrganizationPeopleResponse,
    result.data,
    result.response,
    client,
  );
}

export async function listEmailGrants(
  options: ReadOptions<ListEmailGrantsData>,
) {
  const client = options.client;
  const result = await generatedListEmailGrants({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListEmailGrantsResponse,
    result.data,
    result.response,
    client,
  );
}

export async function saveEmailGrant(options: ReadOptions<SaveEmailGrantData>) {
  const client = options.client;
  const result = await generatedSaveEmailGrant({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zSaveEmailGrantResponse,
    result.data,
    result.response,
    client,
  );
}

export async function removeEmailGrant(
  options: ReadOptions<RemoveEmailGrantData>,
) {
  const client = options.client;
  const result = await generatedRemoveEmailGrant({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zRemoveEmailGrantResponse,
    result.data,
    result.response,
    client,
  );
}

export async function listDomainRules(
  options: ReadOptions<ListDomainRulesData>,
) {
  const client = options.client;
  const result = await generatedListDomainRules({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListDomainRulesResponse,
    result.data,
    result.response,
    client,
  );
}

export async function saveDomainRule(options: ReadOptions<SaveDomainRuleData>) {
  const client = options.client;
  const result = await generatedSaveDomainRule({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zSaveDomainRuleResponse,
    result.data,
    result.response,
    client,
  );
}

export async function removeDomainRule(
  options: ReadOptions<RemoveDomainRuleData>,
) {
  const client = options.client;
  const result = await generatedRemoveDomainRule({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zRemoveDomainRuleResponse,
    result.data,
    result.response,
    client,
  );
}

export async function listJoinExclusions(
  options: ReadOptions<ListJoinExclusionsData>,
) {
  const client = options.client;
  const result = await generatedListJoinExclusions({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListJoinExclusionsResponse,
    result.data,
    result.response,
    client,
  );
}

export async function allowAutomaticJoining(
  options: ReadOptions<AllowAutomaticJoiningData>,
) {
  const client = options.client;
  const result = await generatedAllowAutomaticJoining({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zAllowAutomaticJoiningResponse,
    result.data,
    result.response,
    client,
  );
}

export async function removeOrganizationPerson(
  options: ReadOptions<RemoveOrganizationPersonData>,
) {
  const client = options.client;
  const result = await generatedRemoveOrganizationPerson({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zRemoveOrganizationPersonResponse,
    result.data,
    result.response,
    client,
  );
}

export async function listManagedProjects(
  options: ReadOptions<ListManagedProjectsData>,
) {
  const client = options.client;
  const result = await generatedListManagedProjects({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListManagedProjectsResponse,
    result.data,
    result.response,
    client,
  );
}

export async function listProjectPeople(
  options: ReadOptions<ListProjectPeopleData>,
) {
  const client = options.client;
  const result = await generatedListProjectPeople({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListProjectPeopleResponse,
    result.data,
    result.response,
    client,
  );
}

export async function changeProjectPeople(
  options: ReadOptions<ChangeProjectPeopleData>,
) {
  const client = options.client;
  const result = await generatedChangeProjectPeople({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zChangeProjectPeopleResponse,
    result.data,
    result.response,
    client,
  );
}
