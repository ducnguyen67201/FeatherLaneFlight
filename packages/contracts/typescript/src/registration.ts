import type {
  RegisterIntegrationProfileData,
  RegisterLocalProfileData,
  RegisterBuildData,
  ListBuildsData,
  GetBuildData,
  ListLocalProfilesData,
  GetLocalProfileData,
  ListIntegrationProfilesData,
  GetIntegrationProfileData,
} from "./generated/types.gen";

import {
  registerIntegrationProfile as generatedRegisterIntegrationProfile,
  registerLocalProfile as generatedRegisterLocalProfile,
  registerBuild as generatedRegisterBuild,
  listBuilds as generatedListBuilds,
  getBuild as generatedGetBuild,
  listLocalProfiles as generatedListLocalProfiles,
  getLocalProfile as generatedGetLocalProfile,
  listIntegrationProfiles as generatedListIntegrationProfiles,
  getIntegrationProfile as generatedGetIntegrationProfile,
} from "./generated/sdk.gen";

import {
  zRegisterBuildResponse,
  zRegisterLocalProfileResponse,
  zRegisterIntegrationProfileResponse,
  zListBuildsResponse,
  zGetBuildResponse,
  zListLocalProfilesResponse,
  zGetLocalProfileResponse,
  zListIntegrationProfilesResponse,
  zGetIntegrationProfileResponse,
} from "./generated/zod.gen";

import { validateResult, type ReadOptions } from "./sdk";

export async function listBuilds(options: ReadOptions<ListBuildsData>) {
  const result = await generatedListBuilds({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListBuildsResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function getBuild(options: ReadOptions<GetBuildData>) {
  const result = await generatedGetBuild({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetBuildResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function listLocalProfiles(
  options: ReadOptions<ListLocalProfilesData>,
) {
  const result = await generatedListLocalProfiles({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListLocalProfilesResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function getLocalProfile(
  options: ReadOptions<GetLocalProfileData>,
) {
  const result = await generatedGetLocalProfile({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetLocalProfileResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function listIntegrationProfiles(
  options: ReadOptions<ListIntegrationProfilesData>,
) {
  const result = await generatedListIntegrationProfiles({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListIntegrationProfilesResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function getIntegrationProfile(
  options: ReadOptions<GetIntegrationProfileData>,
) {
  const result = await generatedGetIntegrationProfile({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zGetIntegrationProfileResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function registerBuild(options: ReadOptions<RegisterBuildData>) {
  const result = await generatedRegisterBuild({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zRegisterBuildResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function registerLocalProfile(
  options: ReadOptions<RegisterLocalProfileData>,
) {
  const result = await generatedRegisterLocalProfile({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zRegisterLocalProfileResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function registerIntegrationProfile(
  options: ReadOptions<RegisterIntegrationProfileData>,
) {
  const result = await generatedRegisterIntegrationProfile({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zRegisterIntegrationProfileResponse,
    result.data,
    result.response,
    options.client,
  );
}
