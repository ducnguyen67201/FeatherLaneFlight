# Web foundation

The approved P02 foundation is implemented with React, strict TypeScript, Vite, MUI Core/Material Icons, Emotion, and local Hanken Grotesk fonts. There is one root ThemeProvider and CssBaseline. `design/theme.ts` imports the root `design-tokens.json`, maps the central defaults, and enables MUI CSS variables. `design/statusPresentation.ts` exhaustively maps the generated contract states; `components/StatusBadge.tsx` consumes semantic CSS variables, labels, and icons.

`layouts/AppShell.tsx` supplies the product navigation, active-link state, responsive drawer, context header, and main region. Context controls are supplied as ordinary React children; the layout performs no fetching or identity decisions. `layouts/PageLayout.tsx` supplies breadcrumb/title/description/actions and optional filter alignment. Use MUI controls directly inside these layouts.

## Run locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:workspace
pnpm dev
```

Open <http://127.0.0.1:4200/>. The development server binds only to loopback. For a local build, run `pnpm build`, then `pnpm --filter @featherlane/web preview` after stopping the development server. The web output is `src/web/dist/`; generated outputs and dependency folders remain ignored. Root typecheck/build generate contracts before consuming them. The narrower web scripts assume workspace setup has already generated contracts.

## Reference scope

`app/FoundationReference.tsx` is the approved reference view for the shared theme and layouts. It exposes direct MUI controls, an illustrative table, seven status groups, and loading/empty/error/disabled/no-project samples. User-menu controls include 200% text preview. State selection and recovery actions change local reference state explicitly. No backend request, query, runner control, or authoritative outcome timer is connected.

Navigation uses ordinary links to `/runs`, `/compare`, `/suites`, `/runners`, and `/settings`. The foundation reference currently renders in each shell location; it is not an implementation of those workflows. Native navigation updates the selected item/breadcrumb and supports reload/back/deep links through Vite's SPA fallback. Later phases supply the actual feature content and live context. A hosted static server will need an equivalent SPA fallback; deployment is outside P02.

## Review

The original approved desktop/narrow/state preview source is in `previews/P02/`. Temporary review images were deleted after evaluation at the user's request. The human approval source, verification outcomes, and limitations are recorded as text in `docs/phases/handoffs/P02.md`.

Run existing checks with `pnpm format:check`, `pnpm lint`, `pnpm contracts:check`, `pnpm typecheck`, and `pnpm build`. No new automated tests were written; application test ownership remains with the user. The browser build currently reports MUI module-directive and chunk-size advisories, documented in the phase handoff.
