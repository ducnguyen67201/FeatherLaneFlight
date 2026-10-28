import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import LockOutlined from "@mui/icons-material/LockOutlined";
import type { ExecutionManifest, RunAttempt } from "@featherlane/contracts";
import { tokens } from "../../design/theme";

function rows(value: ExecutionManifest) {
  return [
    [
      "Contract / protocol",
      `${value.contractVersion} / ${value.protocolVersion}`,
    ],
    ["Build", value.buildId],
    ["Build digest", `sha256:${value.buildDigest}`],
    ["Configuration digest", `sha256:${value.configurationDigest}`],
    [
      "Suite revision",
      `${value.suiteRevisionId} · revision ${value.suiteRevision}`,
    ],
    ["Suite digest", `sha256:${value.suiteDigest}`],
    ["Integration profile", value.integrationProfileId],
    ["Integration digest", `sha256:${value.integrationProfileDigest}`],
    ["Local profile", value.localProfileId],
    ["Local profile digest", `sha256:${value.localProfileDigest}`],
    [
      "Runner / Python / MAVSDK / PX4",
      `${value.runnerVersion} / ${value.pythonVersion} / ${value.mavsdkVersion} / ${value.px4Version}`,
    ],
    [
      "Simulator / vehicle",
      `${value.simulator} / ${value.vehicleConfiguration}`,
    ],
    ["OS / architecture", `${value.operatingSystem} / ${value.architecture}`],
    ["Clock / speed", `${value.clockPolicy} / ${value.speedFactor}×`],
    [
      "Randomization / repetitions",
      `${value.randomizationPolicy}${value.randomSeed === null ? "" : ` · seed ${value.randomSeed}`} / ${value.repetitions} · no independence claim`,
    ],
    [
      "Frozen checks",
      value.checks
        .map((check) => `${check.title} v${check.version}: ${check.expected}`)
        .join("; "),
    ],
    [
      "Evidence policy / evaluator",
      `${value.evidencePolicy.join(" + ")} / ${value.evaluatorVersion}`,
    ],
  ];
}
export function RunManifestPanel({
  requested,
  attempts,
}: {
  requested: ExecutionManifest;
  attempts: RunAttempt[];
}) {
  const [source, setSource] = useState<"Requested" | "Observed">("Requested");
  const attempt = attempts.at(-1);
  const manifest =
    source === "Requested" ? requested : attempt?.observedManifest;
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
          : `Observed inputs belong to ${attempt?.id ?? "an attempt that has not started"} and freeze separately before mission commands. No comparison verdict is computed here.`}
      </Alert>
      {!manifest ? (
        <Typography color="text.secondary">
          Observed manifest unavailable until startup. The requested manifest
          remains inspectable.
        </Typography>
      ) : (
        <Box component="dl" sx={{ m: 0 }}>
          {rows(manifest).map(([label, value]) => (
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
