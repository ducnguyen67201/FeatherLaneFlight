import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { StatusBadge } from "../../src/web/components/StatusBadge";
import { check } from "../../src/web/design/statusPresentation";
import { tokens } from "../../src/web/design/theme";
import {
  artifacts,
  checkLabels,
  checkOutcome,
  digest,
  events,
  manifestRows,
  type Mode,
} from "./presentation";

export function ChecksPanel({
  mode,
  trial,
  onTrialChange,
}: {
  mode: Mode;
  trial: number;
  onTrialChange: (value: number) => void;
}) {
  const [selected, setSelected] = useState(2);
  const result = checkOutcome(mode, selected);
  const waiting = mode === "Queued";
  const empty = mode === "Empty trials" || waiting;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          lg: `${tokens.layoutPx.checkPaneWidth}px minmax(0, 1fr)`,
        },
        gap: 4,
        alignItems: "start",
      }}
    >
      <Paper sx={{ p: 4 }}>
        <Typography component="h2" variant="h2" sx={{ mb: 3 }}>
          Trials and checks
        </Typography>
        {empty ? (
          <Typography color="text.secondary">
            {waiting
              ? "Trials have not started. Observed inputs and results are not available yet."
              : "No trials were recorded in this snapshot."}
          </Typography>
        ) : (
          <>
            <List disablePadding aria-label="Trials">
              {[0, 1, 2].map((index) => (
                <ListItemButton
                  key={index}
                  selected={trial === index}
                  aria-current={trial === index ? "true" : undefined}
                  onClick={() => onTrialChange(index)}
                  sx={{ minHeight: 44, mb: 1 }}
                >
                  <ListItemText
                    primary={`Nominal flight · ${index + 1}`}
                    secondary={`Repetition ${index + 1} of 3`}
                  />
                </ListItemButton>
              ))}
            </List>
            <Divider sx={{ my: 3 }} />
            <Typography variant="caption" color="text.secondary">
              CHECKS · REPETITION {trial + 1}
            </Typography>
            <List disablePadding aria-label="Checks">
              {checkLabels.map((label, index) => (
                <ListItemButton
                  key={label}
                  selected={selected === index}
                  onClick={() => setSelected(index)}
                  aria-current={selected === index ? "true" : undefined}
                  sx={{ minHeight: 44, my: 1, flexWrap: "wrap", gap: 1 }}
                >
                  <ListItemText primary={label} sx={{ flexBasis: "100%" }} />
                  {checkOutcome(mode, index) ? (
                    <StatusBadge value={check[checkOutcome(mode, index)!]} />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      No final evaluation
                    </Typography>
                  )}
                </ListItemButton>
              ))}
            </List>
          </>
        )}
      </Paper>
      <Paper sx={{ p: { xs: 4, md: 6 }, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          SELECTED CHECK · NOMINAL FLIGHT {trial + 1}
        </Typography>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 3,
            mt: 2,
            mb: 4,
          }}
        >
          <Typography component="h2" variant="h2">
            {empty ? "No check selected" : checkLabels[selected]}
          </Typography>
          {!empty && result && <StatusBadge value={check[result]} />}
        </Stack>
        {empty ? (
          <Alert severity="info">
            {waiting
              ? "Waiting for execution. No values are inferred from missing observations."
              : "The manifest and evidence tabs remain available for inspection."}
          </Alert>
        ) : (
          <>
            <Typography color="text.secondary" sx={{ mb: 5 }}>
              Requirement {selected + 1} · nominal-v1 · version 1
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 4,
                mb: 5,
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  EXPECTED
                </Typography>
                <Typography sx={{ mt: 2 }}>
                  {
                    [
                      "Mission completion observed",
                      "Landed and disarmed observed",
                      "Mission duration ≤ 90.0 s",
                    ][selected]
                  }
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  OBSERVED
                </Typography>
                <Typography sx={{ mt: 2 }}>
                  {!result || result === "INCONCLUSIVE"
                    ? "No sufficient validated observation"
                    : [
                        "Mission completed",
                        "Landed + disarmed",
                        mode === "Tests passed"
                          ? "84.2 s · 1 sample"
                          : "91.4 s · 1 sample",
                      ][selected]}
                </Typography>
              </Box>
            </Box>
            <Alert
              severity={
                result === "FAIL"
                  ? "error"
                  : result === "INCONCLUSIVE"
                    ? "warning"
                    : "info"
              }
            >
              {result === "FAIL"
                ? "The observed duration exceeds the frozen threshold by 1.4 s. This is an assertion failure, not an execution error."
                : result === "INCONCLUSIVE"
                  ? "Required observations are missing or unverified. No passing result is inferred."
                  : result === "PASS"
                    ? "This synthetic check has a recorded passing evaluation. It makes no real flight reliability claim."
                    : "No final check evaluation is available. Retained observations do not establish a run outcome."}
            </Alert>
            <Divider sx={{ my: 5 }} />
            <Typography component="h3" variant="h3" sx={{ mb: 3 }}>
              Evidence references
            </Typography>
            <Typography variant="body2">
              observations.json ·{" "}
              {
                ["mission_completion", "landing_disarm", "completion_duration"][
                  selected
                ]
              }{" "}
              · trial_{trial + 1}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Source clock: simulation · elapsed 96,400 ms · sample time
              96400000 µs
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {mode === "Expired evidence"
                ? "Raw evidence expired. Historical evaluation retained; descriptive inspection only."
                : mode === "Missing evidence"
                  ? "ULog missing · observation reference unavailable."
                  : "Inspect availability, verification and retention in Evidence."}
            </Typography>
          </>
        )}
      </Paper>
    </Box>
  );
}

