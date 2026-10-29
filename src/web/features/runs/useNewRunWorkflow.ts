import { useEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createRunMutation,
  type CreateRunRequest,
  type RunSummary,
  type RunRunnerOption,
  type RunBuildOption,
  type RunLocalProfileOption,
  type RunSuiteOption,
} from "@featherlane/contracts";
import { zCreateRunRequest } from "@featherlane/contracts/validators";
import {
  demoRunTransport,
  type RunTransport,
  errorMessage,
  headers,
  optionsQueryPrefix,
  runsQueryPrefix,
  selectionOptions,
} from "./queries";

const emptyDraft = {
  runnerId: "",
  buildId: "",
  profileId: "",
  suiteId: "",
  repetitions: "3",
};
type Draft = typeof emptyDraft;
type DraftAction = { type: "reset" } | { type: keyof Draft; value: string };
function reduceDraft(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "reset":
      return emptyDraft;
    case "runnerId":
      return {
        ...draft,
        runnerId: action.value,
        buildId: "",
        profileId: "",
        suiteId: "",
      };
    case "buildId":
      return { ...draft, buildId: action.value, profileId: "", suiteId: "" };
    case "profileId":
      return { ...draft, profileId: action.value, suiteId: "" };
    default:
      return { ...draft, [action.type]: action.value };
  }
}
type SelectedInputs = {
  runner: RunRunnerOption | undefined;
  build: RunBuildOption | undefined;
  profile: RunLocalProfileOption | undefined;
  suite: RunSuiteOption | undefined;
};
type SubmissionAttempt = {
  body: Readonly<CreateRunRequest>;
  payload: string;
  key: string;
  selected: SelectedInputs;
  unconfirmed: boolean;
};

