# P04–P07 parallel worktrees

The human authorized these four existing phase chats to progress concurrently in separate worktrees, with individual review and later PRs. Source: master chat `01a17ecb-bb2e-7623-9b6b-1b83c79e4495`, turn `01a18480-c21b-7fe3-bee6-7b12ed33076e`, message `01a18480-c24a-7a10-a0b4-a3b14a6251e5`.

## Isolation and ownership

The authoritative registry stays at `/Users/ducng/Desktop/workspace/FeatherLaneFlight/docs/phases/registry.json`. It records active phases and each assigned workspace, branch, cursor, dependencies and approval state. Local registry copies are snapshots; workers read the authoritative file and do not edit either copy. Each worktree has one writer. No worker writes into another checkout or changes Git refs.

Keep dependency environments, local databases, ports and runtime files isolated too. Install workspace dependencies inside the assigned worktree; do not symlink the primary checkout’s node_modules or virtual environment because workspace package links can resolve to the wrong source. Package download caches may be shared. Never migrate another phase’s database or stop its server.

The master manages worktree migration, scoped local checkpoints, integration and later approved publication. Reversible local checkpoint commits may transfer reviewed dependency code between these worktrees; they do not authorize pushing or opening PRs. Checkpoint only named source files, keep generated/private/runtime files excluded, and wait for the affected writer to stop before changing its Git state. Never discard uncommitted work.

| Phase | Independent scope                                                                                   | Integration requirement                                                                              |
| ----- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P04   | Approved mock run-detail/evidence UI and canonical detail contracts                                 | P03 merged; independent of backend.                                                                  |
| P05   | Approved modular FastAPI/PostgreSQL foundation, offline contracts, bounded HTTP/errors/storage port | Reviewed actual foundation source, then individual PR/merge.                                         |
| P06   | Approved sign-in/access presentation only                                                           | No backend/API/session implementation; can merge independently.                                      |
| P06A  | Separate Google OIDC, identity/session/CSRF backend                                                 | Start after reviewed P05 source; latest human asks dispatch after P05+P06 merges.                    |
| P06.5 | Small UI/API wiring task                                                                            | Strictly wait for verified P05+P06 merges and actual P06A endpoints; publish against merged backend. |
| P07   | Approved organization-in-Settings/sidebar-project UI; two explicit membership tables, no roles      | UI first; backend waits for actual P05+P06A source.                                                  |

Do not invent temporary replacement databases, duplicate SQLAlchemy bases, fake login routes, auth bypasses, or placeholder implementations to make a downstream branch appear complete. If a seam is not ready, finish independent work and report `WAITING_DEPENDENCY` with its exact requirement. Use `BLOCKED` for an external input such as missing provider configuration. Neither state is COMPLETE.

## Shared seams and checkpoints

1. P05 reports actual import paths and signatures for its settings, app factory, SQLAlchemy Base/session factory, request transaction ownership, router registration and migration environment at the first working foundation checkpoint. P06A/P07 consume these rather than making competing foundations.
2. P06A owns authenticated principal, identity/session persistence, expiry/revocation and CSRF dependencies. Its SessionView contains identity and session-bound CSRF. P07 owns separate bounded membership/project discovery with IDs/names; organization membership alone gives no project access. No roles/fine-grained permission vocabulary. The obsolete local access-projection checkpoint is retired and preserved only by a private local backup ref.
3. Reserve migration order: foundation → identity/session → organization/project access. Avoid independent competing Alembic heads. Domain models and migrations stay in phase-owned modules; central imports/app registration are reconciled at integration.
4. P04 owns run-detail UI/fixtures and its contract additions. P05 owns core app/config/database/error/storage modules. P06 owns presentation only; P06A owns identity/session/OIDC; P06.5 owns browser session/API/QueryClient wiring. P07 owns membership/project modules and its approved UI.
5. Workers may make narrowly scoped changes to shared contract exports, HTTP metadata, configuration aggregation, app composition and lockfiles inside their own worktrees. Report those patches clearly. The master reconciles them in dependency order and reruns generation and applicable checks; workers do not copy another phase's code or edit its checkout.

Dependency exchange uses real, reviewed local source checkpoints. P05 → P06A → P07 is the backend verification order even while independent work proceeds in parallel. Auth-provider verification may remain blocked until the human supplies the required local configuration; no replacement production login is permitted.

## Approval and completion

UI work first shows a rendered preview and waits for explicit human approval. Implementation approval covers the shown scope only. Keep captures temporary/ignored and delete them after evaluation/approval. No new automated tests, external deployment, credentials/configuration changes or publication are authorized by parallel dispatch.

Use `READY_FOR_REVIEW` only when the phase's actual dependency code is incorporated, applicable manual/tooling verification is complete, and limitations are recorded. Prepared source awaiting an upstream checkpoint stays `WAITING_DEPENDENCY`. The master reviews each completed phase and requests separate submission approval. The user will review each worktree before deciding on its PR. No pushes, PRs or merges are authorized by this parallel-work request; stacked PRs remain a separate decision.

Later phases remain staged. After the parallel wave is integrated, verified and user-merged, normal dependency-aware dispatch resumes. The master must not dispatch P08 merely because one parallel worker finishes.

## Auth split and environment rules

The human separately selected P06A authentication backend and confirmed P06 UI-only/P06.5 wiring after P05+P06 merges (master messages `01a18499-c6d8-7213-8564-6102b1004bc4` and `01a1849a-421d-7332-9c84-d23f80552434`). Message `01a184a4-e70c-7771-8757-d69e2abde807` explicitly approves P05+P06 PRs/merges and dispatching P06A afterward; it does not approve a future P06A/P06.5 PR. P06.5 stays staged while auth endpoints are built. Google configuration is missing: record pending real-provider verification without treating it as a P06 UI blocker. Use Doppler process injection; retain no local secret/env files and never modify global credentials/configuration.
