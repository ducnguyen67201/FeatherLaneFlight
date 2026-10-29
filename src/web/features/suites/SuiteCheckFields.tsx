import { Stack, TextField, Typography } from "@mui/material";
import type { SuiteDraftContent, FieldError } from "@featherlane/contracts";

export type DraftCriterion = NonNullable<SuiteDraftContent["checks"]>[number];

export function SuiteCheckFields({
  check,
  prefix,
  issues = [],
  disabled = false,
  onChange,
}: {
  check: DraftCriterion;
  prefix: string;
  issues?: readonly FieldError[];
  disabled?: boolean;
  onChange: (check: DraftCriterion) => void;
}) {
  const error = (field: string) =>
    issues.find((i) => i.field === `${prefix}.${field}`)?.message;
  return (
    <Stack spacing={4}>
      <Typography variant="body2" color="text.secondary">
        {check.kind === "METRIC_THRESHOLD"
          ? "Rule: elapsed duration ≤ maximum, in seconds."
          : check.kind === "MISSION_COMPLETION"
            ? "Rule: mission completion observation must be true."
            : "Rule: landed and disarmed observations must both be true."}{" "}
        Wording describes the rule; it does not create measurements or change
        the evaluator.
      </Typography>
      <TextField
        fullWidth
        id={`${prefix}.title`}
        label="Criterion title"
        value={check.title ?? ""}
        disabled={disabled}
        error={!!error("title")}
        helperText={error("title")}
        slotProps={{ htmlInput: { maxLength: 128 } }}
        onChange={(e) => onChange({ ...check, title: e.target.value })}
      />
      {check.kind === "METRIC_THRESHOLD" && (
        <TextField
          fullWidth
          id={`${prefix}.threshold`}
          label="Maximum duration (seconds)"
          type="number"
          value={check.threshold ?? ""}
          disabled={disabled}
          error={!!error("threshold")}
          helperText={
            error("threshold") ??
            "0–86,400 seconds · lower is better. A missing limit can be saved as an incomplete draft."
          }
          slotProps={{ htmlInput: { min: 0, max: 86400, step: "any" } }}
          onChange={(e) =>
            onChange({
              ...check,
              threshold: e.target.value === "" ? null : Number(e.target.value),
              expected:
                e.target.value === ""
                  ? null
                  : `Synthetic mission duration is at most ${Number(e.target.value)} seconds.`,
            })
          }
        />
      )}
      <TextField
        fullWidth
        id={`${prefix}.expected`}
        label="Expected outcome description"
        multiline
        minRows={2}
        value={check.expected ?? ""}
        disabled={disabled}
        error={!!error("expected")}
        helperText={
          error("expected") ??
          (check.kind === "METRIC_THRESHOLD"
            ? "Updates with the maximum duration above."
            : "Describe the fixed rule above. This text is not executable.")
        }
        slotProps={{
          htmlInput: {
            maxLength: 512,
            readOnly: check.kind === "METRIC_THRESHOLD",
          },
        }}
        onChange={(e) => onChange({ ...check, expected: e.target.value })}
      />
      <TextField
        fullWidth
        id={`${prefix}.inconclusiveWhen`}
        label="Missing evidence description"
        multiline
        minRows={2}
        value={check.inconclusiveWhen ?? ""}
        disabled={disabled}
        error={!!error("inconclusiveWhen")}
        helperText={
          error("inconclusiveWhen") ??
          "Missing or invalid observations remain inconclusive."
        }
        slotProps={{ htmlInput: { maxLength: 512 } }}
        onChange={(e) =>
          onChange({ ...check, inconclusiveWhen: e.target.value })
        }
      />
      <Typography variant="caption" color="text.secondary">
        {check.id} · version {check.version} · {check.unit} · required evidence:{" "}
        {check.requiredEvidenceKinds?.join(", ")}
      </Typography>
    </Stack>
  );
}