export function TimelinePanel({ mode, trial }: { mode: Mode; trial: number }) {
  const empty = ["Queued", "Empty trials"].includes(mode);
  const active = [
    "Running",
    "Stale view",
    "Cancellation pending",
    "Cancellation rejected",
    "Infrastructure error",
    "Cancellation unconfirmed",
    "Canceled",
  ].includes(mode);
  const shown = empty ? [] : active ? events.slice(0, 4) : events;
  const wallTimes = [
    "16:01:00.000Z",
    "16:01:01.000Z",
    "16:01:03.100Z",
    "16:01:05.000Z",
    "16:02:36.400Z",
    "16:02:37.000Z",
    "16:02:38.000Z",
  ];
  const selectedEvents = trial === 0 ? shown : [];
  return (
    <Paper sx={{ p: 5, minWidth: 0 }}>
      <Typography component="h2" variant="h2">
        Event log
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 4 }}>
        Attempt 1 · repetition {trial + 1} · {selectedEvents.length} events ·
        synthetic snapshot
      </Typography>
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          bgcolor: "background.default",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <Stack
          direction="row"
          sx={{
            px: 4,
            py: 3,
            borderBottom: 1,
            borderColor: "divider",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Typography variant="code" color="primary">
            $ events.log
          </Typography>
          <Typography variant="caption" color="text.secondary">
            2026-10-28 UTC · STATIC SNAPSHOT
          </Typography>
        </Stack>
        <Box
          component="pre"
          aria-label="Recorded event log"
          tabIndex={0}
          sx={{
            m: 0,
            p: 4,
            maxHeight: `${tokens.layoutPx.eventLogMaxHeightVh}vh`,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            fontFamily: tokens.typography.fontFamily.mono,
            typography: "code",
          }}
        >
          {selectedEvents.length === 0
            ? "[no recorded events in this trial snapshot]"
            : selectedEvents.map(([sequence, type, elapsed, detail]) => (
                <Box
                  component="span"
                  key={sequence}
                  sx={{ display: "block", mb: 3, "&:last-child": { mb: 0 } }}
                >
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {wallTimes[Number(sequence) - 1]} +{elapsed} #
                    {sequence?.padStart(3, "0")}{" "}
                  </Box>
                  <Box component="span" sx={{ color: "info.main" }}>
                    {type}
                  </Box>
                  {"\n"}
                  {"  └─ "}
                  {detail}
                </Box>
              ))}
        </Box>
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 3 }}
      >
        Wall time: UTC · elapsed: monotonic · simulation time unavailable in
        this sample.
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 2 }}
      >
        Read-only snapshot · cursor demo_cursor_7 · no live stream or terminal
        commands.
      </Typography>
    </Paper>
  );
}

