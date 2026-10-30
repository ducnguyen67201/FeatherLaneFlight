import { Stack, TextField } from "@mui/material";

export type ConditionField = "passWhen" | "failWhen";

export function RubricConditionsFields({
  prefix,
  passWhen,
  failWhen,
  errors = {},
  disabled = false,
  onChange,
  onBlur,
}: {
  prefix: string;
  passWhen: string;
  failWhen: string;
  errors?: Partial<Record<ConditionField, string>>;
  disabled?: boolean;
  onChange: (field: ConditionField, value: string) => void;
  onBlur: (field: ConditionField) => void;
}) {
  return (
    <Stack spacing={4}>
      <TextField
        id={`${prefix}.passWhen`}
        required
        fullWidth
        multiline
        minRows={3}
        label="PASS when"
        value={passWhen}
        disabled={disabled}
        error={!!errors.passWhen}
        helperText={
          errors.passWhen ??
          "What evidence establishes that the requirement was met?"
        }
        slotProps={{ htmlInput: { maxLength: 512 } }}
        onChange={(event) => onChange("passWhen", event.target.value)}
        onBlur={() => onBlur("passWhen")}
      />
      <TextField
        id={`${prefix}.failWhen`}
        required
        fullWidth
        multiline
        minRows={3}
        label="FAIL when"
        value={failWhen}
        disabled={disabled}
        error={!!errors.failWhen}
        helperText={
          errors.failWhen ??
          "Describe an observed failure. Missing evidence belongs under INCONCLUSIVE."
        }
        slotProps={{ htmlInput: { maxLength: 512 } }}
        onChange={(event) => onChange("failWhen", event.target.value)}
        onBlur={() => onBlur("failWhen")}
      />
    </Stack>
  );
}
