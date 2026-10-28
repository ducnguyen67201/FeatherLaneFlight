# P04 run-detail preview

Status: APPROVED. The human approved implementation in phase chat `01a18487-fb2d-7f40-a792-b00973164ce1`, turn `01a1849b-82c2-7a50-a531-cce0417b0ec1`, message `01a1849b-82ee-7830-b3b5-658e23de7bfa`: “yea looks good, go ahead and implement phase 4”. The approved revisions preserve the P03 Runs entry and use a terminal-style Timeline.

This archived source proposal reuses the shared MUI theme, AppShell, PageLayout and canonical status presentation. The implemented mock application is under `src/web/features/runs/`; the worktree app server uses <http://127.0.0.1:4244/runs>. This preview is design history, not a second application route. Application contracts, SDK validation and HTTP fixtures are owned by the canonical package and web mock modules.

Run from the assigned P04 worktree:

```sh
pnpm install --frozen-lockfile
uv sync --all-packages --frozen
pnpm contracts:generate
pnpm --dir src/web exec msw init ../../previews/P04/public --no-save
# Only if the ignored preview dependency link is absent:
ln -s ../../src/web/node_modules previews/P04/node_modules
pnpm --dir src/web exec vite ../../previews/P04 --host 127.0.0.1 --port 4204 --strictPort
```

The dependency link resolves only to this worktree's own web environment. Do not link another checkout's dependencies.

Open <http://127.0.0.1:4204/runs> and use Open on a sample run. The entry screen preserves P03's approved layout, five-row table, filters, cursor controls and New Run modal. `RunsEntryPreview.tsx` is an isolated copy of the existing RunsPage composition with preview-only Open wiring and helper copy; imported query/form/modal policy is reused unchanged. On implementation, wire the actual Runs page rather than maintaining a second application list. The detail header uses the same project selector and user avatar. The preview covers trial/check selection, separate frozen requested/observed manifests, a terminal-style read-only event log, evidence availability/metadata, stale snapshots, loading/empty/request errors and cancellation intent. On narrow screens the check list and selected evidence stack. Tables scroll inside their content region.

Timeline uses monospaced timestamp/elapsed/sequence/event lines with indented messages instead of a table. Lines wrap on narrow screens, and longer output scrolls inside the log. It is a static log display with no command input.

The labeled Preview state selector chooses bounded synthetic presentation samples. Detail samples do not model an HTTP API or provide authoritative results. The entry screen reuses P03's existing validated SDK/Query/MSW list/options/admission behavior on this isolated origin, with an ignored generated local worker; no live backend is connected. Existing RunListEntry/status types are reused; the presentation rows are explicitly not detail wire DTOs. Canonical detail contracts and validated application fixtures are now implemented in the application after UI approval.

For cancellation: Running accepts mock intent without changing execution; Cancellation pending exposes manual accepted/rejected response controls; Cancellation rejected shows request failure. Cancellation unconfirmed and Canceled are separate explicitly selected snapshots. There are no lifecycle timers, live streams, real process controls or connected evidence downloads. Detail Refresh/Retry select fixed presentation samples. List/New Run requests are intercepted by the existing P03 local mock. Comparison, rerun and baseline behavior are deferred.

Temporary approval captures are ignored under `artifacts/`, alongside the ignored preview build. They must be deleted after evaluation/approval; approval sources and verification results remain text in the phase handoff. The six superseded approval captures were deleted after evaluation/approval; the approval source above is retained as text. Any later implementation captures remain ignored only while master review is pending. No captures, build outputs, generated contracts, node_modules or virtual environment are submission candidates.

```sh
pnpm exec prettier --check previews/P04/*.tsx previews/P04/*.ts previews/P04/*.json previews/P04/*.html previews/P04/README.md
pnpm exec tsc --project previews/P04/tsconfig.json --noEmit
pnpm --dir src/web exec vite build ../../previews/P04 --outDir artifacts/build
```
