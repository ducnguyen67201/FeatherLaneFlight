import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import type {
  RunRunnerOption,
  RunBuildOption,
  RunLocalProfileOption,
  RunSuiteOption,
} from "@featherlane/contracts";
import { capacity, connection } from "../../design/statusPresentation";

export function ReviewStep({
  live = false,
  runner,
  build,
  profile,
  suite,
  repetitions,
  locked,
  onEdit,
}: {
  live?: boolean;
  runner: RunRunnerOption | undefined;
  build: RunBuildOption | undefined;
  profile: RunLocalProfileOption | undefined;
  suite: RunSuiteOption | undefined;
  repetitions: string;
  locked: boolean;
  onEdit: (step: number) => void;
}) {
  const review: [string, string, number][] = [
    [
      "Runner",
      `${runner?.displayName ?? "Unavailable"} · ${runner ? connection[runner.connectionState].label : ""} / ${runner ? capacity[runner.capacityState].label : ""}`,
      0,
    ],
    [
      "Build",
      `${build?.label ?? "Unavailable"} · source ${build?.sourceRevision ?? "—"}`,
      1,
    ],
    ["Local profile", profile?.displayName ?? "Unavailable", 1],
    [
      "Published suite",
      `${suite?.title ?? "Unavailable"} · revision ${suite?.revision ?? "—"} · ${suite?.scenarioCount ?? "—"} scenario`,
      2,
    ],
    [
      "Trial matrix",
      `${suite?.scenarioCount ?? "—"} scenario × ${repetitions} repetitions = ${suite ? suite.scenarioCount * Number(repetitions) : "—"} trials`,
      3,
    ],
  ];
  return (
    <>
      <Typography variant="body2" color="text.secondary">
        Confirm the immutable inputs before requesting{" "}
        {live ? "a run" : "a mock run"}.
      </Typography>
      <Box component="dl" sx={{ m: 0 }}>
        {review.map(([label, value, index]) => (
          <Box
            key={label}
            sx={{
              py: 3,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Stack
              direction="row"
              sx={{
                alignItems: "center",
                justifyContent: "space-between",
                gap: 3,
              }}
            >
              <Typography
                component="dt"
                variant="caption"
                color="text.secondary"
              >
                {label}
              </Typography>
              <Button
                size="small"
                color="secondary"
                disabled={locked}
                onClick={() => onEdit(index)}
              >
                Edit {label.toLowerCase()}
              </Button>
            </Stack>
            <Typography component="dd" variant="body2" sx={{ m: 0 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ overflowWrap: "anywhere" }}
      >
        Profile digest · sha256:
        {profile?.digest ?? "unavailable"}
      </Typography>
      <Alert severity="info">
        {live ? "The server" : "The mock transport"} rechecks selected inputs on
        submission. Acceptance only acknowledges a queued request; it does not
        establish execution or a passing outcome.
      </Alert>
    </>
  );
}
