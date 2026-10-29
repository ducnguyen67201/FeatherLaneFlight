import { delay, http, HttpResponse } from "msw";
import {
  operationPolicies,
  type ErrorCode,
  type RunDetail,
  type RunListEntry,
} from "@featherlane/contracts";
import {
  zCancelRunBody,
  zCancelRunHeaders,
  zCancelRunPath,
  zErrorEnvelope,
  zGetRunDetailHeaders,
  zGetRunDetailPath,
  zGetRunEventsQuery,
  zRunEnvelope,
} from "@featherlane/contracts/validators";
import type { RunsDemo } from "./runsDemo";
import {
  detailModes,
  makeDetailSnapshot,
  type DetailMode,
} from "./runDetailFixtures";
export { detailModes, type DetailMode };

function failure(status: number, code: ErrorCode, message: string) {
  return HttpResponse.json(
    zErrorEnvelope.parse({
      error: { code, message, details: [], requestId: "detail_demo_request" },
    }),
    { status },
  );
}
function listEntry(row: RunListEntry, detail: RunDetail): RunListEntry {
  return {
    ...row,
    executionState: detail.executionState,
    evaluationOutcome: detail.evaluationOutcome,
    startedAt: detail.startedAt,
    finishedAt: detail.finishedAt,
    cancellationRequestedAt: detail.cancellationRequestedAt,
    cancellationDeadlineAt: detail.cancellationDeadlineAt,
  };
}
function summary(row: RunListEntry) {
  const { buildLabel, suiteTitle, suiteRevision, runnerDisplayName, ...value } =
    row;
  return zRunEnvelope.parse({ data: value });
}
export function createRunDetailDemo(runs: RunsDemo) {
  const modes = new Map<string, DetailMode>();
  const intents = new Map<
    string,
    { requestedAt: string; deadlineAt: string | null }
  >();
  const receipts = new Map<
    string,
    { payload: string; result: ReturnType<typeof summary>; status: 200 | 202 }
  >();
  const find = (id: string) =>
    runs.rows.find((row) => row.id === id && row.projectId === "project_demo");
  const snapshot = (id: string) => {
    const row = find(id);
    return row
      ? makeDetailSnapshot(
          row,
          runs.inputFor(id),
          modes.get(id) ?? "Recorded snapshot",
          intents.get(id) ?? null,
        )
      : null;
  };
  return {
    recoverRead(id: string) {
      if (
        ["Stale view", "Request error", "Loading"].includes(modes.get(id) ?? "")
      )
        modes.set(id, "Recorded snapshot");
    },
    mode(id: string) {
      return modes.get(id) ?? "Recorded snapshot";
    },
    setMode(id: string, mode: DetailMode) {
      modes.set(id, mode);
      intents.delete(id);
      const row = find(id);
      const data = snapshot(id)?.detail.data;
      if (row && data) runs.replaceRun(listEntry(row, data));
    },
    handlers(origin: string) {
      const path = (operation: { path: string }) =>
        `${new URL(origin).origin}${operation.path.replace(/\{([^}]+)\}/g, ":$1")}`;
      const validate = (request: Request, params: Record<string, unknown>) => {
        if (
          !zGetRunDetailHeaders.safeParse({
            "x-flf-contract-version": request.headers.get(
              "x-flf-contract-version",
            ),
          }).success
        )
          return {
            error: failure(
              400,
              "CONTRACT_VERSION_UNSUPPORTED",
              "Refresh with the supported contract version.",
            ),
          };
        const parsed = zGetRunDetailPath.safeParse(params);
        if (!parsed.success)
          return {
            error: failure(422, "VALIDATION_FAILED", "Invalid run identifier."),
          };
        const data = snapshot(parsed.data.runId);
        if (!data)
          return { error: failure(404, "NOT_FOUND", "Run not found.") };
        return { runId: parsed.data.runId, data };
      };
      const readDelay = async (id: string) => {
        await delay(modes.get(id) === "Loading" ? 1800 : 120);
        return ["Stale view", "Request error"].includes(modes.get(id) ?? "")
          ? failure(
              500,
              "INTERNAL_ERROR",
              "The mock snapshot could not be refreshed. The last valid data is preserved.",
            )
          : null;
      };
      return [
        http.get(
          path(operationPolicies.getRunDetail),
          async ({ request, params }) => {
            const value = validate(request, params);
            if (value.error) return value.error;
            if (new URL(request.url).search)
              return failure(
                422,
                "VALIDATION_FAILED",
                "Unexpected detail query parameters.",
              );
            const error = await readDelay(value.runId);
            if (error) return error;
            return HttpResponse.json(snapshot(value.runId)!.detail);
          },
        ),
        http.get(
          path(operationPolicies.getRunArtifacts),
          async ({ request, params }) => {
            const value = validate(request, params);
            if (value.error) return value.error;
            if (new URL(request.url).search)
              return failure(
                422,
                "VALIDATION_FAILED",
                "Unexpected artifact query parameters.",
              );
            const error = await readDelay(value.runId);
            if (error) return error;
            return HttpResponse.json(snapshot(value.runId)!.artifacts);
          },
        ),
        http.get(
          path(operationPolicies.getRunEvents),
          async ({ request, params }) => {
            const value = validate(request, params);
            if (value.error) return value.error;
            const url = new URL(request.url);
            const raw = Object.fromEntries(url.searchParams);
            const query = zGetRunEventsQuery.strict().safeParse({
              ...raw,
              ...(url.searchParams.has("limit")
                ? { limit: Number(raw.limit) }
                : {}),
            });
            if (!query.success)
              return failure(
                422,
                "VALIDATION_FAILED",
                "Invalid event cursor or page limit.",
              );
            const error = await readDelay(value.runId);
            if (error) return error;
            const data = snapshot(value.runId)!.events.data;
            const index = query.data.after
              ? data.findIndex((record) => record.cursor === query.data.after)
              : -1;
            if (
              query.data.after &&
              query.data.after !== `${value.runId}_event_0` &&
              index < 0
            )
              return failure(
                410,
                "CURSOR_EXPIRED",
                "Read a fresh run snapshot before resuming events.",
              );
            const offset = index + 1;
            const limit = query.data.limit ?? 100;
            const page = data.slice(offset, offset + limit);
            return HttpResponse.json({
              data: page,
              meta: {
                nextCursor:
                  offset + limit < data.length ? page.at(-1)!.cursor : null,
              },
            });
          },
        ),
        http.post(
          path(operationPolicies.cancelRun),
          async ({ request, params }) => {
            const value = validate(request, params);
            if (value.error) return value.error;
            const headers = zCancelRunHeaders.safeParse({
              "x-flf-contract-version": request.headers.get(
                "x-flf-contract-version",
              ),
              "x-csrf-token": request.headers.get("x-csrf-token"),
              "idempotency-key": request.headers.get("idempotency-key"),
            });
            if (!headers.success || !zCancelRunPath.safeParse(params).success)
              return failure(
                422,
                "VALIDATION_FAILED",
                "A valid cancellation key and run are required.",
              );
            let json: unknown;
            try {
              json = await request.json();
            } catch {
              return failure(
                400,
                "INVALID_JSON",
                "Cancellation requires a JSON body.",
              );
            }
            const body = zCancelRunBody.safeParse(json);
            if (!body.success)
              return failure(
                422,
                "VALIDATION_FAILED",
                "Invalid cancellation request.",
              );
            const payload = JSON.stringify(body.data);
            const key = `${value.runId}:${headers.data["idempotency-key"]}`;
            // The resource is looked up on every replay before its stored receipt is returned.
            const receipt = receipts.get(key);
            if (receipt)
              return receipt.payload === payload
                ? HttpResponse.json(receipt.result, { status: receipt.status })
                : failure(
                    409,
                    "IDEMPOTENCY_CONFLICT",
                    "Cancellation key belongs to another payload.",
                  );
            await delay(
              modes.get(value.runId) === "Cancellation pending" ? 1800 : 120,
            );
            if (modes.get(value.runId) === "Cancellation rejected")
              return failure(
                409,
                "VALIDATION_FAILED",
                "The mock cancellation request was rejected; no intent was recorded.",
              );
            let data = snapshot(value.runId)!.detail.data;
            if (data.executionState === "QUEUED") {
              const requestedAt = new Date().toISOString();
              modes.set(value.runId, "Recorded snapshot");
              intents.set(value.runId, { requestedAt, deadlineAt: null });
              runs.replaceRun({
                ...find(value.runId)!,
                executionState: "CANCELED",
                evaluationOutcome: "NOT_EVALUATED",
                startedAt: null,
                finishedAt: requestedAt,
                cancellationRequestedAt: requestedAt,
                cancellationDeadlineAt: null,
              });
              data = snapshot(value.runId)!.detail.data;
            }
            const status = ["COMPLETED", "CANCELED", "ERROR"].includes(
              data.executionState,
            )
              ? 200
              : 202;
            if (status === 202 && !intents.has(value.runId)) {
              const requestedAt = new Date().toISOString();
              intents.set(value.runId, {
                requestedAt,
                deadlineAt: new Date(
                  Date.parse(requestedAt) + 30000,
                ).toISOString(),
              });
              data = snapshot(value.runId)!.detail.data;
            }
            const row = listEntry(find(value.runId)!, data);
            runs.replaceRun(row);
            const result = summary(row);
            receipts.set(key, { payload, result, status });
            return HttpResponse.json(result, { status });
          },
        ),
      ];
    },
  };
}
