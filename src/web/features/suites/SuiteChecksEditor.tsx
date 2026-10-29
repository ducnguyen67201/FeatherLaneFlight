import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import type { FieldError, SuiteDraftContent } from "@featherlane/contracts";
export function SuiteChecksEditor({
  content,
  issues,
  disabled,
  onChange,
}: {
  content: SuiteDraftContent;
  issues: readonly FieldError[];
  disabled: boolean;
  onChange: (content: SuiteDraftContent) => void;
}) {
  const checks = content.checks ?? [];
  const metricIndex = checks.findIndex((c) => c.kind === "METRIC_THRESHOLD");
  const metric = checks[metricIndex];
  const error = issues.find(
    (i) => i.field === `checks.${metricIndex}.threshold`,
  )?.message;
  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, md: 6 } }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 4 }}
      >
        <Typography id="checks" component="h2" variant="h2" tabIndex={-1}>
          Checks
        </Typography>
        <Chip label="Version 1" variant="outlined" />
      </Stack>
      <Stack spacing={5}>
        {checks
          .filter((c) => c.kind !== "METRIC_THRESHOLD")
          .map((c) => (
            <Box key={c.id}>
              <Typography component="h3" variant="body1">
                {c.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {c.expected} Inconclusive: {c.inconclusiveWhen}
              </Typography>
            </Box>
          ))}
        <Divider />
        {metric?.kind === "METRIC_THRESHOLD" ? (
          <Box>
            <Stack
              direction="row"
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                mb: 4,
              }}
            >
              <Typography component="h3" variant="body1">
                {metric.title}
              </Typography>
              <Button
                color="inherit"
                disabled={disabled}
                startIcon={<DeleteOutlined />}
                onClick={() =>
                  onChange({
                    ...content,
                    checks: checks.filter((_, i) => i !== metricIndex),
                    scenarios: content.scenarios?.map((s) => ({
                      ...s,
                      checkIds: s.checkIds?.filter((id) => id !== metric.id),
                    })),
                  })
                }
              >
                Remove
              </Button>
            </Stack>
            <TextField
              id={`checks.${metricIndex}.threshold`}
              label="Maximum duration (seconds)"
              type="number"
              value={metric.threshold ?? ""}
              disabled={disabled}
              error={!!error}
              helperText={
                error ??
                "Lower is better · 0–86,400 seconds · observations required."
              }
              slotProps={{ htmlInput: { min: 0, max: 86400, step: "any" } }}
              onChange={(e) => {
                const threshold =
                  e.target.value === "" ? null : Number(e.target.value);
                onChange({
                  ...content,
                  checks: checks.map((c, i) =>
                    i === metricIndex
                      ? {
                          ...metric,
                          threshold,
                          expected:
                            threshold === null
                              ? null
                              : `Synthetic mission duration is at most ${threshold} seconds.`,
                        }
                      : c,
                  ),
                });
              }}
              fullWidth
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              Inconclusive when duration or clock evidence is missing.
            </Typography>
          </Box>
        ) : (
          <Button
            startIcon={<Add />}
            disabled={disabled || checks.length >= 10}
            variant="outlined"
            onClick={() =>
              onChange({
                ...content,
                checks: [
                  ...checks,
                  {
                    id: "duration",
                    version: 1,
                    kind: "METRIC_THRESHOLD",
                    title: "Mission duration",
                    unit: "s",
                    threshold: null,
                    expected: null,
                    requiredEvidenceKinds: ["OBSERVATIONS"],
                    inconclusiveWhen:
                      "Duration or clock observation is missing.",
                  },
                ],
                scenarios: content.scenarios?.map((s) => ({
                  ...s,
                  checkIds: [...(s.checkIds ?? []), "duration"],
                })),
              })
            }
          >
            Add duration check
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
