import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  contractManifest,
  getSuiteCriteriaSuggestionStatusOptions,
  suggestSuiteCriteria,
} from "@featherlane/contracts";
import type { DraftEditorConnection } from "./useSuiteDraftEditor";
import type { SuiteSuggestionSource } from "./useSuiteSuggestions";

export function useSuiteCriteriaSource(
  connection: DraftEditorConnection,
  scope: readonly unknown[],
  suiteId: string,
  onConflict: (error: unknown) => void,
): SuiteSuggestionSource {
  const { client, projectId } = connection;
  const latest = useRef({ connection, onConflict });
  latest.current = { connection, onConflict };
  const status = useQuery(
    getSuiteCriteriaSuggestionStatusOptions(
      {
        client,
        path: { projectId, suiteId },
        headers: { "x-flf-contract-version": contractManifest.contractVersion },
      },
      scope,
    ),
  );
  useEffect(() => {
    const error = status.error;
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    )
      latest.current.connection.onAccessFailure(error.status);
  }, [status.error]);
  const available = status.data?.data.available === true;
  const model = status.data?.data.model;
  return useMemo<SuiteSuggestionSource>(
    () => ({
      label: model ? `OpenAI · ${model}` : "OpenAI · not configured",
      checking: status.isPending,
      disclosure:
        "Only your entered mission description and the fixed supported-check schema are sent to OpenAI. Suggestions require your review.",
      request: available
        ? async (description, savedVersion, signal) => {
            try {
              const result = await suggestSuiteCriteria({
                client,
                path: { projectId, suiteId },
                headers: {
                  "x-flf-contract-version": contractManifest.contractVersion,
                  "x-csrf-token": latest.current.connection.csrfToken,
                },
                body: {
                  missionDescription: description,
                  expectedDraftVersion: savedVersion,
                },
                signal,
              });
              return result.data;
            } catch (error) {
              if (error instanceof ApiError) {
                if (
                  error.status === 401 ||
                  error.status === 403 ||
                  error.status === 404
                )
                  latest.current.connection.onAccessFailure(error.status);
                else if (error.detail.code === "SUITE_DRAFT_CONFLICT")
                  latest.current.onConflict(error);
              }
              throw error;
            }
          }
        : null,
    }),
    [available, model, status.isPending, client, projectId, suiteId],
  );
}
