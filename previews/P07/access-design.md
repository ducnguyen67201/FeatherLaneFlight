# P07 membership architecture and integration boundary

Status: approved UI implemented; actual backend wiring WAITING_DEPENDENCY.

## Accepted architecture

The human accepted two membership tables and explicitly deferred roles. The approved organization/projects UI is implemented first; backend work starts after actual reviewed P05 persistence and P06A identity/session source is available. P06 is UI only, and P06.5 owns its later auth UI wiring.

- Existing P06A `users`: one account per person.
- `organizations`: tenant records.
- `projects`: one organization_id per project.
- `organization_memberships(user_id, organization_id)`: explicit belonging, unique pair.
- `project_memberships(user_id, project_id)`: explicit project visibility, unique pair.

Organization membership grants no automatic project access. One shared backend query/helper must require both current memberships for project listing and every protected project resource. Organization membership removal must invalidate and remove project grants so rejoining cannot revive stale assignments. Project creation requires organization membership and explicitly adds its creator as project member; no grants to other organization members. Assignment administration stays operator-managed, with transactional audit writes. No invitation/member-management UI, roles, action-permission matrix, inheritance or exceptions.

## UI implementation and canonical views

`featherlane_contracts.projects` owns OrganizationView{id,name} and ProjectView{id,organizationId,name}. Organization names reuse DisplayName; project names are 1–100 characters with at least one non-whitespace character. The resource-free offline schema exporter registers these two flat display schemas to generate TypeScript types/Zod validators. This adds no business route, database/auth dependency or competing SessionView.

Production-facing UI components receive canonical views and explicit callbacks. The focused creation-form hook validates against the generated name schema and owns draft/pending/error state and scope resets. `src/web/mocks/ProjectsDemo.tsx` is the separate local sample adapter; no API calls, sign-in/session implementation or durable storage. Future backend data belongs in TanStack Query with identity/org/project cache scoping; UI callbacks will connect through the canonical generated client after actual endpoints exist. Do not treat UI sample hiding/selection as verified authorization.

P06A SessionView is identity plus CSRF only. P07 separately owns bounded organization/project discovery; exact route metadata/cursor contracts will be added during backend integration. No role/access projection is embedded in auth transport.

## Runtime checkpoints still required

The master reports P05/P06 UI merged and P06A started. This worktree still starts from merged P03, without P05 runtime or P06A. The master must safely transfer actual reviewed source after the P07 writer stops; do not pull/cherry-pick or copy worker source independently.

Use actual P05 `infrastructure.database`, `http.dependencies`, `http.errors` paths and `modules/access/` feature ownership once incorporated. P07's schema-only patch will move from pre-P05 schema.py to openapi/schema.py during master integration. Do not recreate the database Base, settings, transaction dependency or auth principal. Authenticated reads must not leave SQLAlchemy autobegin state that conflicts with explicit write transactions; recheck membership and write audits before committing responses. Migrations remain one chain: foundation → identity/session → organizations/projects/memberships.

The obsolete role/permission checkpoint f06d180 was retired by the master, restoring this publication branch to P03 base765c1f5 while preserving dirty source. The role module is absent; a private master backup exists only for recovery. Do not revive it or publish it.

Pending real verification: selective project membership, org-only membership cannot reveal projects, guessed/cross-org metadata denial, revocation/rejoin behavior, auditable changes and affected QueryClient/stream cleanup. Provider-dependent checks require P06A's real Google configuration. UI-first delivery does not claim any of these runtime properties.
