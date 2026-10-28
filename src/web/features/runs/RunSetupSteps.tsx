import {
  Alert,
  AlertTitle,
  Box,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  RunRunnerOption,
  RunBuildOption,
  RunLocalProfileOption,
  RunSuiteOption,
} from "@featherlane/contracts";
import { capacity, connection } from "../../design/statusPresentation";
import { StatusBadge } from "../../components/StatusBadge";

export function RunnerStep({
  runners,
  runnerId,
  attempted,
  availableRunner,
  onSelect,
}: {
  runners: RunRunnerOption[];
  runnerId: string;
  attempted: boolean;
  availableRunner: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <Typography variant="body2" color="text.secondary">
        Connection health and capacity are separate. Only an available,
        compatible runner can accept this mock run.
      </Typography>
      {runners.length === 0 ? (
        <Alert severity="info">
          <AlertTitle>No runners registered</AlertTitle>Register a runner before
          creating a run.
        </Alert>
      ) : (
        <FormControl error={attempted && !availableRunner}>
          <FormLabel id="runner-label">Runner</FormLabel>
          <RadioGroup
            aria-labelledby="runner-label"
            value={runnerId}
            onChange={(e) => onSelect(e.target.value)}
          >
            {runners.map((item) => (
              <FormControlLabel
                key={item.id}
                value={item.id}
                disabled={
                  item.connectionState !== "CONNECTED" ||
                  item.capacityState !== "AVAILABLE"
                }
                control={<Radio />}
                label={
                  <Box sx={{ py: 3 }}>
                    <Typography variant="body2">
                      {item.displayName} · {item.hostPlatform}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{ mt: 2, flexWrap: "wrap" }}
                    >
                      <StatusBadge value={connection[item.connectionState]} />
                      <StatusBadge value={capacity[item.capacityState]} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Last seen{" "}
                      {item.lastSeenAt
                        ? `${item.lastSeenAt.slice(0, 16).replace("T", " ")} UTC`
                        : "unknown"}{" "}
                      · synthetic fixture
                    </Typography>
                  </Box>
                }
              />
            ))}
          </RadioGroup>
          {attempted && !availableRunner && (
            <Typography role="alert" variant="body2" color="error">
              Select an available runner to continue.
            </Typography>
          )}
        </FormControl>
      )}
    </>
  );
}

export function BuildProfileStep({
  builds,
  profiles,
  buildId,
  profileId,
  build,
  profile,
  attempted,
  refreshing,
  onBuild,
  onProfile,
}: {
  builds: RunBuildOption[];
  profiles: RunLocalProfileOption[];
  buildId: string;
  profileId: string;
  build: RunBuildOption | undefined;
  profile: RunLocalProfileOption | undefined;
  attempted: boolean;
  refreshing: boolean;
  onBuild: (id: string) => void;
  onProfile: (id: string) => void;
}) {
  return (
    <>
      <Typography variant="body2" color="text.secondary">
        Only this runner’s approved local declarations are shown. Changing an
        input clears the suite selection.
      </Typography>
      <TextField
        select
        size="small"
        label="Available build"
        value={buildId}
        onChange={(e) => onBuild(e.target.value)}
        error={attempted && !build}
        helperText={
          attempted && !build
            ? "Choose a build available on this runner."
            : "Immutable registration · read-only source revision"
        }
      >
        {builds.map((item) => (
          <MenuItem key={item.id} value={item.id}>
            {item.label} · {item.sourceRevision}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Approved local profile"
        value={profileId}
        disabled={!build || refreshing}
        onChange={(e) => onProfile(e.target.value)}
        error={attempted && !profile}
        helperText={
          !build
            ? "Choose an available build first."
            : attempted && !profile
              ? "Choose an approved local profile."
              : "Available on the selected runner and build"
        }
      >
        {profiles.map((item) => (
          <MenuItem key={item.id} value={item.id}>
            {item.displayName}
          </MenuItem>
        ))}
      </TextField>
      {profile && (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Local execution profile digest
          </Typography>
          <Typography
            variant="code"
            sx={{
              display: "block",
              overflowWrap: "anywhere",
              mt: 2,
            }}
          >
            sha256:{profile.digest}
          </Typography>
        </Box>
      )}
    </>
  );
}

export function SuiteStep({
  suites,
  suiteId,
  suite,
  attempted,
  onSelect,
}: {
  suites: RunSuiteOption[];
  suiteId: string;
  suite: RunSuiteOption | undefined;
  attempted: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <Typography variant="body2" color="text.secondary">
        Eligibility is based on the selected runner, build and profile. Only
        published revisions can be selected.
      </Typography>
      {suites.length === 0 ? (
        <Alert severity="warning">
          No published suites are available for these inputs. Review the build
          and profile.
        </Alert>
      ) : (
        <FormControl error={attempted && !suite?.eligible}>
          <FormLabel id="suite-label">Published test suite</FormLabel>
          <RadioGroup
            aria-labelledby="suite-label"
            value={suiteId}
            onChange={(e) => onSelect(e.target.value)}
          >
            {suites.map((item) => (
              <FormControlLabel
                key={item.id}
                value={item.id}
                disabled={!item.eligible}
                control={<Radio />}
                label={
                  <Box sx={{ py: 3 }}>
                    <Typography variant="body2">
                      {item.title} · revision {item.revision}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.eligible
                        ? `Eligible · ${item.scenarioCount} scenario · required fake capability verified`
                        : "Unavailable"}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </RadioGroup>
          {attempted && !suite?.eligible && (
            <Typography role="alert" color="error" variant="body2">
              Select an eligible published suite.
            </Typography>
          )}
        </FormControl>
      )}
      {suites
        .filter((item) => !item.eligible)
        .map((item) => (
          <Alert key={item.id} severity="warning">
            {item.title} is unavailable:{" "}
            {item.reason ?? "Required compatibility evidence is unavailable."}
          </Alert>
        ))}
    </>
  );
}

export function RepetitionsStep({
  minimum,
  maximum,
  repetitions,
  suite,
  attempted,
  validRepetitions,
  onChange,
}: {
  minimum: number;
  maximum: number;
  repetitions: string;
  suite: RunSuiteOption | undefined;
  attempted: boolean;
  validRepetitions: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <Typography variant="body2" color="text.secondary">
        Repeat each scenario with the same frozen inputs. Allowed repetitions:{" "}
        {minimum}–{maximum}.
      </Typography>
      <TextField
        label="Repetitions per scenario"
        size="small"
        value={repetitions}
        onChange={(e) => onChange(e.target.value)}
        error={attempted && !validRepetitions}
        helperText={
          attempted && !validRepetitions
            ? `Enter a whole number from ${minimum} to ${maximum}.`
            : `Whole number · minimum ${minimum}, maximum ${maximum}`
        }
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
      />
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Typography variant="body2">Requested trial matrix</Typography>
        <Typography variant="h2" sx={{ mt: 2 }}>
          {suite?.scenarioCount ?? "—"} scenario ×{" "}
          {validRepetitions ? repetitions : "—"} repetitions
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 2 }}>
          {validRepetitions && suite
            ? `${suite.scenarioCount * Number(repetitions)} total trials · ${suite.title}, revision ${suite.revision}`
            : "Enter valid repetitions to calculate trials."}
        </Typography>
      </Paper>
    </>
  );
}
