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
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import { zCheckDefinition } from "@featherlane/contracts/validators";
import type { SuiteDraftContent, FieldError } from "@featherlane/contracts";
import { SuiteCheckFields, type DraftCriterion } from "./SuiteCheckFields";
import {
  useSuiteSuggestions,
  type SuiteSuggestionSource,
  type DraftEditPrecondition,
} from "./useSuiteSuggestions";

export function SuiteSuggestionReview(props: {
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
  const { content, disabled, source } = props;
  const suggestions = useSuiteSuggestions(props);
  const {
    description,
    busy,
    checks,
    unsupportedRequirements,
    model,
    message,
    failed,
    stale,
    generate,
  } = suggestions;
  const [editing, setEditing] = useState<DraftCriterion | null>(null);
  const [editIssues, setEditIssues] = useState<FieldError[]>([]);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setEditing(null);
    setEditIssues([]);
  }, [source]);
  function saveSuggestion() {
    if (!editing || stale || disabled) return;
    const parsed = zCheckDefinition.safeParse(editing);
    if (!parsed.success) {
      setEditIssues(
        parsed.error.issues.map((issue) => ({
          field: `suggestion.${issue.path.join(".")}`,
          code: "invalid",
          message: issue.message,
        })),
      );
      requestAnimationFrame(() =>
        document
          .getElementById(
            `suggestion.${parsed.error.issues[0]?.path.join(".")}`,
          )
          ?.focus(),
      );
      return;
    }
    suggestions.edit(parsed.data);
    setEditing(null);
    setEditIssues([]);
  }
  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, md: 6 }, minWidth: 0 }}>
      <Stack spacing={4}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <AutoAwesomeOutlined color="primary" />
          <Typography
            ref={reviewHeading}
            component="h2"
            variant="h2"
            tabIndex={-1}
          >
            AI suggestions
          </Typography>
        </Stack>
        <Chip
          label={model ? `OpenAI · ${model}` : source.label}
          variant="outlined"
          sx={{ alignSelf: "start" }}
        />
        <Typography variant="body2" color="text.secondary">
          Describe your mission. Review each suggested criterion before adding
          it to the draft.
        </Typography>
        {source.checking && (
          <Typography role="status" variant="body2">
            Checking suggestion availability…
          </Typography>
        )}
        {!source.checking && !source.request && (
          <Alert severity="info">
            Suggestions are unavailable. You can author and publish criteria
            manually.
          </Alert>
        )}
        <TextField
          fullWidth
          label="Mission description"
          multiline
          minRows={3}
          value={description}
          disabled={disabled || busy || !source.request}
          helperText="Current support: mission completion, landing/disarm and elapsed duration. Other measurements need producer and evaluator support."
          slotProps={{ htmlInput: { maxLength: 2000 } }}
          onChange={(e) => suggestions.describe(e.target.value)}
        />
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeOutlined />}
          disabled={disabled || busy || !source.request || !description.trim()}
          onClick={() => void generate()}
        >
          {busy ? "Preparing suggestions…" : "Suggest criteria"}
        </Button>
        {source.request && source.disclosure && (
          <Typography variant="caption" color="text.secondary">
            {source.disclosure}
          </Typography>
        )}
        {busy && (
          <Box role="status" aria-live="polite">
            <LinearProgress />
            <Typography variant="body2" sx={{ mt: 2 }}>
              Preparing a reviewable draft. You can keep editing manually.
            </Typography>
            <Button onClick={suggestions.cancel}>Cancel request</Button>
          </Box>
        )}
        {message && (
          <Alert severity={failed ? "error" : "info"} role="status">
            {message}
          </Alert>
        )}
        {checks !== null && checks.length > 0 && stale && (
          <Alert severity="warning">
            <AlertTitle>Draft changed after this request</AlertTitle>These
            suggestions cannot replace your newer edits. Request new suggestions
            to review the current draft.
          </Alert>
        )}
        {unsupportedRequirements.map((requirement, index) => (
          <Alert severity="warning" key={index}>
            {requirement}
          </Alert>
        ))}
        {checks !== null && !checks.length && (
          <Alert severity="success">
            {unsupportedRequirements.length
              ? "No further supported suggestions. Review the unsupported requirements above."
              : "All suggestions reviewed. Save your draft when ready."}
          </Alert>
        )}
        {checks?.map((check) => {
          const original = content.checks?.find((c) => c.id === check.id);
          return (
            <Box
              key={check.id}
              sx={{ border: 1, borderColor: "divider", p: 4 }}
            >
              <Stack spacing={3}>
                <Typography component="h3" variant="body1">
                  {check.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {check.kind} · version {check.version}
                </Typography>
                {check.kind === "METRIC_THRESHOLD" && (
                  <Typography variant="body2">
                    Maximum duration: {original?.threshold ?? "not set"} s →{" "}
                    <strong>{check.threshold} s</strong>
                  </Typography>
                )}
                <Typography variant="body2">{check.expected}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Missing evidence: {check.inconclusiveWhen}
                </Typography>
                <Stack
                  direction="row"
                  spacing={2}
                  useFlexGap
                  sx={{ flexWrap: "wrap" }}
                >
                  <Button
                    variant="contained"
                    disabled={disabled || stale}
                    onClick={() => {
                      if (suggestions.accept(check))
                        requestAnimationFrame(() =>
                          reviewHeading.current?.focus(),
                        );
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    disabled={disabled || stale}
                    onClick={() => {
                      setEditing(check);
                      setEditIssues([]);
                    }}
                  >
                    Edit suggestion
                  </Button>
                  <Button
                    color="inherit"
                    disabled={disabled}
                    onClick={() => {
                      suggestions.reject(check.id);
                      requestAnimationFrame(() =>
                        reviewHeading.current?.focus(),
                      );
                    }}
                  >
                    Reject
                  </Button>
                </Stack>
              </Stack>
            </Box>
          );
        })}
        <Divider />
        <Typography variant="caption" color="text.secondary">
          Suggestions do not create observations or qualify flight behavior.
          Only Publish creates a new immutable suite revision.
        </Typography>
      </Stack>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="edit-suggestion-title"
      >
        <DialogTitle id="edit-suggestion-title">Edit suggestion</DialogTitle>
        <DialogContent>
          <Stack spacing={4} sx={{ pt: 2 }}>
            <Alert severity="info">
              Changes stay in review until you choose Accept.
            </Alert>
            {stale && (
              <Alert severity="warning">
                Draft changed. Close this dialog and request new suggestions.
              </Alert>
            )}
            {editing && (
              <SuiteCheckFields
                check={editing}
                prefix="suggestion"
                issues={editIssues}
                disabled={disabled || stale}
                onChange={setEditing}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={disabled || stale}
            onClick={saveSuggestion}
          >
            Keep for review
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
