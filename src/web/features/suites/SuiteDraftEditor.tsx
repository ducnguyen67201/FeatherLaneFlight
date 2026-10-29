import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import type { SuiteDraftView, SuiteRevisionView } from "@featherlane/contracts";
import { PageLayout } from "../../layouts/PageLayout";
import { tokens } from "../../design/theme";
import { SuiteScenarioEditor } from "./SuiteScenarioEditor";
import { SuiteChecksEditor } from "./SuiteChecksEditor";
import { SuitePublishedHistory } from "./SuitePublishedHistory";
import {
  useSuiteDraftEditor,
  type DraftEditorConnection,
} from "./useSuiteDraftEditor";
import { useSuiteAuthoringProfiles } from "./useSuiteAuthoringProfiles";
import { SuiteSuggestionReview } from "./SuiteSuggestionReview";
import { useSuiteCriteriaSource } from "./useSuiteCriteriaSource";
export function SuiteDraftEditor({
  draft,
  connection,
  scope,
  organizationId,
  backHref,
  onSaved,
  onPublished,
  onReload,
}: {
  draft: SuiteDraftView;
  connection: DraftEditorConnection;
  scope: readonly unknown[];
  organizationId: string;
  backHref: string;
  onSaved: (draft: SuiteDraftView) => void;
  onPublished: (revision: SuiteRevisionView) => void;
  onReload: () => Promise<SuiteDraftView | undefined>;
}) {
  const editor = useSuiteDraftEditor(connection, draft, onSaved, onPublished);
  const suggestions = useSuiteCriteriaSource(
    connection,
    scope,
    draft.suiteId,
    editor.handleError,
  );
  const profiles = useSuiteAuthoringProfiles(
    connection,
    scope,
    editor.content.integrationProfileId ?? null,
  );
  const summary = useRef<HTMLDivElement>(null);
  const [criterionFocus, setCriterionFocus] = useState<{
    field: string;
    sequence: number;
  } | null>(null);
  useEffect(() => {
    if (editor.issueAttempt) summary.current?.focus();
  }, [editor.issueAttempt]);
  useEffect(() => {
    document.getElementById("main")?.focus();
  }, []);
  useEffect(() => {
    if (!editor.dirty && !editor.uncertainPublication) return;
    const leave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [editor.dirty, editor.uncertainPublication]);
  const disabled =
    editor.busy ||
    editor.review !== null ||
    editor.uncertainPublication !== null;
  const content = editor.content;
  const error = (field: string) =>
    editor.issues.find((i) => i.field === field)?.message;
  const panel = { p: { xs: 4, md: 6 }, minWidth: 0 };
  return (
    <PageLayout
      breadcrumbs={[
        <Link key="s" href={backHref}>
          Test suites
        </Link>,
        <Typography key="d" variant="body2">
          Edit draft
        </Typography>,
      ]}
      title="Suite draft"
      description="Configure scenarios and checks for this suite."
      actions={
        <Button component="a" href={backHref} startIcon={<ArrowBack />}>
          Back to suites
        </Button>
      }
    >
      <Stack spacing={6} sx={{ minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={3}
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Chip label="DRAFT" variant="outlined" />
          <Typography variant="body2" color="text.secondary">
            Draft version {editor.baselineVersion} ·{" "}
            {editor.dirty ? "Unsaved changes" : "Saved"}
          </Typography>
          <Chip label="Synthetic only" color="info" variant="outlined" />
        </Stack>
        {editor.notice && (
          <Alert
            severity={
              editor.notice.endsWith("published.") ||
              editor.notice === "Draft saved."
                ? "success"
                : "warning"
            }
          >
            {editor.notice}
          </Alert>
        )}
        {editor.conflict && (
          <Alert severity="warning">
            <AlertTitle>This draft changed elsewhere</AlertTitle>Copy any local
            edits you want to keep before loading the latest draft.
            <Box sx={{ mt: 3 }}>
              <Button
                color="inherit"
                variant="outlined"
                disabled={editor.busy}
                onClick={() => void editor.reload(onReload)}
              >
                Load latest (replace local edits)
              </Button>
            </Box>
          </Alert>
        )}
        {editor.uncertainPublication !== null && !editor.busy && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" onClick={editor.retryPublication}>
                Retry publication
              </Button>
            }
          >
            The publication response was not confirmed. Retry to recover its
            result before editing further.
          </Alert>
        )}
        {!!editor.issues.length && (
          <Box
            ref={summary}
            tabIndex={-1}
            role="alert"
            aria-label="Fields to complete"
          >
            <Alert severity="error" role="presentation">
              <AlertTitle>
                Resolve {editor.issues.length} publication{" "}
                {editor.issues.length === 1 ? "issue" : "issues"}
              </AlertTitle>
              {editor.issues.map((issue, i) => (
                <Typography variant="body2" key={`${issue.field}-${i}`}>
                  <Link
                    href={`#${issue.field}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (/^checks\.\d+\./.test(issue.field)) {
                        setCriterionFocus((previous) => ({
                          field: issue.field,
                          sequence: (previous?.sequence ?? 0) + 1,
                        }));
                        return;
                      }
                      (
                        document.getElementById(issue.field) ?? summary.current
                      )?.focus();
                    }}
                  >
                    {issue.message}
                  </Link>
                </Typography>
              ))}
              <Typography variant="body2" sx={{ mt: 2 }}>
                You can save this draft and finish it later.
              </Typography>
            </Alert>
          </Box>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              lg: `minmax(0,1fr) ${tokens.layoutPx.checkPaneWidth}px`,
            },
            gap: 6,
            alignItems: "start",
          }}
        >
          <Stack spacing={6} sx={{ minWidth: 0 }}>
            <Paper variant="outlined" sx={panel}>
              <Typography component="h2" variant="h2" sx={{ mb: 5 }}>
                Suite details
              </Typography>
              <Stack spacing={5} sx={{ minWidth: 0 }}>
                <TextField
                  id="title"
                  label="Suite title"
                  value={content.title ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    editor.change({ ...content, title: e.target.value })
                  }
                  error={!!error("title")}
                  helperText={error("title") ?? "Visible in the suite catalog."}
                  slotProps={{ htmlInput: { maxLength: 128 } }}
                  fullWidth
                />
                <TextField
                  id="description"
                  label="Description"
                  value={content.description ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    editor.change({ ...content, description: e.target.value })
                  }
                  error={!!error("description")}
                  helperText={error("description")}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                  multiline
                  minRows={2}
                  fullWidth
                />
                <TextField
                  id="integrationProfileId"
                  select
                  label="Integration profile"
                  value={content.integrationProfileId ?? ""}
                  disabled={disabled || profiles.loading}
                  error={!!error("integrationProfileId")}
                  helperText={
                    error("integrationProfileId") ??
                    "Select a registered synthetic profile."
                  }
                  onChange={(e) => {
                    const p = profiles.profiles.find(
                      (p) => p.id === e.target.value,
                    );
                    if (p)
                      editor.change({
                        ...content,
                        integrationProfileId: p.id,
                        integrationProfileRevision: p.revision,
                        integrationProfileDigest: p.digest,
                      });
                  }}
                  slotProps={{
                    inputLabel: { shrink: true },
                    select: { displayEmpty: true },
                  }}
                  fullWidth
                >
                  <MenuItem value="">Select a profile</MenuItem>
                  {content.integrationProfileId &&
                    !profiles.profiles.some(
                      (p) => p.id === content.integrationProfileId,
                    ) && (
                      <MenuItem value={content.integrationProfileId} disabled>
                        Selected profile (unavailable)
                      </MenuItem>
                    )}
                  {profiles.profiles.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} · revision {p.revision} · FAKE
                    </MenuItem>
                  ))}
                </TextField>
                {profiles.error && (
                  <Alert
                    severity="error"
                    action={
                      <Button color="inherit" onClick={profiles.retry}>
                        Retry
                      </Button>
                    }
                  >
                    Could not load integration profiles.
                  </Alert>
                )}
                {profiles.more && (
                  <Button
                    disabled={profiles.fetching}
                    onClick={profiles.loadMore}
                  >
                    Load more profiles
                  </Button>
                )}
                {!profiles.loading &&
                  !profiles.error &&
                  !profiles.profiles.length && (
                    <Typography variant="body2" color="text.secondary">
                      No registered synthetic profiles. Register one in Settings
                      before publishing.
                    </Typography>
                  )}
              </Stack>
            </Paper>
            <SuiteScenarioEditor
              content={content}
              issues={editor.issues}
              disabled={disabled}
              onChange={editor.change}
            />
          </Stack>
          <Stack spacing={5} sx={{ minWidth: 0 }}>
            <Paper variant="outlined" sx={panel}>
              <Typography component="h2" variant="h2" sx={{ mb: 4 }}>
                Publish
              </Typography>
              <Stack spacing={4}>
                <Typography variant="body2">
                  {editor.alreadyPublished ? "Next revision" : "Revision"}{" "}
                  <strong>
                    {draft.nextPublishedRevision ?? "limit reached"}
                  </strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Make this suite available for runs.
                </Typography>
                <Button
                  variant="outlined"
                  disabled={disabled || !editor.dirty || editor.conflict}
                  onClick={() => void editor.save()}
                >
                  Save draft
                </Button>
                <Button
                  variant="contained"
                  disabled={
                    disabled ||
                    editor.alreadyPublished ||
                    editor.conflict ||
                    draft.nextPublishedRevision === null
                  }
                  onClick={() => void editor.prepare()}
                >
                  {editor.busy
                    ? "Working…"
                    : editor.alreadyPublished
                      ? "Published"
                      : "Publish"}
                </Button>
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={panel}>
              <Typography component="h2" variant="h2" sx={{ mb: 4 }}>
                Evidence & requirements
              </Typography>
              <Stack spacing={3}>
                {content.evidencePolicy?.requiredKinds?.map((k) => (
                  <Chip key={k} label={k} variant="outlined" />
                ))}
                <Typography variant="body2">
                  Maximum artifact size:{" "}
                  {content.evidencePolicy?.maximumArtifactBytes === 1048576
                    ? "1 MiB"
                    : `${content.evidencePolicy?.maximumArtifactBytes ?? "not set"} bytes`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Missing required evidence → INCONCLUSIVE
                </Typography>
                <Divider />
                <Typography variant="caption" color="text.secondary">
                  Contract{" "}
                  {content.versionRequirements?.contractVersion ?? "not set"} ·
                  protocol{" "}
                  {content.versionRequirements?.protocolVersion ?? "not set"} ·
                  evaluator{" "}
                  {content.versionRequirements?.evaluatorVersion ?? "not set"}
                </Typography>
              </Stack>
            </Paper>
          </Stack>
        </Box>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0,1fr)",
              lg: "minmax(0,1fr) minmax(0,1fr)",
            },
            gap: 6,
            alignItems: "start",
          }}
        >
          <SuiteChecksEditor
            content={content}
            issues={editor.issues}
            disabled={disabled}
            onChange={editor.change}
            focusRequest={criterionFocus}
          />
          <SuiteSuggestionReview
            content={content}
            savedVersion={editor.baselineVersion}
            editVersion={editor.editVersion}
            disabled={disabled || editor.conflict}
            source={suggestions}
            onChange={editor.change}
          />
        </Box>
        <SuitePublishedHistory
          client={connection.client}
          scope={scope}
          projectId={connection.projectId}
          organizationId={organizationId}
          suiteId={draft.suiteId}
          onAccessFailure={connection.onAccessFailure}
        />
      </Stack>
      <Dialog
        open={editor.review !== null}
        onClose={editor.closeReview}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Publish revision {editor.review?.nextPublishedRevision}?
        </DialogTitle>
        <DialogContent>
          <Stack spacing={4} sx={{ pt: 2 }}>
            <Typography>{content.title}</Typography>
            <Typography variant="body2">
              {content.scenarios?.length ?? 0} nominal scenarios ·{" "}
              {content.checks?.length ?? 0} checks
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This revision will appear in the suite catalog.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 5 }}>
          <Button onClick={editor.closeReview}>Keep editing</Button>
          <Button variant="contained" onClick={editor.publish}>
            Publish
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