export function useNewRunWorkflow({
  open,
  session,
  revision,
  onClose,
  onCreated,
  onRetryOptions,
  transport = demoRunTransport,
}: {
  transport?: RunTransport;
  open: boolean;
  session: number;
  revision: number;
  onClose: () => void;
  onCreated: (run: RunSummary) => void;
  onRetryOptions: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, dispatch] = useReducer(reduceDraft, emptyDraft);
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const busyRef = useRef(false);
  const attemptRef = useRef<SubmissionAttempt | null>(null);
  const sessionRef = useRef(session);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const mutation = useMutation(createRunMutation());
  const selection = {
    ...(draft.runnerId ? { runnerId: draft.runnerId } : {}),
    ...(draft.buildId ? { buildId: draft.buildId } : {}),
    ...(draft.profileId ? { localProfileId: draft.profileId } : {}),
  };
  const options = useQuery({
    ...selectionOptions(selection, revision, transport),
    enabled: open && !unconfirmed,
  });
  useEffect(() => {
    const error = options.error;
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    )
      transport.onAccessFailure(error.status);
  }, [options.error, transport]);
  const data = options.isError ? undefined : options.data?.data;
  const currentSelected: SelectedInputs = {
    runner: data?.runners.find((item) => item.id === draft.runnerId),
    build: data?.builds.find((item) => item.id === draft.buildId),
    profile: data?.localProfiles.find((item) => item.id === draft.profileId),
    suite: data?.suites.find((item) => item.id === draft.suiteId),
  };
  const selected =
    unconfirmed && attemptRef.current
      ? attemptRef.current.selected
      : currentSelected;
  const availableRunner =
    selected.runner?.connectionState === "CONNECTED" &&
    ["AVAILABLE", "BUSY"].includes(selected.runner.capacityState);
  const validRepetitions = Boolean(
    data &&
    /^\d+$/.test(draft.repetitions) &&
    Number(draft.repetitions) >= data.minimumRepetitions &&
    Number(draft.repetitions) <= data.maximumRepetitions,
  );

  useEffect(() => {
    if (!open || sessionRef.current === session) return;
    sessionRef.current = session;
    // Closing/reopening cannot abandon a request whose outcome is still unknown.
    if (attemptRef.current?.unconfirmed) return;
    attemptRef.current = null;
    dispatch({ type: "reset" });
    setStep(0);
    setAttempted(false);
    setFailure("");
    mutation.reset();
  }, [open, session, mutation.reset]);

  function edit(next: number) {
    if (busyRef.current || attemptRef.current?.unconfirmed) return;
    setStep(next);
    setAttempted(false);
    setFailure("");
    mutation.reset();
  }
  function change(type: keyof Draft, value: string) {
    if (busyRef.current || attemptRef.current?.unconfirmed) return;
    dispatch({ type, value });
  }
  function next() {
    setAttempted(true);
    const valid = [
      availableRunner,
      Boolean(selected.build && selected.profile),
      Boolean(selected.suite?.eligible),
      validRepetitions,
    ][step];
    if (valid && !options.isFetching && !options.isError) edit(step + 1);
  }
  async function prepareAttempt(): Promise<SubmissionAttempt> {
    const fresh = (
      await queryClient.fetchQuery(
        selectionOptions(selection, revision, transport),
      )
    ).data;
    const runner = fresh.runners.find((item) => item.id === draft.runnerId);
    const build = fresh.builds.find((item) => item.id === draft.buildId);
    const profile = fresh.localProfiles.find(
      (item) => item.id === draft.profileId,
    );
    const suite = fresh.suites.find(
      (item) => item.id === draft.suiteId && item.eligible,
    );
    if (
      runner?.connectionState !== "CONNECTED" ||
      !["AVAILABLE", "BUSY"].includes(runner.capacityState) ||
      !build ||
      !profile ||
      profile.digest !== selected.profile?.digest ||
      !suite ||
      !/^\d+$/.test(draft.repetitions) ||
      Number(draft.repetitions) < fresh.minimumRepetitions ||
      Number(draft.repetitions) > fresh.maximumRepetitions
    ) {
      throw new Error(
        "Selected inputs are no longer eligible. Review the runner and suite.",
      );
    }
    const body = Object.freeze(
      zCreateRunRequest.parse({
        schemaVersion: 1,
        runnerId: draft.runnerId,
        buildId: draft.buildId,
        suiteRevisionId: draft.suiteId,
        localExecutionProfileDigest: profile.digest,
        repetitions: Number(draft.repetitions),
      }),
    );
    const payload = JSON.stringify(body);
    return {
      body,
      payload,
      key:
        attemptRef.current?.payload === payload
          ? attemptRef.current.key
          : crypto.randomUUID(),
      selected: { runner, build, profile, suite },
      unconfirmed: false,
    };
  }
  async function submit() {
    if (!open || busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    const recovering = Boolean(attemptRef.current?.unconfirmed);
    if (!recovering) setFailure("");
    let sent = false;
    let acknowledged: RunSummary | undefined;
    try {
      // Recovery replays the original operation. Fresh eligibility describes a new
      // request and must never prevent retrieving an already committed receipt.
      const attempt = attemptRef.current?.unconfirmed
        ? attemptRef.current
        : await prepareAttempt();
      attemptRef.current = attempt;
      sent = true;
      const result = await mutation.mutateAsync({
        client: transport.client,
        body: attempt.body,
        path: { projectId: transport.projectId },
        headers: {
          ...headers,
          "x-csrf-token": transport.csrfToken,
          "idempotency-key": attempt.key,
        },
      });
      if (!active.current) return;
      acknowledged = result.data;
      attemptRef.current = null;
      setUnconfirmed(false);
      setFailure("");
    } catch (error) {
      if (!active.current) return;
      // Auth/schema errors cannot resolve an earlier uncertain commit. Only
      // business rejections after receipt lookup prove that no job was admitted.
      const afterReceipt = [
        "QUEUE_LIMIT_REACHED",
        "RUNNER_UNAVAILABLE",
        "BUILD_UNAVAILABLE",
        "PROFILE_MISMATCH",
        "CAPABILITY_UNSUPPORTED",
        "IDEMPOTENCY_CONFLICT",
      ];
      const noAdmission =
        error instanceof ApiError &&
        (recovering
          ? afterReceipt.includes(error.detail.code)
          : [400, 401, 403, 404, 409, 413, 415, 422].includes(error.status));
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403 || error.status === 404)
      ) {
        transport.onAccessFailure(error.status);
      }
      const uncertain = (recovering || sent) && !noAdmission;
      if (attemptRef.current) attemptRef.current.unconfirmed = uncertain;
      setUnconfirmed(uncertain);
      setFailure(errorMessage(error));
    } finally {
      busyRef.current = false;
      setPending(false);
    }
    if (acknowledged) {
      // Cache refresh failures cannot undo a definitive creation acknowledgment.
      void queryClient.invalidateQueries({
        queryKey: runsQueryPrefix(transport),
      });
      void queryClient.invalidateQueries({
        queryKey: optionsQueryPrefix(transport),
      });
      onCreated(acknowledged);
    }
  }
  return {
    step,
    draft,
    selected,
    attempted,
    availableRunner,
    validRepetitions,
    choices: {
      data: options.isError ? undefined : data,
      loading: options.isPending,
      refreshing: options.isFetching,
      failure: options.isError ? errorMessage(options.error) : "",
    },
    submission: { pending, failure, unconfirmed },
    actions: {
      edit,
      next,
      submit,
      close: () => {
        if (!busyRef.current) onClose();
      },
      retryOptions: () => {
        onRetryOptions();
        void options.refetch();
      },
      selectRunner: (value: string) => change("runnerId", value),
      selectBuild: (value: string) => change("buildId", value),
      selectProfile: (value: string) => change("profileId", value),
      selectSuite: (value: string) => change("suiteId", value),
      setRepetitions: (value: string) => change("repetitions", value),
    },
  };
}
