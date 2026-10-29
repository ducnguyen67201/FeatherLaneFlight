import { useState } from "react";
import {
  Box,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import { runsDemo } from "../../mocks/browser";
import type { DemoReadMode } from "../../mocks/runsDemo";
const readModes: { value: DemoReadMode; label: string }[] = [
  { value: "ready", label: "Populated" },
  { value: "loading", label: "Loading" },
  { value: "empty", label: "No runs yet" },
  { value: "error", label: "Request error" },
  { value: "invalid", label: "Invalid response" },
];
export function RunsDemoControls({
  onRunsChange,
  onOptionsChange,
}: {
  onRunsChange: () => void;
  onOptionsChange: () => void;
}) {
  const [runsMode, setRunsMode] = useState<DemoReadMode>("ready");
  const [optionsMode, setOptionsMode] = useState<DemoReadMode>("ready");
  const [submissionMode, setSubmissionMode] = useState("accept");
  const selectStyle = { minWidth: { xs: "100%", sm: 180 }, flex: 1 };
  return (
    <Paper variant="outlined" sx={{ p: 4, mb: 6 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={4}
        sx={{ alignItems: { md: "center" } }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            <ScienceOutlined
              fontSize="small"
              sx={{ verticalAlign: "middle", mr: 2 }}
            />
            Mock workspace
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Local mock data · demo controls below
          </Typography>
        </Box>
        <TextField
          select
          label="Runs state"
          size="small"
          value={runsMode}
          sx={selectStyle}
          onChange={(e) => {
            const mode = readModes.find(
              (item) => item.value === e.target.value,
            )?.value;
            if (mode) {
              runsDemo.setRunsMode(mode);
              setRunsMode(mode);
              onRunsChange();
            }
          }}
        >
          {readModes.map((item) => (
            <MenuItem key={item.value} value={item.value}>
              {item.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Run options"
          size="small"
          value={optionsMode}
          sx={selectStyle}
          onChange={(e) => {
            const mode = readModes.find(
              (item) => item.value === e.target.value,
            )?.value;
            if (mode) {
              runsDemo.setOptionsMode(mode);
              setOptionsMode(mode);
              onOptionsChange();
            }
          }}
        >
          {readModes.map((item) => (
            <MenuItem key={item.value} value={item.value}>
              {item.value === "ready"
                ? "Available"
                : item.value === "empty"
                  ? "No runners"
                  : item.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Mock submission"
          size="small"
          value={submissionMode}
          sx={selectStyle}
          onChange={(e) => {
            if (
              e.target.value === "accept" ||
              e.target.value === "reject" ||
              e.target.value === "unconfirmed"
            ) {
              runsDemo.setSubmissionMode(e.target.value);
              setSubmissionMode(e.target.value);
            }
          }}
        >
          <MenuItem value="accept">Accept as queued</MenuItem>
          <MenuItem value="reject">Reject submission</MenuItem>
          <MenuItem value="unconfirmed">Malformed acknowledgment once</MenuItem>
        </TextField>
      </Stack>
    </Paper>
  );
}
