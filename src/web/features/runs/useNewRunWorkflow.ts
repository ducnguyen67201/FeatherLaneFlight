import { useEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createRunMutation,
  type CreateRunRequest,
  type RunRunnerOption,
  type RunBuildOption,
  type RunLocalProfileOption,
  type RunSuiteOption,
} from "@featherlane/contracts";
import { zCreateRunRequest } from "@featherlane/contracts/validators";
import {
  demoScope,
  errorMessage,
  headers,
  optionsPrefix,
  runsPrefix,
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
}: {
  open: boolean;
  session: number;
  revision: number;
  onClose: () => void;
  onCreated: (id: string) => void;
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
  const mutation = useMutation(createRunMutation());
  const selection = {
    ...(draft.runnerId ? { runnerId: draft.runnerId } : {}),
    ...(draft.buildId ? { buildId: draft.buildId } : {}),
    ...(draft.profileId ? { localProfileId: draft.profileId } : {}),
  };
  const options = useQuery({
    ...selectionOptions(selection, revision),
    enabled: open && !unconfirmed,
  });
  const data = options.data?.data;
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
    selected.runner.capacityState === "AVAILABLE";
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
      await queryClient.fetchQuery(selectionOptions(selection, revision))
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
      runner.capacityState !== "AVAILABLE" ||
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
    let acknowledgedId: string | undefined;
    try {
      // Recovery replays the original operation. Fresh eligibility describes a new
      // request and must never prevent retrieving an already committed receipt.
      const attempt = attemptRef.current?.unconfirmed
        ? attemptRef.current
        : await prepareAttempt();
      attemptRef.current = attempt;
      sent = true;
      const result = await mutation.mutateAsync({
        body: attempt.body,
        path: { projectId: demoScope.projectId },
        headers: { ...headers, "idempotency-key": attempt.key },
      });
      acknowledgedId = result.data.id;
      attemptRef.current = null;
      setUnconfirmed(false);
      setFailure("");
    } catch (error) {
      // These demo admission errors follow receipt lookup and establish that no
      // run was queued. Other failures do not resolve an unknown prior outcome.
      const noAdmission =
        error instanceof ApiError &&
        ((error.status === 409 && error.detail.code === "BUILD_UNAVAILABLE") ||
          (error.status === 422 &&
            error.detail.code === "CAPABILITY_UNSUPPORTED"));
      const uncertain = (recovering || sent) && !noAdmission;
      if (attemptRef.current) attemptRef.current.unconfirmed = uncertain;
      setUnconfirmed(uncertain);
      setFailure(errorMessage(error));
    } finally {
      busyRef.current = false;
      setPending(false);
    }
    if (acknowledgedId) {
      // Cache refresh failures cannot undo a definitive creation acknowledgment.
      void queryClient.invalidateQueries({ queryKey: runsPrefix });
      void queryClient.invalidateQueries({ queryKey: optionsPrefix });
      onCreated(acknowledgedId);
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
      data,
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
