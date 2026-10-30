import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import Add from "@mui/icons-material/Add";
import type {
  SuiteDraftContent,
  FieldError,
  DraftJudgeRubric,
} from "@featherlane/contracts";
import { RubricConditionsFields } from "./RubricConditionsFields";
import { SuiteCheckFields } from "./SuiteCheckFields";

export function SuiteChecksEditor({
  content,
  rubric,
  onRubricChange,
  issues,
  disabled,
  onChange,
  focusRequest,
}: {
  content: SuiteDraftContent;
  rubric: DraftJudgeRubric;
  onRubricChange: (rubric: DraftJudgeRubric) => void;
  issues: readonly FieldError[];
  disabled: boolean;
  onChange: (content: SuiteDraftContent) => void;
  focusRequest: { field: string; sequence: number } | null;
}) {
  const [expanded, setExpanded] = useState<string | false>("duration");
  const focusedSequence = useRef(0);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!focusRequest || focusedSequence.current === focusRequest.sequence)
      return;
    const index = Number(focusRequest.field.split(".")[1]);
    const check = content.checks?.[index];
    if (!check) return;
    if (expanded !== check.id) {
      setExpanded(check.id ?? false);
      return;
    }
    const frame = requestAnimationFrame(() => {
      document.getElementById(focusRequest.field)?.focus();
      focusedSequence.current = focusRequest.sequence;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, expanded, content.checks]);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, md: 6 }, minWidth: 0 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}
      >
        <Typography id="checks" component="h2" variant="h2" tabIndex={-1}>
          Criteria
        </Typography>
        <Chip label="3 supported checks" variant="outlined" />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 5 }}>
        Author criteria manually, or review suggestions alongside your draft.
        The synthetic reference profile uses these three checks.
      </Typography>
      {(content.checks ?? []).map((check, index) => (
        <Accordion
          key={check.id ?? index}
          expanded={expanded === check.id}
          onChange={(_, open) =>
            setExpanded(open ? (check.id ?? false) : false)
          }
          disableGutters
          elevation={0}
          sx={{
            border: 1,
            borderColor: "divider",
            "&:before": { display: "none" },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMore />}
            id={`criterion-${check.id}`}
            aria-controls={`criterion-${check.id}-fields`}
          >
            <Stack spacing={1} sx={{ py: 2, minWidth: 0 }}>
              <Typography component="h3" variant="body1">
                {check.title || "Untitled criterion"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {check.kind === "METRIC_THRESHOLD"
                  ? `Duration ≤ ${check.threshold ?? "—"} s`
                  : check.kind === "MISSION_COMPLETION"
                    ? "Mission completed = true"
                    : "Landed + disarmed = true"}
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails id={`criterion-${check.id}-fields`}>
            <SuiteCheckFields
              check={check}
              prefix={`checks.${index}`}
              issues={issues}
              disabled={disabled}
              onChange={(next) =>
                onChange({
                  ...content,
                  checks: content.checks?.map((c, i) =>
                    i === index ? next : c,
                  ),
                })
              }
            />
            <RubricConditionsFields
              prefix={`checks.${index}`}
              onBlur={(field) =>
                setTouched(
                  (current) => new Set([...current, `${check.id}.${field}`]),
                )
              }
              errors={Object.fromEntries(
                (["passWhen", "failWhen"] as const).map((field) => [
                  field,
                  issues.find(
                    (issue) => issue.field === `checks.${index}.${field}`,
                  )?.message ??
                    (touched.has(`${check.id}.${field}`) &&
                    !rubric.criteria
                      .find((c) => c.checkId === check.id)
                      ?.[field]?.trim()
                      ? "Complete this condition before publication."
                      : undefined),
                ]),
              )}
              passWhen={
                rubric.criteria.find((c) => c.checkId === check.id)?.passWhen ??
                ""
              }
              failWhen={
                rubric.criteria.find((c) => c.checkId === check.id)?.failWhen ??
                ""
              }
              disabled={disabled}
              onChange={(field, value) => {
                if (!check.id || !check.version) return;
                const next = {
                  checkId: check.id,
                  checkVersion: check.version,
                  passWhen: null,
                  failWhen: null,
                  ...rubric.criteria.find((c) => c.checkId === check.id),
                  [field]: value,
                };
                onRubricChange({
                  version: 1,
                  criteria: [
                    ...rubric.criteria.filter((c) => c.checkId !== check.id),
                    next,
                  ],
                });
              }}
            />
          </AccordionDetails>
        </Accordion>
      ))}
      {!content.checks?.some((check) => check.kind === "METRIC_THRESHOLD") && (
        <Button
          variant="outlined"
          startIcon={<Add />}
          disabled={disabled || (content.checks?.length ?? 0) >= 10}
          sx={{ mt: 4 }}
          onClick={() => {
            onChange({
              ...content,
              checks: [
                ...(content.checks ?? []),
                {
                  id: "duration",
                  version: 1,
                  kind: "METRIC_THRESHOLD",
                  title: "Mission duration",
                  unit: "s",
                  threshold: null,
                  expected: null,
                  requiredEvidenceKinds: ["OBSERVATIONS"],
                  inconclusiveWhen: "Duration or clock observation is missing.",
                },
              ],
              scenarios: content.scenarios?.map((s) => ({
                ...s,
                checkIds: [...(s.checkIds ?? []), "duration"],
              })),
            });
            setExpanded("duration");
          }}
        >
          Add duration check
        </Button>
      )}
    </Paper>
  );
}
