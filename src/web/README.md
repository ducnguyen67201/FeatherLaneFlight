# Web workspace

The approved P02 theme/shell, P03 mock Runs workflow and P04 detail/evidence view use React, strict TypeScript, MUI Core/Material Icons, local Hanken Grotesk and TanStack Query. `design/theme.ts` imports the canonical root tokens and supplies one ThemeProvider/CssBaseline and MUI CSS variables. The exhaustive contract-driven status map keeps execution separate from evaluation.

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

`features/runs/RunsPage.tsx` composes AppShell/PageLayout, server-filtered MUI Table, cursor controls and explicit loading/empty/error states. Demo controls select read/submission scenarios, including malformed responses. Open uses an ordinary `/runs/:runId` link with local navigation for unmodified clicks. `RunsWorkspace` handles detail/back/history navigation without a routing dependency; returning to the list restores focus to the opened row when present, with the New Run action as fallback.

`NewRunPanel.tsx` composes `RunSetupSteps.tsx` and `RunReviewStep.tsx`, with form state, dependent resets and submission/recovery in `useNewRunWorkflow.ts`. Step components receive explicit canonical data and callbacks. The panel implements the approved right-side inset modal: runner → available build/profile → eligible published suite → repetitions → review. Geometry comes from canonical tokens and is scoped to this panel. Header/footer remain reachable during internal scrolling. MUI contains/restores focus; when successful submission removes the empty-state opener, the persistent New simulation run button receives focus. Closing/editing is blocked during preflight and pending acknowledgment. Rejection keeps the draft and shows feedback in the footer. An uncertain acknowledgment is labeled unconfirmed; retry replays the frozen original body/key without reading fresh eligibility. Editing is locked until a definitive outcome; close/reopen preserves the original review and recovery even when current options are empty or failing. The mock’s exact validated BUILD_UNAVAILABLE/CAPABILITY_UNSUPPORTED admission responses clear uncertainty because they follow receipt lookup; other errors, including auth/version and idempotency conflicts, keep recovery available. Recovery is in memory within the mounted Runs page; navigating away or reloading discards it.

`queries.ts` composes generated operation keys/validated SDK options with the demo epoch, organization/project and response-changing parameters. Runtime validation completes before Query resolves. Reads and mutations do not automatically retry; there is no persisted cache or offline mutation queue. New submissions refetch eligibility and retain their idempotency key when retrying an unchanged payload after a known rejection. Changed inputs receive a new key. Unconfirmed recovery uses its original request independently of current eligibility. The MSW handler also rechecks admission; components cannot manufacture execution or outcomes.

The context is an explicitly fixed demo organization/project, not sign-in or authorization. Real sessions, identity-change cache cleanup, API integration and live updates remain their assigned later phases. See [mock transport notes](mocks/README.md).

## Organization and projects UI

Open `/settings` for the approved P07 organization/project UI. Organization selection is inside Settings; the project selector is above the left navigation and inside the mobile drawer. The page supports project selection and a creation dialog with generated name validation, pending protection, recoverable errors and focus restoration. Roles, detailed permissions and membership editing are deferred.

The clearly labeled `ProjectsDemo` adapter supplies local samples, loading/empty/error/access-loss states and accepted/rejected creation. It makes no API calls and changes reset on reload. Display data is parsed through canonical generated OrganizationView/ProjectView validators. The reusable feature components and creation hook are under `features/projects/`; sample behavior is confined to `mocks/ProjectsDemo.tsx` and `mocks/projects.json`. `/settings` does not start the Runs mock worker. The existing `/runs` demo remains independently scoped.

`AuthenticatedProjects` supplies the same workspace from the real P05/P06A-backed discovery and creation operations. P06.5 owns its final application mount and provides `userId`, `csrfToken`, `userMenu`, `client`, `cacheScope`, and `onAccessFailure`. Mount it inside the identity-owned QueryClientProvider, keyed by the auth epoch, using that epoch's validated client and query prefix. P07 does not create another auth controller or client. The current `/settings` entry remains the labeled sample until that composition lands.

