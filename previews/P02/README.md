# P02 dashboard foundation preview

Status: **APPROVED**. The human approved this rendered foundation in the P02 phase chat with "yes apply that for implement". This package remains the isolated approval prototype; the implementation now lives under `src/web/` and is ready for master review. Exact approval evidence is recorded in `docs/phases/handoffs/P02.md`.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:workspace
pnpm --filter @featherlane/p02-preview dev
```

Open [the interactive preview](http://127.0.0.1:4202/). The preview binds only to `127.0.0.1:4202`.

## Approved scope

- Token-driven MUI theme: near-black canvas/panels, fine borders, yellow actions, small radii, Hanken Grotesk, readable compact type, visible keyboard focus, and reduced-motion CSS.
- Dashboard `AppShell`: desktop sidebar with Runs, Compare, Test suites, Runners, and Settings; selected navigation treatment; organization/project selector; user-menu presentation; main content region. Below the token's `md` breakpoint, navigation becomes a temporary drawer.
- Shared `PageLayout`: breadcrumb, compact title/description/actions, optional tabs, and consistently aligned content panels. The reference table demonstrates density and contained horizontal scrolling.
- Direct MUI controls, dialog, enabled/disabled/validation states, loading/empty/error feedback, and the no-project shell state.
- Exhaustive presentation of generated execution, evaluation, trial, check, runner connection/capacity, and suite status types. Execution Completed remains neutral and has a separate evaluation badge.

Navigation changes local selection and hash anchors for shell review. It does not implement the future feature routes. The table's three rows are reference samples. The primary action and dialog report local feedback only. Retry/empty-state actions explicitly restore the sample; no timer manufactures an authoritative result.

## Review interactions

Use the Reference, Status vocabulary, and Page states tabs. On Page states, select Ready, Loading, Empty, or Error. Select No project selected in the header to inspect the project-empty state. The user menu includes a 200% text-size preview. The checkbox toggles the sample metadata, and Density changes reference-table padding. Edit the reference name, switch tabs, and return to check retention. Open the dialog, traverse with Tab/Shift+Tab, and dismiss with Escape.

## Visual review and cleanup

The rendered desktop, narrow drawer/content, status vocabulary, dialog focus, loading/empty/error/disabled/no-project, and 200% text views were evaluated before approval. All 24 temporary approval and implementation comparison images were deleted after review at the user's request. Approval evidence and actual verification results remain recorded as text in `docs/phases/handoffs/P02.md`; the runnable preview source remains available for inspection.

## Validation and limits

Preview strict typecheck/build, relevant Prettier checks, root contract-generating typecheck, and pnpm audit passed. Audit reported zero vulnerabilities. Manual browser inspection covered navigation selection/dismissal, project and user menus, dialog containment/Escape/focus return, visible focus, control interactions, retained input, state selection/recovery, and widths 375, 390, 768, 1024, and 1440px. At 200% root text size, desktop and 375px content retained viewport width; the narrow header gives the project selector its own row. Rendered status pairs have a minimum calculated contrast of 5.74:1.

The Vite preview bundle is about 577 kB before gzip (178 kB gzip). Build succeeds with MUI `use client` directive warnings and a 500 kB chunk advisory; this browser-only prototype has no server-component boundary. Production bundling remains later work. Reduced-motion CSS is present, but the current browser reports no reduced-motion preference, so that mode was not emulated. Accessibility-tree inspection is not a full screen-reader audit. No new automated tests were written.

This approval permits the shown foundation implementation only. Completed-phase publication and merge were separately approved by the human in the master chat. The runnable app is at <http://127.0.0.1:4200/> with `pnpm dev`.
