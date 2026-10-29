import { listRunners as generatedListRunners } from "./generated/sdk.gen";
import type { ListRunnersData } from "./generated/types.gen";
import { zListRunnersResponse } from "./generated/zod.gen";
import { createRunnerEnrollment as generatedCreateRunnerEnrollment } from "./generated/sdk.gen";
import type { CreateRunnerEnrollmentData } from "./generated/types.gen";
import { zCreateRunnerEnrollmentResponse } from "./generated/zod.gen";
import { revokeRunner as generatedRevokeRunner } from "./generated/sdk.gen";
import type { RevokeRunnerData } from "./generated/types.gen";
import { zRevokeRunnerResponse } from "./generated/zod.gen";
import { validateResult, type ReadOptions } from "./sdk";

export async function listRunners(options: ReadOptions<ListRunnersData>) {
  const result = await generatedListRunners({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zListRunnersResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function createRunnerEnrollment(
  options: ReadOptions<CreateRunnerEnrollmentData>,
) {
  const result = await generatedCreateRunnerEnrollment({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zCreateRunnerEnrollmentResponse,
    result.data,
    result.response,
    options.client,
  );
}

export async function revokeRunner(options: ReadOptions<RevokeRunnerData>) {
  const result = await generatedRevokeRunner({
    ...options,
    throwOnError: true,
    responseStyle: "fields",
    parseAs: "json",
  });
  return validateResult(
    zRevokeRunnerResponse,
    result.data,
    result.response,
    options.client,
  );
}
