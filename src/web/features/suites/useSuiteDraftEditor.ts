import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  contractManifest,
  editJudgeSuiteDraft,
  validateJudgeSuiteDraft,
  publishJudgeSuiteDraft,
  type createValidatedClient,
  type FieldError,
  type DraftJudgeRubric,
  type SuiteDraftContent,
  type JudgeSuiteDraftView,
  type SuiteRevisionView,
  type SuiteDraftValidation,
} from "@featherlane/contracts";
import { zSuiteDraftContent } from "@featherlane/contracts/validators";
import type { DraftEditPrecondition } from "./useSuiteSuggestions";

export type DraftEditorConnection = {
  client: ReturnType<typeof createValidatedClient>;
  projectId: string;
  csrfToken: string;
  onAccessFailure: (status: 401 | 403 | 404) => void;
};
export function useSuiteDraftEditor(
  connection: DraftEditorConnection,
  draft: JudgeSuiteDraftView,
  onSaved: (draft: JudgeSuiteDraftView) => void,
  onPublished: (revision: SuiteRevisionView) => void,
) {
  const [content, setContent] = useState(draft.content);
  const [nextDraft, setNextDraft] = useState(false);
  const [rubric, setRubric] = useState(draft.rubric);
  const editVersion = useRef(0);
  const baseline = useRef({
    version: draft.draftVersion,
    content: JSON.stringify([draft.content, draft.rubric]),
  });
  const [publishedVersion, setPublishedVersion] = useState<number | null>(
    draft.publishedRevisionId ? draft.draftVersion : null,
  );
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  const [issues, setIssues] = useState<FieldError[]>([]);
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState<SuiteDraftValidation | null>(null);
  const [uncertainPublication, setUncertainPublication] =
    useState<SuiteDraftValidation | null>(null);
  const [issueAttempt, setIssueAttempt] = useState(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const dirty =
    nextDraft || JSON.stringify([content, rubric]) !== baseline.current.content;
  const headers = {
    "x-flf-contract-version": contractManifest.contractVersion,
    "x-csrf-token": connection.csrfToken,
  };
  const path = { projectId: connection.projectId, suiteId: draft.suiteId };
  function reset(saved: JudgeSuiteDraftView) {
    editVersion.current += 1;
    baseline.current = {
      version: saved.draftVersion,
      content: JSON.stringify([saved.content, saved.rubric]),
    };
    setPublishedVersion(saved.publishedRevisionId ? saved.draftVersion : null);
    setNextDraft(false);
    setContent(saved.content);
    setRubric(saved.rubric);
    setIssues([]);
    setConflict(false);
    setNotice("");
  }
  function change(
    next: SuiteDraftContent,
    expected?: DraftEditPrecondition,
    nextRubric: DraftJudgeRubric = rubric,
  ): boolean {
    if (pending.current || uncertainPublication !== null || review !== null)
      return false;
    if (
      expected &&
      (expected.savedVersion !== baseline.current.version ||
        expected.editVersion !== editVersion.current)
    )
      return false;
    editVersion.current += 1;
    setContent(next);
    setRubric(nextRubric);
    setNotice("");
    return true;
  }
  function showIssues(next: FieldError[]) {
    const visible = next.map((issue) => {
      if (
        issue.code === "incomplete" &&
        issue.field.startsWith("integrationProfile")
      )
        return {
          ...issue,
          field: "integrationProfileId",
          message: "Select a registered integration profile.",
        };
      if (
        issue.code === "incomplete" &&
        /^checks\.\d+\.threshold$/.test(issue.field)
      )
        return {
          ...issue,
          message: "Enter a maximum duration before publishing.",
        };
      return issue;
    });
    setIssues(
      visible.filter(
        (issue, index) =>
          visible.findIndex(
            (other) =>
              other.field === issue.field && other.message === issue.message,
          ) === index,
      ),
    );
    setIssueAttempt((n) => n + 1);
  }
  function handle(error: unknown) {
    if (!active.current) return;
    if (error instanceof ApiError) {
      if (
        error.status === 401 ||
        error.status === 403 ||
        error.status === 404
      ) {
        connection.onAccessFailure(error.status);
        return;
      }
      if (error.detail.code === "SUITE_DRAFT_CONFLICT") setConflict(true);
      setNotice(error.message);
      if (error.detail.details.length) showIssues(error.detail.details);
    } else if (!(
      error instanceof DOMException && error.name === "AbortError"
    )) {
      setNotice(
        "The request could not be confirmed. Check the connection and try again.",
      );
    }
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      handle(error);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function saveContent(): Promise<JudgeSuiteDraftView | null> {
    const parsed = zSuiteDraftContent.safeParse(content);
    if (!parsed.success) {
      showIssues(
        parsed.error.issues.slice(0, 50).map((issue) => ({
          field: issue.path.join("."),
          code: "invalid_value",
          message: issue.message.slice(0, 256),
        })),
      );
      return null;
    }
    const saved = await editJudgeSuiteDraft({
      client: connection.client,
      headers,
      path,
      body: { expectedDraftVersion: baseline.current.version, content, rubric },
    });
    if (!active.current) return null;
    reset(saved.data);
    onSaved(saved.data);
    return saved.data;
  }
  async function prepare() {
    await run(async () => {
      const saved = dirty ? await saveContent() : draft;
      if (!saved || !active.current) return;
      const result = await validateJudgeSuiteDraft({
        client: connection.client,
        headers,
        path,
        body: { expectedDraftVersion: baseline.current.version },
      });
      if (!active.current) return;
      if (!result.data.valid) {
        showIssues(result.data.issues);
        return;
      }
      setIssues([]);
      if (
        !result.data.definitionDigest ||
        result.data.nextPublishedRevision === null
      )
        throw new Error("Publication review is incomplete.");
      setReview(result.data);
    });
  }
  async function publish(reviewed: SuiteDraftValidation) {
    await run(async () => {
      setReview(null);
      setUncertainPublication(reviewed);
      try {
        const result = await publishJudgeSuiteDraft({
          client: connection.client,
          headers,
          path,
          body: {
            expectedDraftVersion: reviewed.draftVersion,
            expectedDefinitionDigest: reviewed.definitionDigest,
          },
        });
        if (!active.current) return;
        setUncertainPublication(null);
        setPublishedVersion(reviewed.draftVersion);
        setNotice(`Revision ${result.data.revision} published.`);
        onPublished(result.data);
      } catch (error) {
        if (active.current && error instanceof ApiError && error.status < 500)
          setUncertainPublication(null);
        throw error;
      }
    });
  }
  return {
    content,
    rubric,
    changeRubric: (next: DraftJudgeRubric) => change(content, undefined, next),
    startNextDraft: () => {
      setPublishedVersion(null);
      setNextDraft(true);
    },
    change,
    dirty,
    busy,
    issues,
    notice,
    conflict,
    issueAttempt,
    baselineVersion: baseline.current.version,
    editVersion: editVersion.current,
    handleError: handle,
    alreadyPublished: !dirty && publishedVersion === baseline.current.version,
    review,
    closeReview: () => setReview(null),
    uncertainPublication,
    save: () =>
      run(async () => {
        if (await saveContent()) setNotice("Draft saved.");
      }),
    prepare,
    publish: () => {
      if (review !== null) void publish(review);
    },
    retryPublication: () => {
      if (uncertainPublication !== null) void publish(uncertainPublication);
    },
    reload: (load: () => Promise<JudgeSuiteDraftView | undefined>) =>
      run(async () => {
        const latest = await load();
        if (latest && active.current) reset(latest);
      }),
    reset,
  };
}
