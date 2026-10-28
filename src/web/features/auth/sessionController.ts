import { QueryClient } from "@tanstack/react-query";
import {
  ApiError,
  browserNavigationPolicies,
  contractManifest,
  createValidatedClient,
  getSessionOptions,
  logoutMutation,
  type SessionView,
} from "@featherlane/contracts";
import type { SignInState } from "./SignInPage";

type Client = ReturnType<typeof createValidatedClient>;
type Runtime = {
  epoch: number;
  current: boolean;
  checking: boolean;
  session: SessionView | null;
  queries: QueryClient;
  client: Client;
};

export type AuthenticatedSession = {
  session: SessionView;
  authEpoch: number;
  queryClient: QueryClient;
  client: Client;
};

export type SessionState =
  | { state: Exclude<SignInState, "access-required" | "sign-out-error"> }
  | ({ state: "authenticated" } & AuthenticatedSession)
  | { state: "signing-out" | "sign-out-error"; session: SessionView };

const headers = {
  "x-flf-contract-version": contractManifest.contractVersion,
};

// Owns authentication effects and cache identity; presentation never grants membership.
export class SessionController {
  private listeners = new Set<() => void>();
  private runtime: Runtime;
  private snapshot: SessionState = { state: "checking-session" };

  constructor(
    private readonly origin: string,
    private readonly navigate: (url: string) => void,
  ) {
    this.runtime = this.createRuntime(0);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private publish(state: SessionState) {
    this.snapshot = state;
    this.listeners.forEach((listener) => listener());
  }

  private createRuntime(epoch: number): Runtime {
    const client = createValidatedClient(
      { baseUrl: this.origin },
      {
        origin: this.origin,
        isCurrent: () => runtime.current,
        csrfToken: () => runtime.session?.csrfToken ?? null,
        onUnauthorized: (error) => {
          if (runtime.current && this.snapshot.state === "authenticated") {
            this.onSessionFailure(error, epoch);
          }
        },
      },
    );
    const runtime: Runtime = {
      epoch,
      current: true,
      checking: false,
      session: null,
      queries: new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
      client,
    };
    return runtime;
  }

  private replaceRuntime() {
    const old = this.runtime;
    old.current = false;
    old.session = null;
    void old.queries.cancelQueries();
    old.queries.clear();
    this.runtime = this.createRuntime(old.epoch + 1);
    return this.runtime;
  }

  onSessionFailure = (error: unknown, epoch: number) => {
    if (error instanceof ApiError && error.status === 401)
      this.expireSession(epoch);
  };

  expireSession = (epoch: number) => {
    if (epoch !== this.runtime.epoch || this.snapshot.state !== "authenticated")
      return;
    this.replaceRuntime();
    this.publish({ state: "session-expired" });
  };

  checkSession = async () => {
    const runtime = this.runtime;
    if (
      runtime.checking ||
      this.snapshot.state === "signing-out" ||
      this.snapshot.state === "sign-out-error"
    )
      return;
    runtime.checking = true;
    if (!runtime.session) this.publish({ state: "checking-session" });
    try {
      const result = await runtime.queries.fetchQuery(
        getSessionOptions({ client: runtime.client, headers }, [runtime.epoch]),
      );
      if (!runtime.current) return;
      const previous = runtime.session;
      const changed =
        previous &&
        (previous.user.id !== result.data.user.id ||
          previous.csrfToken !== result.data.csrfToken);
      const active = changed ? this.replaceRuntime() : runtime;
      active.session = result.data;
      this.publish({
        state: "authenticated",
        session: result.data,
        authEpoch: active.epoch,
        queryClient: active.queries,
        client: active.client,
      });
    } catch (error) {
      if (!runtime.current) return;
      this.replaceRuntime();
      this.publish({
        state:
          error instanceof ApiError && error.status === 401
            ? error.detail.code === "SESSION_EXPIRED"
              ? "session-expired"
              : "sign-in"
            : "connection-error",
      });
    } finally {
      runtime.checking = false;
    }
  };

  signIn = () => {
    if (
      [
        "checking-session",
        "opening-google",
        "authenticated",
        "signing-out",
        "sign-out-error",
      ].includes(this.snapshot.state)
    )
      return;
    this.replaceRuntime();
    this.publish({ state: "opening-google" });
    try {
      this.navigate(
        new URL(browserNavigationPolicies.beginGoogleLogin.path, this.origin)
          .href,
      );
    } catch {
      this.publish({ state: "sign-in-error" });
    }
  };

  signOut = async (epoch = this.runtime.epoch) => {
    if (epoch !== this.runtime.epoch) return;
    if (
      this.snapshot.state !== "authenticated" &&
      this.snapshot.state !== "sign-out-error"
    )
      return;
    const retrying = this.snapshot.state === "sign-out-error";
    let session = this.snapshot.session;
    // Hide children and retire reads before sending logout, including uncertain failures.
    const runtime = this.replaceRuntime();
    runtime.session = session;
    this.publish({ state: "signing-out", session });
    try {
      // An uncertain request or another tab may have rotated the cookie and CSRF.
      // Keep the workspace hidden while retrieving the token for this retry.
      if (retrying) {
        const result = await runtime.queries.fetchQuery(
          getSessionOptions({ client: runtime.client, headers }, [
            runtime.epoch,
          ]),
        );
        if (!runtime.current) return;
        session = result.data;
        runtime.session = session;
      }
      await runtime.queries
        .getMutationCache()
        .build(runtime.queries, logoutMutation())
        .execute({
          client: runtime.client,
          headers: { ...headers, "x-csrf-token": session.csrfToken },
        });
      if (!runtime.current) return;
      this.replaceRuntime();
      this.publish({ state: "sign-in" });
    } catch (error) {
      if (!runtime.current) return;
      if (error instanceof ApiError && error.status === 401) {
        this.replaceRuntime();
        this.publish({ state: "sign-in" });
      } else {
        this.publish({ state: "sign-out-error", session });
      }
    }
  };
}
