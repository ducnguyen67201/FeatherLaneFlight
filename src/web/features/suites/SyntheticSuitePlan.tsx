import { useState } from "react";
import {
  Box,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import ArrowForward from "@mui/icons-material/ArrowForward";
import type { SuiteRevisionView } from "@featherlane/contracts";

export function SyntheticSuitePlan({ suite }: { suite: SuiteRevisionView }) {
  const [scenarioId, setScenarioId] = useState(suite.scenarios[0]?.id ?? "");
  const [step, setStep] = useState(1);
  const scenario = suite.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error("Published suite has no selected scenario.");
  const checks = suite.checks.filter((check) =>
    scenario.checkIds.includes(check.id),
  );
  const steps = [
    {
      title: "Readiness",
      action: "Wait for the fake runner to report ready.",
      value: "Readiness confirmed",
    },
    {
      title: "Generate",
      action: `Generate ${scenario.parameters.durationMs / 1000} seconds of fake mission data.`,
      value: `Fixed seed ${scenario.parameters.randomSeed}`,
    },
    {
      title: "Collect",
      action: "Record the generated observations and process log.",
      value:
        "Synthetic completion, landed, disarmed, and duration observations",
    },
    {
      title: "Check",
      action: "Evaluate the configured checks against the generated evidence.",
      value: "Missing required evidence cannot pass",
    },
  ];
  const selected = steps[step];
  if (!selected) throw new Error("Unknown synthetic plan step.");
  return (
    <Stack spacing={4}>
      {suite.scenarios.length > 1 && (
        <TextField
          select
          size="small"
          label="Scenario"
          value={scenarioId}
          onChange={(event) => {
            setScenarioId(event.target.value);
            setStep(1);
          }}
        >
          {suite.scenarios.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.title}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Paper variant="outlined" sx={{ overflow: "hidden", minWidth: 0 }}>
        <Tabs
          value={step}
          onChange={(_, value: number) => setStep(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Synthetic scenario steps"
        >
          {steps.map((item, index) => (
            <Tab
              key={item.title}
              id={`synthetic-step-${index}`}
              aria-controls="synthetic-step-panel"
              label={`${index + 1}. ${item.title}`}
            />
          ))}
        </Tabs>
        <Box
          role="tabpanel"
          id="synthetic-step-panel"
          aria-labelledby={`synthetic-step-${step}`}
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Stack
            spacing={4}
            sx={{
              p: 6,
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "background.paper",
            }}
          >
            <ScienceOutlined
              sx={{
                fontSize: (theme) => theme.spacing(12),
                color: "primary.main",
              }}
            />
            <Stack
              direction="row"
              spacing={2}
              useFlexGap
              sx={{
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {steps.map((item, index) => (
                <Stack
                  key={item.title}
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: "center" }}
                >
                  <Typography
                    variant="body2"
                    color={step === index ? "primary" : "text.secondary"}
                  >
                    {item.title}
                  </Typography>
                  {index < steps.length - 1 && (
                    <ArrowForward
                      fontSize="small"
                      sx={{ color: "text.secondary" }}
                    />
                  )}
                </Stack>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Synthetic data only · no vehicle commands
            </Typography>
          </Stack>
          <Box sx={{ p: 5 }}>
            <Typography variant="caption" color="primary">
              STEP {step + 1} / {steps.length}
            </Typography>
            <Typography component="h2" variant="h2" sx={{ mt: 2, mb: 2 }}>
              {selected.title}
            </Typography>
            <Typography variant="body2" sx={{ mb: 3 }}>
              {selected.action}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selected.value}
            </Typography>
            <Stack spacing={3} sx={{ mt: 4 }}>
              {checks.map((check) => (
                <Box
                  key={check.id}
                  sx={{ pt: 3, borderTop: 1, borderColor: "divider" }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {check.title} · v{check.version}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {check.kind === "METRIC_THRESHOLD"
                      ? `Duration ≤ ${check.threshold} ${check.unit}`
                      : check.expected}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      </Paper>
    </Stack>
  );
}
