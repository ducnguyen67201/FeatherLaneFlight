import { delay, http, HttpResponse } from "msw";
import {
  operationPolicies,
  type ErrorCode,
  type CreateRunRequest,
  type RunEnvelope,
  type RunListEntry,
} from "@featherlane/contracts";
import {
  zCreateRunBody,
  zCreateRunHeaders,
  zCreateRunPath,
  zErrorEnvelope,
  zGetRunOptionsHeaders,
  zGetRunOptionsPath,
  zGetRunOptionsQuery,
  zListRunsHeaders,
  zListRunsPath,
  zListRunsQuery,
  zRunEnvelope,
  zRunListEnvelope,
  zRunOptionsEnvelope,
} from "@featherlane/contracts/validators";
import runPayload from "./runs.json";
import optionsPayload from "./runOptions.json";

export const runOptionsFixture = zRunOptionsEnvelope.parse(optionsPayload);
const seed = zRunListEnvelope.parse(runPayload).data[0];
if (!seed) throw new Error("The demo requires one canonical run fixture.");
const baseRun = seed;
const historicalRows = zRunListEnvelope.parse({
  data: [
    {
      ...baseRun,
      id: "run_184",
      createdAt: "2026-10-28T18:00:00Z",
      executionState: "RUNNING",
      startedAt: "2026-10-28T18:00:01Z",
    },
    { ...baseRun, id: "run_183", createdAt: "2026-10-28T17:00:00Z" },
    {
      ...baseRun,
      id: "run_182",
      executionState: "COMPLETED",
      evaluationOutcome: "PASS",
      createdAt: "2026-10-28T16:00:00Z",
      startedAt: "2026-10-28T16:00:01Z",
      finishedAt: "2026-10-28T16:05:00Z",
    },
    {
      ...baseRun,
      id: "run_181",
      executionState: "COMPLETED",
      evaluationOutcome: "FAIL",
      createdAt: "2026-10-28T15:00:00Z",
      startedAt: "2026-10-28T15:00:01Z",
      finishedAt: "2026-10-28T15:05:00Z",
    },
    {
      ...baseRun,
      id: "run_180",
      executionState: "ERROR",
      evaluationOutcome: "NOT_EVALUATED",
      createdAt: "2026-10-28T14:00:00Z",
      startedAt: "2026-10-28T14:00:01Z",
      finishedAt: "2026-10-28T14:03:00Z",
    },
  ],
  meta: { nextCursor: null },
}).data;

export type DemoReadMode = "ready" | "loading" | "empty" | "error" | "invalid";
export type DemoSubmissionMode = "accept" | "reject" | "unconfirmed";
export function createRunsDemo() {
  let runsMode: DemoReadMode = "ready";
  let optionsMode: DemoReadMode = "ready";
  let submissionMode: DemoSubmissionMode = "accept";
  let rows: RunListEntry[] = structuredClone(historicalRows);
  const receipts = new Map<string, { payload: string; result: RunEnvelope }>();
  const admittedInputs = new Map<string, CreateRunRequest>();
  return {
    inputFor(runId: string) {
      return admittedInputs.get(runId) ?? null;
    },
    replaceRun(run: RunListEntry) {
      const validated = zRunListEnvelope.parse({
        data: [run],
        meta: { nextCursor: null },
      }).data[0]!;
      rows = rows.map((item) => (item.id === run.id ? validated : item));
    },
    get runsMode() {
      return runsMode;
    },
    get optionsMode() {
      return optionsMode;
    },
    get submissionMode() {
      return submissionMode;
    },
    get rows() {
      return rows;
    },
    receipts,
    setRunsMode(mode: DemoReadMode) {
      runsMode = mode;
    },
    setOptionsMode(mode: DemoReadMode) {
      optionsMode = mode;
    },
    setSubmissionMode(mode: DemoSubmissionMode) {
      submissionMode = mode;
    },
    addRun(run: RunListEntry, input?: CreateRunRequest) {
      if (input) admittedInputs.set(run.id, structuredClone(input));
      rows = [run, ...rows];
      runsMode = "ready";
    },
  };
}
export type RunsDemo = ReturnType<typeof createRunsDemo>;
const projectId = "project_demo";
function failure(status: number, code: ErrorCode, message: string) {
  return HttpResponse.json(
    zErrorEnvelope.parse({
      error: { code, message, details: [], requestId: "demo_request" },
    }),
    { status },
  );
}
function mockPath(origin: string, path: string) {
  return `${new URL(origin).origin}${path.replace(/\{([^}]+)\}/g, ":$1")}`;
}
function optionsFor(
  demo: RunsDemo,
  runnerId?: string | null,
  buildId?: string | null,
  profileId?: string | null,
) {
  const fixture = runOptionsFixture.data;
  const runner = fixture.runners.find((item) => item.id === runnerId);
  const available =
    runner?.connectionState === "CONNECTED" &&
    runner.capacityState === "AVAILABLE";
  const build = available && fixture.builds.some((item) => item.id === buildId);
  const profile =
    build && fixture.localProfiles.some((item) => item.id === profileId);
  return zRunOptionsEnvelope.parse({
    data: {
      ...fixture,
      runners: demo.optionsMode === "empty" ? [] : fixture.runners,
      builds: available ? fixture.builds : [],
      localProfiles: build ? fixture.localProfiles : [],
      suites: profile ? fixture.suites : [],
    },
  });
}