The feature uses bounded cursor pages, validates every result before caching, scopes queries by identity/organization/project, and hides/cancels/removes its protected state on 401/403/404. A 401 delegates identity retirement to P06.5. A 403/404 refreshes actual organization discovery and requires an explicit access refresh before showing protected content again; failed recovery is an error, not a false empty membership. Discovery/selected project rechecks every 30 seconds. There are no project streams yet. Creation preserves the operation key and submitted name when an acknowledgment is
uncertain (network, malformed response, server failure or idempotency conflict).
The approved “Creation unconfirmed” state makes the name read-only and retries the
same operation. Closing/reopening or switching organizations retains unresolved
requests per organization while the feature remains mounted. A rejection of a retry
cannot disprove an earlier committed creation, so it does not unlock that request.
A first definitive canonical4xx rejection remains editable. Confirmed success clears
the saved operation; identity retirement/unmount or a page reload discards in-memory
recovery. No persistent cache is added. The server grants only the creator access.

Both organization_memberships and project_memberships are required for project visibility. UI sample data is not an authorization boundary. See `docs/phases/handoffs/P07.md` for actual manual/tooling checks and remaining integration limits.

## Foundation reference and verification

`app/FoundationReference.tsx` remains the approved P02 component/reference view on the other shell locations. It does not implement Compare, Suites, Runners or Settings. Ordinary shell links and Vite SPA fallback still support navigation/reload. The shared shell’s original reference footer remains as shown in the approved preview.

Run existing `pnpm format:check`, `pnpm lint`, `pnpm contracts:check`, `pnpm typecheck` and `pnpm build`. Actual manual checks, approval source and limitations are recorded in `docs/phases/handoffs/P03.md`. New automated application tests remain user-owned. Current build advisories concern MUI module directives and the mock/demo bundle size.

## Run detail and evidence

`RunDetailPage` composes focused status, trial/check, manifest, event-log and artifact components. `useRunDetail` owns canonical SDK/Query reads and explicit demo-snapshot controls; `useRunCancellation` owns the pending guard, stable replay key, validated acknowledgment and list/detail invalidation. Reads complete generated validation before caching. Detail queries use the demo epoch/org/project/run identity and request parameters; they have no polling, SSE or automatic retry. Failed refreshes preserve and label the last valid snapshot. Selecting a different synthetic scenario resets its resources so cached events/artifacts cannot silently come from a previous scenario.

The terminal-style Timeline displays the bounded JSON event page (up to 100 records, with a notice if more exist), filtered to attempt context and the selected trial. All current fixtures fit on one page. Metric/flag observations and frozen check kinds are discriminated canonical types. The UI displays pre-recorded results; no browser scoring occurs. Metadata has no storage path or pre-authorized URL and exposes no binary download. Expired evidence retains its historical evaluation and restricts inspection to descriptive use.

New queued samples preserve the actual admitted build/profile/suite/repetition snapshot. There is no observed manifest before startup. Queued cancellation returns an explicit immediate mock-server Canceled / Not evaluated receipt without an execution attempt; active cancellation records idempotent intent; a delayed response shows pending, a malformed/network acknowledgment stays uncertain, and retry reuses the same key. Acknowledged changes invalidate lists/details/events/artifacts rather than inventing Running, Canceled or PASS. A terminal run keeps its original evaluation. In-memory replay recovery lasts while that detail page is mounted; leaving the page discards its local replay key. Ordinary in-app navigation keeps mock rows/receipts, while a full reload resets the demo and newly created rows. No real cancellation or durable idempotency guarantee is provided.

P04's isolated worktree server can be started after generation with `pnpm --dir src/web prepare:mocks` and `pnpm --dir src/web exec vite --host 127.0.0.1 --port 4244 --strictPort`. The default 4200 script remains available for the integrated project. The master reconciles shared entry/contract metadata patches with other phase lanes; P04 does not add auth, database or backend run services. See `docs/phases/handoffs/P04.md` for actual verification and approval provenance.
