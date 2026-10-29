import { useEffect, useRef, useState } from "react";
import {
  zSuiteDraftContent,
  zSuiteCriteriaSuggestions,
} from "@featherlane/contracts/validators";
import type {
  CheckDefinition,
  SuiteDraftContent,
} from "@featherlane/contracts";
import {
  InvalidSuiteSuggestion,
  validateSuiteSuggestions,
} from "./suiteSuggestionPolicy";

export type SuiteSuggestionSource = {
  label: string;
  checking?: boolean;
  disclosure?: string;
  request:
    | ((
        description: string,
        savedVersion: number,
        signal: AbortSignal,
      ) => Promise<unknown>)
    | null;
};

export type DraftEditPrecondition = {
  savedVersion: number;
  editVersion: number;
};
type Batch = DraftEditPrecondition & {
  checks: CheckDefinition[];
  expectedContent: string;
  unsupportedRequirements: string[];
  model: string;
};

export function useSuiteSuggestions({
  content,
  savedVersion,
  editVersion,
  disabled,
  source,
  onChange,
}: {
  content: SuiteDraftContent;
  savedVersion: number;
  editVersion: number;
  disabled: boolean;
  source: SuiteSuggestionSource;
  onChange: (
    content: SuiteDraftContent,
    expected: DraftEditPrecondition,
  ) => boolean;
}) {
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const latest = useRef({ content, savedVersion, editVersion, disabled });
  latest.current = { content, savedVersion, editVersion, disabled };
  const stale =
    batch !== null &&
    (batch.expectedContent !== JSON.stringify(content) ||
      batch.savedVersion !== savedVersion ||
      batch.editVersion !== editVersion);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setBatch(null);
    setMessage("");
    setFailed(false);
  }, [source]);

  async function generate() {
    if (
      pending.current ||
      latest.current.disabled ||
      !source.request ||
      !description.trim()
    )
      return;
    const controller = new AbortController();
    pending.current = controller;
    const capture = latest.current;
    setBusy(true);
    setBatch(null);
    setMessage("");
    setFailed(false);
    try {
      const response = await source.request(
        description.trim(),
        capture.savedVersion,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const parsed = zSuiteCriteriaSuggestions.safeParse(response);
      if (
        !parsed.success ||
        parsed.data.draftVersion !== capture.savedVersion ||
        (!parsed.data.checks.length &&
          !parsed.data.unsupportedRequirements.length)
      )
        throw new InvalidSuiteSuggestion(
          "Suggestions do not match the expected draft or canonical contract. Your draft is unchanged.",
        );
      setBatch({
        checks: validateSuiteSuggestions(parsed.data.checks, capture.content),
        unsupportedRequirements: parsed.data.unsupportedRequirements,
        model: parsed.data.model,
        expectedContent: JSON.stringify(capture.content),
        savedVersion: capture.savedVersion,
        editVersion: capture.editVersion,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailed(true);
      setMessage(
        error instanceof InvalidSuiteSuggestion
          ? error.message
          : "Suggestions could not be loaded. Retry or continue editing manually.",
      );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  function accept(check: CheckDefinition): boolean {
    if (!batch || latest.current.disabled) return false;
    const live = latest.current;
    if (
      batch.expectedContent !== JSON.stringify(live.content) ||
      batch.savedVersion !== live.savedVersion ||
      batch.editVersion !== live.editVersion
    ) {
      setMessage(
        "Draft changed. Request new suggestions; your edits are preserved.",
      );
      return false;
    }
    try {
      validateSuiteSuggestions([check], live.content);
      const next = {
        ...live.content,
        checks: live.content.checks?.map((c) =>
          c.id === check.id ? check : c,
        ),
      };
      if (!zSuiteDraftContent.safeParse(next).success)
        throw new InvalidSuiteSuggestion(
          "Resolve invalid draft fields before accepting this suggestion.",
        );
      if (
        !onChange(next, {
          savedVersion: batch.savedVersion,
          editVersion: batch.editVersion,
        })
      ) {
        setMessage(
          "Draft changed or is busy. Your edits are preserved; review again before accepting.",
        );
        return false;
      }
      setBatch({
        ...batch,
        checks: batch.checks.filter((c) => c.id !== check.id),
        expectedContent: JSON.stringify(next),
        editVersion: batch.editVersion + 1,
      });
      setFailed(false);
      setMessage(
        `Accepted ${check.title} into your local draft. Save and Publish remain separate.`,
      );
      return true;
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof InvalidSuiteSuggestion
          ? error.message
          : "Suggestion is invalid.",
      );
      return false;
    }
  }
  return {
    description,
    busy,
    checks: batch?.checks ?? null,
    unsupportedRequirements: batch?.unsupportedRequirements ?? [],
    model: batch?.model,
    message,
    failed,
    stale,
    generate,
    describe: (value: string) => {
      setDescription(value);
      setBatch(null);
      setMessage("");
      setFailed(false);
    },
    cancel: () => {
      pending.current?.abort();
      pending.current = null;
      setBusy(false);
      setMessage("Suggestion request cancelled. Draft unchanged.");
    },
    accept,
    reject: (id: string) => {
      if (batch)
        setBatch({ ...batch, checks: batch.checks.filter((c) => c.id !== id) });
    },
    edit: (check: CheckDefinition) => {
      if (batch && !stale && !latest.current.disabled)
        setBatch({
          ...batch,
          checks: batch.checks.map((c) => (c.id === check.id ? check : c)),
        });
    },
  };
}
