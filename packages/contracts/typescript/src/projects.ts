import type {
  CreateProjectData,
  GetProjectData,
  ListOrganizationsData,
  ListProjectsData,
} from "./generated/types.gen";
import {
  createProject as generatedCreate,
  getProject as generatedGet,
  listOrganizations as generatedOrganizations,
  listProjects as generatedProjects,
} from "./generated/sdk.gen";
import {
  zCreateProjectResponse,
  zGetProjectResponse,
  zListOrganizationsResponse,
  zListProjectsResponse,
} from "./generated/zod.gen";
import { validateResult, type ReadOptions } from "./sdk";

export async function listOrganizations(
  options: ReadOptions<ListOrganizationsData>,
) {
  const client = options.client;
  const result = await generatedOrganizations({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListOrganizationsResponse,
    result.data,
    result.response,
    client,
  );
}
export async function listProjects(options: ReadOptions<ListProjectsData>) {
  const client = options.client;
  const result = await generatedProjects({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListProjectsResponse,
    result.data,
    result.response,
    client,
  );
}
export async function getProject(options: ReadOptions<GetProjectData>) {
  const client = options.client;
  const result = await generatedGet({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetProjectResponse,
    result.data,
    result.response,
    client,
  );
}
export async function createProject(options: ReadOptions<CreateProjectData>) {
  const client = options.client;
  const result = await generatedCreate({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zCreateProjectResponse,
    result.data,
    result.response,
    client,
  );
}
