import { http, HttpResponse, delay } from "msw";
import { contractManifest, operationPolicies } from "@featherlane/contracts";
import {
  zContractMetaEnvelope,
  zErrorEnvelope,
  zListRunsHeaders,
  zListRunsPath,
  zListRunsQuery,
  zRunListEnvelope,
} from "@featherlane/contracts/validators";
import payload from "./runs.json";

export const runsFixture = zRunListEnvelope.parse(payload);
export const emptyRunsFixture = zRunListEnvelope.parse({
  data: [],
  meta: { nextCursor: null },
});
export const metaFixture = zContractMetaEnvelope.parse({
  data: {
    supportedContractVersions: [contractManifest.contractVersion],
    supportedProtocolVersions: [contractManifest.protocolVersion],
    schemaDigest: contractManifest.schemaDigest,
  },
});
export const forbiddenFixture = zErrorEnvelope.parse({
  error: {
    code: "FORBIDDEN",
    message: "This action is unavailable for this project.",
    details: [],
    requestId: "fixture_forbidden",
  },
});

function error(
  status: number,
  code: "VALIDATION_FAILED" | "CONTRACT_VERSION_UNSUPPORTED",
  message: string,
) {
  return HttpResponse.json(
    zErrorEnvelope.parse({
      error: {
        code,
        message,
        details: [],
        requestId: "fixture_invalid_request",
      },
    }),
    { status },
  );
}

export type RunsFixtureMode = "populated" | "empty" | "forbidden";

/** Consumers explicitly start MSW; importing fixtures never intercepts real traffic. */
export function createFixtureHandlers({
  origin,
  runs = "populated",
  delayMs = 0,
}: {
  origin: string;
  runs?: RunsFixtureMode;
  delayMs?: number;
}) {
  const base = new URL(origin).origin;
  const listPath = operationPolicies.listRuns.path.replace(
    /\{([^}]+)\}/g,
    ":$1",
  );
  return [
    http.get(`${base}${operationPolicies.getContractMeta.path}`, () =>
      HttpResponse.json(metaFixture),
    ),
    http.get(`${base}${listPath}`, async ({ request, params }) => {
      const header = zListRunsHeaders.safeParse({
        "x-flf-contract-version": request.headers.get("x-flf-contract-version"),
      });
      if (!header.success)
        return error(
          400,
          "CONTRACT_VERSION_UNSUPPORTED",
          "Refresh with the supported contract version.",
        );
      const path = zListRunsPath.safeParse(params);
      const url = new URL(request.url);
      const query = zListRunsQuery.safeParse({
        ...(url.searchParams.has("limit")
          ? { limit: Number(url.searchParams.get("limit")) }
          : {}),
        ...(url.searchParams.has("cursor")
          ? { cursor: url.searchParams.get("cursor") }
          : {}),
      });
      if (!path.success || !query.success)
        return error(
          422,
          "VALIDATION_FAILED",
          "The request parameters are invalid.",
        );
      await delay(delayMs);
      if (runs === "forbidden")
        return HttpResponse.json(forbiddenFixture, { status: 403 });
      if (
        path.data.projectId !== runsFixture.data[0]?.projectId ||
        query.data.cursor != null ||
        runs === "empty"
      ) {
        return HttpResponse.json(emptyRunsFixture);
      }
      return HttpResponse.json(
        zRunListEnvelope.parse({
          ...runsFixture,
          data: runsFixture.data.slice(0, query.data.limit),
        }),
      );
    }),
  ];
}
