# P07 approved organization/projects UI

Status: UI implemented for review. Backend integration WAITING_DEPENDENCY (P05 + P06A).

The human approved the revised rendered layout and two membership tables with no roles in destination chat `01a18488-97df-7171-8c7d-17e7ff0eeed3`, turn `01a184a0-57f0-7a40-a0da-047ab7537134`, message `01a184a0-585f-7c41-a14e-8e3c86b10580`. They then explicitly requested UI-first completion and backend wiring after P05/P06A, turn `01a184a5-4862-7983-8bf9-580c4a6b47af`, message `01a184a5-4892-71c3-a07b-4b040e90b3bc`. Neither approves publication.

The application Settings UI is available at <http://127.0.0.1:4247/settings>. This preview at <http://127.0.0.1:4207/settings> now mounts the same application components and UI-only sample adapter; it is not a duplicate implementation.

Run from the assigned worktree after frozen install and `pnpm setup:workspace`:

```sh
# Application, with UI-only Settings samples:
pnpm --dir src/web exec vite --host 127.0.0.1 --port 4247 --strictPort

# Optional standalone review entry, using this worktree's web dependencies:
# Only create the link if absent.
ln -s ../../src/web/node_modules previews/P07/node_modules
pnpm --dir src/web exec vite ../../previews/P07 --host 127.0.0.1 --port 4207 --strictPort
```

Organization selection is inside Settings. Project selection sits above the sidebar navigation and inside the narrow navigation drawer. The project list/create dialog use canonical generated ProjectView/OrganizationView types and validators. Role/permission and retention editors are absent. The separate sample adapter exposes explicit demo states and local creation feedback; components make no API calls, and sample changes reset on reload.

Actual manual checks and remaining backend boundaries are recorded in `docs/phases/handoffs/P07.md`. Review captures were evaluated and cleaned after approval. No review images are tracked. Preserve the user-supplied screenshot and product assets.
