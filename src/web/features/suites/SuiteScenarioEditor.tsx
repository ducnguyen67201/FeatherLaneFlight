import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import type {
  DraftScenario,
  FieldError,
  SuiteDraftContent,
} from "@featherlane/contracts";

export function SuiteScenarioEditor({
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
  const scenarios = content.scenarios ?? [];
  function update(index: number, change: Partial<DraftScenario>) {
    onChange({
      ...content,
      scenarios: scenarios.map((s, i) =>
        i === index ? { ...s, ...change } : s,
      ),
    });
  }
  function fieldError(index: number, field: string) {
    return issues.find((i) => i.field === `scenarios.${index}.${field}`)
      ?.message;
  }
  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, md: 6 } }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 4 }}
      >
        <Typography component="h2" variant="h2">
          Scenarios
        </Typography>
        <Chip label={`${scenarios.length} / 10`} />
      </Stack>
      {scenarios.map((scenario, index) => (
        <Box
          key={scenario.id ?? index}
          sx={{
            mb: 5,
            pt: index ? 5 : 0,
            borderTop: index ? 1 : 0,
            borderColor: "divider",
          }}
        >
          <Stack direction="row" sx={{ alignItems: "center", mb: 4 }}>
            <Typography component="h3" variant="body1" sx={{ flex: 1 }}>
              {String(index + 1).padStart(2, "0")} ·{" "}
              {scenario.title || "Untitled scenario"}
            </Typography>
            {index > 0 && (
              <Button
                disabled={disabled}
                color="inherit"
                startIcon={<DeleteOutlined />}
                onClick={() =>
                  onChange({
                    ...content,
                    scenarios: scenarios.filter((_, i) => i !== index),
                  })
                }
              >
                Remove
              </Button>
            )}
          </Stack>
          <Stack spacing={4}>
            <TextField
              id={`scenarios.${index}.title`}
              label="Scenario title"
              value={scenario.title ?? ""}
              disabled={disabled}
              onChange={(e) => update(index, { title: e.target.value })}
              error={!!fieldError(index, "title")}
              helperText={fieldError(index, "title")}
              slotProps={{ htmlInput: { maxLength: 128 } }}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={4}>
              <TextField
                label="Handler"
                value={
                  scenario.handlerId
                    ? `${scenario.handlerId} · v${scenario.handlerVersion ?? "?"}`
                    : ""
                }
                slotProps={{ input: { readOnly: true } }}
                fullWidth
              />
              <TextField
                label="Trigger"
                value={
                  scenario.trigger === "READINESS_CONFIRMED"
                    ? "Readiness confirmed"
                    : ""
                }
                slotProps={{ input: { readOnly: true } }}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={4}>
              <TextField
                id={`scenarios.${index}.parameters.durationMs`}
                label="Duration (ms)"
                type="number"
                value={scenario.parameters?.durationMs ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  update(index, {
                    parameters: {
                      ...scenario.parameters,
                      durationMs:
                        e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
                error={!!fieldError(index, "parameters.durationMs")}
                helperText={
                  fieldError(index, "parameters.durationMs") ??
                  "Whole number · 100–30,000 ms"
                }
                slotProps={{ htmlInput: { min: 100, max: 30000, step: 1 } }}
                fullWidth
              />
              <TextField
                id={`scenarios.${index}.parameters.randomSeed`}
                label="Random seed"
                type="number"
                value={scenario.parameters?.randomSeed ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  update(index, {
                    parameters: {
                      ...scenario.parameters,
                      randomSeed:
                        e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
                error={!!fieldError(index, "parameters.randomSeed")}
                helperText={
                  fieldError(index, "parameters.randomSeed") ??
                  "Whole number · 0–2,147,483,647"
                }
                slotProps={{ htmlInput: { min: 0, max: 2147483647, step: 1 } }}
                fullWidth
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Check references: {scenario.checkIds?.join(", ") || "none"}.
              Required capability: fake.nominal v1.
            </Typography>
          </Stack>
        </Box>
      ))}
      <Button
        variant="outlined"
        startIcon={<Add />}
        disabled={disabled || scenarios.length >= 10}
        onClick={() =>
          onChange({
            ...content,
            scenarios: [
              ...scenarios,
              {
                id: `scenario_${crypto.randomUUID().replaceAll("-", "")}`,
                title: "Nominal mission and landing",
                handlerId: "fake.nominal",
                handlerVersion: 1,
                trigger: "READINESS_CONFIRMED",
                parameters: { durationMs: null, randomSeed: null },
                requiredCapabilities: content.requiredCapabilities,
                checkIds: (content.checks ?? []).flatMap((c) =>
                  c.id ? [c.id] : [],
                ),
                requiredEvidenceKinds: content.evidencePolicy?.requiredKinds,
              },
            ],
          })
        }
      >
        Add nominal scenario
      </Button>
    </Paper>
  );
}