/** Only explicitly started MSW consumers intercept requests. No handler calls a live service. */
export function createRunsHandlers(origin: string, demo: RunsDemo) {
  return [
    http.get(
      mockPath(origin, operationPolicies.listRuns.path),
      async ({ request, params }) => {
        const url = new URL(request.url);
        const raw = Object.fromEntries(url.searchParams);
        const query = zListRunsQuery.strict().safeParse({
          ...raw,
          ...(raw.limit ? { limit: Number(raw.limit) } : {}),
        });
        if (
          !zListRunsHeaders.safeParse({
            "x-flf-contract-version": request.headers.get(
              "x-flf-contract-version",
            ),
          }).success
        )
          return failure(
            400,
            "CONTRACT_VERSION_UNSUPPORTED",
            "Refresh with the supported contract version.",
          );
        if (!zListRunsPath.safeParse(params).success || !query.success)
          return failure(
            422,
            "VALIDATION_FAILED",
            "The run filters are invalid.",
          );
        if (params.projectId !== projectId)
          return failure(404, "NOT_FOUND", "Project not found.");
        await delay(demo.runsMode === "loading" ? 1800 : 120);
        if (demo.runsMode === "error")
          return failure(
            500,
            "INTERNAL_ERROR",
            "The mock request failed. Your filters are preserved.",
          );
        // Deliberate malformed transport scenario, never a validated fixture or cache value.
        if (demo.runsMode === "invalid")
          return HttpResponse.json({
            data: [{ id: "invalid" }],
            meta: { nextCursor: null },
          });
        const q = query.data;
        const matching = (demo.runsMode === "empty" ? [] : demo.rows).filter(
          (row) =>
            (!q.search ||
              `${row.id} ${row.buildLabel} ${row.suiteTitle} ${row.runnerDisplayName}`
                .toLowerCase()
                .includes(q.search.toLowerCase())) &&
            (!q.executionState || row.executionState === q.executionState) &&
            (!q.evaluationOutcome ||
              row.evaluationOutcome === q.evaluationOutcome),
        );
        const offset = q.cursor ? Number(q.cursor.replace(/^offset_/, "")) : 0;
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          (q.cursor && !/^offset_\d+$/.test(q.cursor))
        )
          return failure(422, "VALIDATION_FAILED", "Invalid mock cursor.");
        return HttpResponse.json(
          zRunListEnvelope.parse({
            data: matching.slice(offset, offset + q.limit),
            meta: {
              nextCursor:
                offset + q.limit < matching.length
                  ? `offset_${offset + q.limit}`
                  : null,
            },
          }),
        );
      },
    ),
    http.get(
      mockPath(origin, operationPolicies.getRunOptions.path),
      async ({ request, params }) => {
        const query = zGetRunOptionsQuery
          .strict()
          .safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (
          !zGetRunOptionsHeaders.safeParse({
            "x-flf-contract-version": request.headers.get(
              "x-flf-contract-version",
            ),
          }).success
        )
          return failure(
            400,
            "CONTRACT_VERSION_UNSUPPORTED",
            "Refresh with the supported contract version.",
          );
        if (!zGetRunOptionsPath.safeParse(params).success || !query.success)
          return failure(
            422,
            "VALIDATION_FAILED",
            "Invalid run-option selection.",
          );
        if (params.projectId !== projectId)
          return failure(404, "NOT_FOUND", "Project not found.");
        await delay(demo.optionsMode === "loading" ? 1800 : 120);
        if (demo.optionsMode === "error")
          return failure(
            500,
            "INTERNAL_ERROR",
            "Couldn’t load runner options.",
          );
        if (demo.optionsMode === "invalid")
          return HttpResponse.json({ data: {} });
        return HttpResponse.json(
          optionsFor(
            demo,
            query.data.runnerId,
            query.data.buildId,
            query.data.localProfileId,
          ),
        );
      },
    ),
    http.post(
      mockPath(origin, operationPolicies.createRun.path),
      async ({ request, params }) => {
        if (
          !zCreateRunHeaders.shape["x-flf-contract-version"].safeParse(
            request.headers.get("x-flf-contract-version"),
          ).success
        )
          return failure(
            400,
            "CONTRACT_VERSION_UNSUPPORTED",
            "Refresh with the supported contract version.",
          );
        const headers = zCreateRunHeaders.safeParse({
          "x-flf-contract-version": request.headers.get(
            "x-flf-contract-version",
          ),
          "idempotency-key": request.headers.get("idempotency-key"),
        });
        if (!headers.success || !zCreateRunPath.safeParse(params).success)
          return failure(
            422,
            "VALIDATION_FAILED",
            "Invalid submission headers or project.",
          );
        if (params.projectId !== projectId)
          return failure(404, "NOT_FOUND", "Project not found.");
        let json: unknown;
        try {
          json = await request.json();
        } catch (error) {
          if (error instanceof SyntaxError)
            return failure(
              400,
              "INVALID_JSON",
              "The submission is not valid JSON.",
            );
          throw error;
        }
        const parsed = zCreateRunBody.safeParse(json);
        if (!parsed.success)
          return failure(
            422,
            "VALIDATION_FAILED",
            "Review the required run inputs and repetition bounds.",
          );
        const body: CreateRunRequest = parsed.data;
        const key = headers.data["idempotency-key"];
        const payload = JSON.stringify(body);
        await delay(700);
        const receipt = demo.receipts.get(key);
        if (receipt)
          return receipt.payload === payload
            ? HttpResponse.json(receipt.result, { status: 201 })
            : failure(
                409,
                "IDEMPOTENCY_CONFLICT",
                "Use a new key when changing run inputs.",
              );
        if (demo.submissionMode === "reject")
          return failure(
            409,
            "BUILD_UNAVAILABLE",
            "Nothing was queued. Runner availability changed. Your selections are preserved; review the runner or retry.",
          );
        const profile = runOptionsFixture.data.localProfiles.find(
          (item) => item.digest === body.localExecutionProfileDigest,
        );
        const available = optionsFor(
          demo,
          body.runnerId,
          body.buildId,
          profile?.id,
        ).data;
        const suite = available.suites.find(
          (item) => item.id === body.suiteRevisionId && item.eligible,
        );
        const build = available.builds.find((item) => item.id === body.buildId);
        const runner = available.runners.find(
          (item) => item.id === body.runnerId,
        );
        if (
          (demo.optionsMode !== "ready" && demo.optionsMode !== "loading") ||
          !profile ||
          !suite ||
          !build ||
          !runner ||
          body.repetitions < available.minimumRepetitions ||
          body.repetitions > available.maximumRepetitions
        )
          return failure(
            422,
            "CAPABILITY_UNSUPPORTED",
            "Selected inputs are no longer eligible. Review the runner and published suite.",
          );
        const result = zRunEnvelope.parse({
          data: {
            id: `run_${185 + demo.receipts.size}`,
            projectId,
            runnerId: body.runnerId,
            buildId: body.buildId,
            suiteRevisionId: body.suiteRevisionId,
            executionState: "QUEUED",
            evaluationOutcome: "NOT_EVALUATED",
            createdAt: new Date().toISOString(),
            startedAt: null,
            finishedAt: null,
            cancellationRequestedAt: null,
            cancellationDeadlineAt: null,
          },
        });
        demo.receipts.set(key, { payload, result });
        demo.addRun(
          zRunListEnvelope.parse({
            data: [
              {
                ...result.data,
                buildLabel: build.label,
                suiteTitle: suite.title,
                suiteRevision: suite.revision,
                runnerDisplayName: runner.displayName,
              },
            ],
            meta: { nextCursor: null },
          }).data[0]!,
          body,
        );
        // The receipt is committed, but the first acknowledgment fails validation.
        // Replaying its original key returns the valid receipt above.
        return HttpResponse.json(
          demo.submissionMode === "unconfirmed"
            ? { data: { id: result.data.id } }
            : result,
          { status: 201 },
        );
      },
    ),
    http.all(`${new URL(origin).origin}/api/*`, () =>
      failure(
        501,
        "NOT_IMPLEMENTED",
        "This operation is unavailable in the local demo.",
      ),
    ),
  ];
}
