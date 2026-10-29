import { useState } from "react";
import { Alert, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { http, HttpResponse, delay } from "msw";
import { setupWorker } from "msw/browser";
import {
  createValidatedClient,
  operationPolicies,
  type EnrollmentGrant,
  type RunnerSummary,
} from "@featherlane/contracts";
import {
  zCreateRunnerEnrollmentBody,
  zRunnerSummary,
} from "@featherlane/contracts/validators";
import { AppShell } from "../layouts/AppShell";
import { RunnersPage } from "../features/runners/RunnersPage";
import { useRunnerHealth } from "../features/runners/useRunnerHealth";

type Condition = "ready" | "empty" | "loading" | "error" | "interrupted";
let condition: Condition = "ready";
let interrupted = false;
const receipts = new Map<string, EnrollmentGrant>();
const sample: RunnerSummary = zRunnerSummary.parse({
  id: "demo_runner",
  projectId: "demo_project",
  displayName: "SIH workstation",
  connectionState: "CONNECTED",
  capacityState: "DISABLED",
  lastSeenAt: new Date().toISOString(),
  contractVersion: "0.1.0",
  protocolVersion: "1",
  hostPlatform: "Local sample",
  credentialExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  revokedAt: null,
  availableBuilds: [],
  localProfiles: [],
  diagnostics: [{ code: "NOT_CONFIGURED" }],
  capabilitySupport: "DECLARED",
});
const route = (path: string) =>
  window.location.origin + path.replace(/\{([^}]+)\}/g, ":$1");
const failure = () =>
  HttpResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Sample service unavailable.",
        details: [],
        requestId: "demo_request",
      },
    },
    { status: 500 },
  );
export async function startRunnersDemo() {
  const worker = setupWorker(
    http.get(route(operationPolicies.listRunners.path), async () => {
      if (condition === "loading") await delay(30000);
      if (condition === "error") return failure();
      return HttpResponse.json({
        data: condition === "empty" ? [] : [sample],
        meta: { nextCursor: null },
      });
    }),
    http.post(
      route(operationPolicies.createRunnerEnrollment.path),
      async ({ request }) => {
        const body = zCreateRunnerEnrollmentBody.parse(await request.json());
        const key = request.headers.get("idempotency-key") ?? "demo";
        let grant = receipts.get(key);
        if (!grant) {
          grant = {
            id: "demo_grant",
            projectId: "demo_project",
            displayName: body.displayName,
            token: "0".repeat(64),
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          };
          receipts.set(key, grant);
        }
        await delay(400);
        if (condition === "interrupted" && !interrupted) {
          interrupted = true;
          return failure();
        }
        return HttpResponse.json({ data: grant }, { status: 201 });
      },
    ),
    http.post(route(operationPolicies.revokeRunner.path), async () => {
      await delay(400);
      sample.revokedAt = new Date().toISOString();
      sample.capacityState = "DISABLED";
      return HttpResponse.json({ data: sample });
    }),
  );
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
}
const client = createValidatedClient({ baseUrl: window.location.origin });
function DemoContent({ revision }: { revision: number }) {
  const health = useRunnerHealth(
    {
      userId: "demo_user",
      csrfToken: "0".repeat(64),
      client,
      cacheScope: ["demo-runners", revision],
      onAccessFailure: () => undefined,
    },
    "demo_project",
  );
  return (
    <RunnersPage
      projectName="SIH validation"
      runners={health.runners}
      loading={health.loading}
      error={!!health.error}
      blocked={health.blocked}
      revoking={health.revoking}
      page={health.page}
      onRetry={health.retry}
      onRefresh={() => {
        void health.refresh();
      }}
      onCreateGrant={health.createGrant}
      onRevoke={health.revoke}
      onPreviousPage={health.previous}
      onNextPage={health.next}
    />
  );
}
export function RunnersDemo() {
  const [mode, setMode] = useState<Condition>(condition);
  const [revision, setRevision] = useState(0);
  return (
    <AppShell
      activePath="/runners"
      projectSelector={
        <TextField select label="Project" value="demo_project" fullWidth>
          <MenuItem value="demo_project">SIH validation</MenuItem>
        </TextField>
      }
      userMenu={<Typography variant="body2">Local sample</Typography>}
    >
      <Stack spacing={4} sx={{ mb: 6 }}>
        <Alert severity="info">
          Local UI samples. No live identity, credentials, cloud workers or
          simulations. The displayed grant is a public placeholder.
        </Alert>
        <TextField
          select
          size="small"
          label="Sample state"
          value={mode}
          onChange={(event) => {
            const value = event.target.value;
            if (
              value === "ready" ||
              value === "empty" ||
              value === "loading" ||
              value === "error" ||
              value === "interrupted"
            ) {
              condition = value;
              interrupted = false;
              setMode(value);
              setRevision(revision + 1);
            }
          }}
        >
          <MenuItem value="ready">Connected machine</MenuItem>
          <MenuItem value="empty">No machines</MenuItem>
          <MenuItem value="loading">Loading</MenuItem>
          <MenuItem value="error">Service unavailable</MenuItem>
          <MenuItem value="interrupted">
            Enrollment response interrupted
          </MenuItem>
        </TextField>
      </Stack>
      <DemoContent key={revision} revision={revision} />
    </AppShell>
  );
}
