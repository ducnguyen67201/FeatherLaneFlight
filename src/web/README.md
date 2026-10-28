# Web workspace

The approved P02 theme/shell and P03 mock Runs workflow use React, strict TypeScript, MUI Core/Material Icons, local Hanken Grotesk and TanStack Query. `design/theme.ts` imports the canonical root tokens and supplies one ThemeProvider/CssBaseline and MUI CSS variables. The exhaustive contract-driven status map keeps execution separate from evaluation.

## Run locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:workspace
pnpm dev
```

Open <http://127.0.0.1:4200/runs>. Dev binds only to loopback. The current entry starts the local MSW demo before rendering; failed mock startup produces an error instead of falling through to a live API. New submissions create in-memory queued samples only. Reload resets the demo. After regenerating contracts while the dev server/browser are open, reload the page before further evaluation.

`pnpm build` regenerates contracts and the ignored browser MSW asset and emits `src/web/dist/`. Stop the dev server before `pnpm --filter @featherlane/web preview` on the same port. The narrower web typecheck assumes generated contracts exist; root typecheck/build generate them explicitly. This is a local mock artifact, not a deployment candidate.

## Runs workflow

`features/runs/RunsPage.tsx` composes AppShell/PageLayout, server-filtered MUI Table, cursor controls and explicit loading/empty/error states. Demo controls select read/submission scenarios, including malformed responses. The list’s disabled Open action has a nearby explanation; run detail/evidence and cancellation UI remain P04 scope.

`NewRunPanel.tsx` composes `RunSetupSteps.tsx` and `RunReviewStep.tsx`, with form state, dependent resets and submission/recovery in `useNewRunWorkflow.ts`. Step components receive explicit canonical data and callbacks. The panel implements the approved right-side inset modal: runner → available build/profile → eligible published suite → repetitions → review. Geometry comes from canonical tokens and is scoped to this panel. Header/footer remain reachable during internal scrolling. MUI contains/restores focus; when successful submission removes the empty-state opener, the persistent New simulation run button receives focus. Closing/editing is blocked during preflight and pending acknowledgment. Rejection keeps the draft and shows feedback in the footer. An uncertain acknowledgment is labeled unconfirmed; retry replays the frozen original body/key without reading fresh eligibility. Editing is locked until a definitive outcome; close/reopen preserves the original review and recovery even when current options are empty or failing. The mock’s exact validated BUILD_UNAVAILABLE/CAPABILITY_UNSUPPORTED admission responses clear uncertainty because they follow receipt lookup; other errors, including auth/version and idempotency conflicts, keep recovery available. Recovery is in memory within the mounted Runs page; navigating away or reloading discards it.

`queries.ts` composes generated operation keys/validated SDK options with the demo epoch, organization/project and response-changing parameters. Runtime validation completes before Query resolves. Reads and mutations do not automatically retry; there is no persisted cache or offline mutation queue. New submissions refetch eligibility and retain their idempotency key when retrying an unchanged payload after a known rejection. Changed inputs receive a new key. Unconfirmed recovery uses its original request independently of current eligibility. The MSW handler also rechecks admission; components cannot manufacture execution or outcomes.

The context is an explicitly fixed demo organization/project, not sign-in or authorization. Real sessions, identity-change cache cleanup, API integration and live updates remain their assigned later phases. See [mock transport notes](mocks/README.md).

## Foundation reference and verification

`app/FoundationReference.tsx` remains the approved P02 component/reference view on the other shell locations. It does not implement Compare, Suites, Runners or Settings. Ordinary shell links and Vite SPA fallback still support navigation/reload. The shared shell’s original reference footer remains as shown in the approved preview.

Run existing `pnpm format:check`, `pnpm lint`, `pnpm contracts:check`, `pnpm typecheck` and `pnpm build`. Actual manual checks, approval source and limitations are recorded in `docs/phases/handoffs/P03.md`. New automated application tests remain user-owned. Current build advisories concern MUI module directives and the mock/demo bundle size.
