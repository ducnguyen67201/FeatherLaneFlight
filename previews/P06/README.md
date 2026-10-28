# P06 sign-in and access preview

Isolated host for the implemented P06 components in `src/web/features/auth/`. Reuses the existing MUI theme, local fonts and canonical design tokens. No API, Google connection, session cookie, access grant or application routing is created.

Run from this phase worktree:

```sh
ln -s ../../src/web/node_modules previews/P06/node_modules
pnpm --filter @featherlane/web exec vite ../../previews/P06 --config ../../previews/P06/vite.config.mts --host 127.0.0.1 --port 4206 --strictPort
```

Create the ignored dependency link once after installing this worktree's dependencies. It points inside this worktree, never to the primary checkout. The preview Vite config pins a single React runtime from that installation.

Use the preview state controls to review sign-in, session checking, redirect pending, access required, session expiry, provider failure, session-fetch failure and logout failure. The Google button changes presentation only. Retry/access/sign-out actions demonstrate the proposed states; no timers manufacture authentication or organization access.

The human approved the shown UI in this phase chat and requested P06 UI implementation now, with separate P06A authentication backend and P06.5 wiring only after verified P05/P06 merges, actual auth endpoints and master dispatch. Review captures stay in ignored `artifacts/` only while needed and are deleted after evaluation/approval. Real Google verification remains pending provider configuration. See the phase handoff for exact approval sources and actual checks.