export function ManifestPanel({ mode }: { mode: Mode }) {
  const [source, setSource] = useState<"Requested" | "Observed">("Requested");
  const missing = source === "Observed" && mode === "Queued";
  return (
    <Paper sx={{ p: 5, minWidth: 0 }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 3,
        }}
      >
        <Typography component="h2" variant="h2">
          Frozen execution inputs
        </Typography>
        <Chip size="small" icon={<LockOutlined />} label="Immutable snapshot" />
      </Stack>
      <Stack direction="row" spacing={2} sx={{ my: 4 }}>
        {(["Requested", "Observed"] as const).map((value) => (
          <Button
            key={value}
            variant={source === value ? "contained" : "outlined"}
            aria-pressed={source === value}
            onClick={() => setSource(value)}
          >
            {value}
          </Button>
        ))}
      </Stack>
      <Alert severity="info" sx={{ mb: 4 }}>
        {source === "Requested"
          ? "Requested inputs were frozen at admission. They are never rewritten to match observed inputs."
          : "Observed inputs belong to attempt 1 and are frozen separately before mission commands. This sample shows matching inputs; no compatibility verdict is computed."}
      </Alert>
      {missing ? (
        <Typography color="text.secondary">
          Observed manifest unavailable until startup. The requested manifest
          remains inspectable.
        </Typography>
      ) : (
        <Box component="dl" sx={{ m: 0 }}>
          {manifestRows.map(([label, value]) => (
            <Box
              key={label}
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: `${tokens.layoutPx.manifestLabelWidth}px minmax(0, 1fr)`,
                },
                borderBottom: 1,
                borderColor: "divider",
                gap: 2,
                py: 3,
              }}
            >
              <Typography component="dt" variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography
                component="dd"
                variant="body2"
                sx={{
                  m: 0,
                  overflowWrap: "anywhere",
                  fontFamily: value?.includes("sha256:")
                    ? tokens.typography.fontFamily.mono
                    : undefined,
                }}
              >
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}

export function EvidencePanel({ mode, trial }: { mode: Mode; trial: number }) {
  const [selected, setSelected] = useState<(typeof artifacts)[number] | null>(
    null,
  );
  const availability =
    mode === "Expired evidence"
      ? "Expired"
      : mode === "Missing evidence"
        ? "Missing"
        : mode === "Queued"
          ? "Not collected"
          : "Available";
  return (
    <Paper sx={{ p: 5, minWidth: 0 }}>
      <Typography component="h2" variant="h2">
        Evidence and artifacts
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ my: 3 }}>
        Attempt 1 · repetition {trial + 1} · private synthetic metadata
      </Typography>
      <Alert
        severity={availability === "Available" ? "info" : "warning"}
        sx={{ mb: 4 }}
      >
        {availability === "Expired"
          ? "Raw evidence expired on 2026-10-27 UTC. Historical summaries remain, but comparison would be descriptive only."
          : availability === "Missing"
            ? "Required ULog is missing. Evidence references cannot be treated as verified observations."
            : availability === "Not collected"
              ? "No evidence collected before execution."
              : "3 sample artifacts · metadata only. No upload or signed download is connected."}
      </Alert>
      <Stack spacing={3}>
        {artifacts.map((artifact, index) => (
          <Box
            key={artifact.name}
            sx={{ borderBottom: 1, borderColor: "divider", pb: 3 }}
          >
            <Stack
              direction="row"
              sx={{
                alignItems: "center",
                flexWrap: "wrap",
                gap: 3,
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body1" sx={{ overflowWrap: "anywhere" }}>
                  {artifact.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {artifact.kind} · {artifact.size}
                </Typography>
              </Box>
              <Button
                startIcon={<DescriptionOutlined />}
                variant="outlined"
                onClick={() => setSelected(artifact)}
              >
                Metadata
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {availability === "Missing" && index > 0
                ? "Available · verified sample"
                : availability}{" "}
              ·{" "}
              {availability === "Available"
                ? "hash verified sample · retained until 2026-10-29 UTC"
                : "no download available"}
            </Typography>
          </Box>
        ))}
      </Stack>
      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Evidence metadata</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 3 }}>{selected?.name}</Typography>
          <Typography variant="body2">
            {selected?.type} · {selected?.size}
          </Typography>
          <Typography variant="body2" sx={{ my: 3 }}>
            Scope: run / attempt 1 / trial {trial + 1}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              overflowWrap: "anywhere",
              fontFamily: tokens.typography.fontFamily.mono,
            }}
          >
            {digest}
          </Typography>
          <Typography variant="body2" sx={{ my: 3 }}>
            Redaction: process output redacted · creation:{" "}
            {mode === "Expired evidence"
              ? "2026-10-26 16:04"
              : "2026-10-28 16:04"}{" "}
            UTC · retention:{" "}
            {mode === "Expired evidence" ? "2026-10-27" : "2026-10-29"} UTC
          </Typography>
          <Alert severity="info">
            Metadata remains inspectable when content is missing or expired.
            Preview files cannot be downloaded.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
