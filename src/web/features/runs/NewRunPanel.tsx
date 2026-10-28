import { useEffect, useRef } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Drawer,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import Close from "@mui/icons-material/Close";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import { tokens } from "../../design/theme";
import { useNewRunWorkflow } from "./useNewRunWorkflow";
import {
  RunnerStep,
  BuildProfileStep,
  SuiteStep,
  RepetitionsStep,
} from "./RunSetupSteps";
import { ReviewStep } from "./RunReviewStep";

const steps = [
  "Runner",
  "Build & profile",
  "Test suite",
  "Repetitions",
  "Review",
];
export function NewRunPanel({
  open,
  session,
  revision,
  onClose,
  onExited,
  onCreated,
  onRetryOptions,
}: {
  open: boolean;
  session: number;
  revision: number;
  onClose: () => void;
  onExited: () => void;
  onCreated: (id: string) => void;
  onRetryOptions: () => void;
}) {
  const {
    step,
    draft,
    selected,
    choices,
    attempted,
    availableRunner,
    validRepetitions,
    submission,
    actions,
  } = useNewRunWorkflow({
    open,
    session,
    revision,
    onClose,
    onCreated,
    onRetryOptions,
  });
  const { pending, failure, unconfirmed } = submission;
  const data = choices.data;
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) {
      contentRef.current?.scrollTo({ top: 0 });
      headingRef.current?.focus();
    }
  }, [open, step]);
  const geometry = tokens.layoutPx.runPanel;
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={actions.close}
      slotProps={{
        transition: { onExited },
        paper: {
          role: "dialog",
          "aria-modal": true,
          "aria-labelledby": "new-run-title",
          sx: {
            top: `${(100 - geometry.heightDvh) / 2}dvh`,
            height: `${geometry.heightDvh}dvh`,
            right: {
              xs: geometry.sideInset.narrow,
              sm: geometry.sideInset.desktop,
            },
            width: {
              xs: `calc(100vw - ${geometry.sideInset.narrow * 2}px)`,
              sm: tokens.layoutPx.formMaxWidth,
            },
            maxWidth: `calc(100vw - ${geometry.sideInset.narrow * 2}px)`,
            border: 1,
            borderColor: "divider",
            borderRadius: `${tokens.radiusPx.default}px`,
            bgcolor: "background.paper",
            boxShadow: tokens.shadow.overlay,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        },
      }}
    >
      <Stack
        direction="row"
        spacing={3}
        sx={{
          p: { xs: 4, sm: 6 },
          borderBottom: 1,
          borderColor: "divider",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="primary">
            MOCK SUBMISSION
          </Typography>
          <Typography id="new-run-title" component="h2" variant="h2">
            New simulation run
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Select compatible inputs, then review.
          </Typography>
        </Box>
        <IconButton
          aria-label="Close new simulation run"
          onClick={actions.close}
          disabled={pending}
        >
          <Close />
        </IconButton>
      </Stack>
      <Box
        ref={contentRef}
        sx={{ p: { xs: 4, sm: 6 }, overflowY: "auto", minHeight: 0, flex: 1 }}
      >
        <Stack spacing={6}>
          <Alert severity="info">
            Demo workspace · Fake integration only. No PX4 process or live job
            will start.
          </Alert>
          <Stepper
            activeStep={step}
            alternativeLabel
            sx={{ display: { xs: "none", sm: "flex" } }}
          >
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          <Typography variant="body2" color="text.secondary">
            Step {step + 1} of 5 · {steps[step]}
          </Typography>
          <Paper variant="outlined" sx={{ p: { xs: 4, md: 6 }, minWidth: 0 }}>
            <Stack spacing={5}>
              <Typography
                ref={headingRef}
                tabIndex={-1}
                component="h3"
                variant="h2"
              >
                {
                  [
                    "Choose a runner",
                    "Choose available inputs",
                    "Choose an eligible suite",
                    "Set repetitions",
                    "Review simulation run",
                  ][step]
                }
              </Typography>
              {choices.loading && !unconfirmed ? (
                <Box role="status">
                  <Typography variant="body2">Loading run options…</Typography>
                  <Skeleton animation={false} height={80} />
                </Box>
              ) : choices.failure && !unconfirmed ? (
                <Alert
                  severity="error"
                  action={
                    <Button color="inherit" onClick={actions.retryOptions}>
                      Retry
                    </Button>
                  }
                >
                  <AlertTitle>Couldn’t load run options</AlertTitle>
                  {choices.failure}
                </Alert>
              ) : (
                <>
                  {step === 0 && (
                    <RunnerStep
                      runners={data?.runners ?? []}
                      runnerId={draft.runnerId}
                      attempted={attempted}
                      availableRunner={availableRunner}
                      onSelect={actions.selectRunner}
                    />
                  )}
                  {step === 1 && (
                    <BuildProfileStep
                      builds={data?.builds ?? []}
                      profiles={data?.localProfiles ?? []}
                      buildId={draft.buildId}
                      profileId={draft.profileId}
                      build={selected.build}
                      profile={selected.profile}
                      attempted={attempted}
                      refreshing={choices.refreshing}
                      onBuild={actions.selectBuild}
                      onProfile={actions.selectProfile}
                    />
                  )}
                  {step === 2 && (
                    <SuiteStep
                      suites={data?.suites ?? []}
                      suiteId={draft.suiteId}
                      suite={selected.suite}
                      attempted={attempted}
                      onSelect={actions.selectSuite}
                    />
                  )}
                  {step === 3 && data && (
                    <RepetitionsStep
                      minimum={data.minimumRepetitions}
                      maximum={data.maximumRepetitions}
                      repetitions={draft.repetitions}
                      suite={selected.suite}
                      attempted={attempted}
                      validRepetitions={validRepetitions}
                      onChange={actions.setRepetitions}
                    />
                  )}
                  {step === 4 && (
                    <ReviewStep
                      runner={selected.runner}
                      build={selected.build}
                      profile={selected.profile}
                      suite={selected.suite}
                      repetitions={draft.repetitions}
                      locked={pending || unconfirmed}
                      onEdit={actions.edit}
                    />
                  )}
                </>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Box>
      <Box
        sx={{
          p: { xs: 4, sm: 6 },
          borderTop: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        {failure && (
          <Alert severity="error" sx={{ mb: 4 }}>
            <AlertTitle>
              {unconfirmed
                ? "Mock submission not confirmed"
                : "Mock submission rejected"}
            </AlertTitle>
            {failure}
            {unconfirmed &&
              " Retry replays the original inputs and request key. Resolve this submission before editing or starting another draft."}
          </Alert>
        )}
        {pending && (
          <Typography
            role="status"
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 3 }}
          >
            Waiting for mock acknowledgment. Closing is available afterward.
          </Typography>
        )}
        <Stack
          direction="row"
          spacing={3}
          sx={{ justifyContent: "space-between" }}
        >
          <Button
            color="secondary"
            startIcon={<ArrowBack />}
            disabled={pending || unconfirmed}
            onClick={() =>
              step === 0 ? actions.close() : actions.edit(step - 1)
            }
          >
            {step === 0 ? "Back to runs" : "Back"}
          </Button>
          {step < 4 ? (
            <Button
              variant="contained"
              endIcon={<ArrowForward />}
              onClick={actions.next}
              disabled={
                pending ||
                choices.loading ||
                choices.refreshing ||
                Boolean(choices.failure) ||
                data?.runners.length === 0
              }
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={() => void actions.submit()}
              disabled={
                pending ||
                (!unconfirmed &&
                  (Boolean(choices.failure) ||
                    choices.refreshing ||
                    choices.loading))
              }
            >
              {pending
                ? "Submitting…"
                : failure
                  ? "Retry mock submission"
                  : "Submit mock run"}
            </Button>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
