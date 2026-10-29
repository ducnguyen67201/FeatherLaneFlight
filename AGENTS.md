# FeatherLaneFlight coding rules

## Scope

Work follows the user-authorized phase-chat workflow in `docs/phases/README.md`. Read `docs/phases/registry.json` for the active phase and its assigned plan. Implement only the dispatched scope; staged chats stay read-only. UI implementation additionally requires the preview/approval gate below. Follow the architecture and canonical contracts in `docs/EngineeringSpec.md`.

## Technology stack

| Component                       | Planned implementation                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Web UI                          | React, strict TypeScript, Vite, TanStack Query v5.                                                                                      |
| UI foundation                   | MUI Core, Material Icons, design-tokens.json mapped through one MUI theme; Core Table for initial lists.                                |
| Backend API                     | Python 3.12 with FastAPI and Pydantic 2.                                                                                                |
| Background worker               | Python; shares application modules with the API.                                                                                        |
| Customer runner and PX4 adapter | Python 3.12, MAVSDK Python, uv-managed dependencies.                                                                                    |
| Canonical contracts             | Shared Pydantic 2 package imported by API and runner; OpenAPI generates the TypeScript SDK, Zod validators, and TanStack Query options. |
| Database                        | PostgreSQL with SQLAlchemy 2.x and Alembic migrations.                                                                                  |

Use pnpm for frontend tooling and uv for Python packages. PX4 runs as a separate autopilot/simulator process; the Python runner communicates with it through MAVSDK/MAVLink. See section 2 of `docs/EngineeringSpec.md` for the complete stack.

## Phase-chat coordination

- P06 is UI only; P06A owns authentication backend; P06.5 wires them after verified P05 and P06 merges and working auth endpoints. P07 uses explicit organization/project membership without roles. The master registry assigns each phase its workspace. One implementation writer is allowed per checkout. The user-authorized P04–P07 parallel wave uses separate worktrees; staged chats remain read-only. Follow `docs/phases/P04-P07-parallel.md` for dependency checkpoints and integration gates.
- The master owns `docs/phases/registry.json`, reviews handoffs, requests completed-phase submission approval, manages approved PRs, and dispatches successors after the merge gate. Workers write only their own phase handoff in `docs/phases/handoffs/` and report READY_FOR_REVIEW, AWAITING_UI_APPROVAL, or BLOCKED accurately.
- The user requested phase completion reports to the master and master dispatch of subsequent phases. Follow `docs/phases/README.md` for that bounded messaging workflow and its original human authorization source. Do not send unrelated messages or dispatch successors from a phase chat.
- A master dispatch authorizes the assigned implementation work; it does not approve unseen UI, new automated tests, or external deployment/publishing.

## Phase approval and pull requests

- Target repository: `https://github.com/ducnguyen67201/FeatherLaneFlight`. After reviewing a completed phase, show its concrete scope/diff and verification results, then wait for explicit human approval to push it and open its PR.
- UI preview approval authorizes the shown UI implementation only. It is separate from completed-phase submission approval. Neither a roadmap approval nor this standing workflow instruction approves an individual phase's publication. Record the human approval source and reviewed scope.
- After submission approval, the master commits the scoped changes, pushes `codex/phase-XX`, and opens one phase PR against the verified base branch. Stage named files, inspect the diff, run applicable checks/dependency audits, and preserve unrelated work. Include meaningful verification and limitations in the PR description, record its URL/head SHA, and attach the PR to this master chat.
- The user decides merging. Never merge, enable auto-merge, force-push, or push implementation directly to the default branch. If the empty repository needs an initial empty base commit, explicitly include that separate bootstrap action in the first concrete approval request.
- Normally wait until GitHub confirms the predecessor PR was merged, then safely refresh the local base before dispatching the next phase. Closed without merge is not completion. Stacked/dependent PRs require explicit user authorization. Do not switch branches while an implementation writer is active or discard uncommitted work.

## UI preview and approval

- Before implementing or changing application UI, show the user a rendered visual preview of the proposed scope and wait for explicit approval.
- Show working UI: either the actual implemented application or an interactive browser preview built with the real React/MUI components, shared theme and tokens intended for implementation. Do not use static mockups, painted SVG/PNG screens, image-only prototypes or a separate visual imitation as UI design reviews. Carry approved preview component code into the application rather than recreating its appearance afterward.
- A UI task authorizes isolated preview-only component code and minimal, clearly labeled fixture data before approval. Keep preview entry points and simulated integration callbacks separate from application routes and live integrations; identify what is and is not connected.
- Present a working browser URL or open browser view and demonstrate the relevant controls and states. Screenshots may document the running UI, but cannot replace the interactive preview. Code, token tables, ASCII diagrams and descriptions alone do not satisfy this requirement. Never claim browser interaction verification when browser control is unavailable.
- After presenting the preview, stop and request approval. Silence, elapsed time, the initial task request, and requests for revisions do not count as approval. Revise the preview when asked and continue waiting.
- Approval authorizes implementation of the shown scope. Do not request approval again for that unchanged scope. A materially different design or expanded UI scope requires an updated preview and approval.
- Review screenshots and evaluation images are temporary. Keep them outside the checkout or in an ignored phase artifact directory while review is pending. After the relevant evaluation and approval are finished, delete the captures and remove their document links. Record approval sources and verification results as text; do not commit review images. Preserve product assets and user-supplied files.

- Preview code is temporary review scaffolding. After the approved UI is implemented and verified, remove its preview-only source files, mock copies, entry points, build output and local preview servers before handoff or PR submission. Keep the application implementation and textual approval/verification evidence; do not retain a second preview application. Preserve product assets and user-supplied files.

- Before handoff or PR creation, remove unused preview scaffolding, temporary review captures, and build output. Commit final approved diagram SVGs, editable JSON sources, and Markdown approval/context only; generated interactive diagram HTML and delivery sidecars stay ignored local output unless the user explicitly requests shipping them. Preserve needed product assets and source files.

## UI design and reuse

- Follow `DESIGN.md`: establish the central theme/component defaults, shared shell and page layouts, and manually reviewed reference view before feature screens.
- Use the visual rules in DESIGN.md: near-black surfaces, fine borders, yellow accents, small corner radii, clear typography, and compact, readable data. Apply them through the shared MUI theme.
- Keep exact visual values in `design-tokens.json`. The future `src/web/design/theme.ts` imports and maps them into MUI; derive CSS variables through MUI instead of duplicating values. Use the shared contract-driven status presentation map.
- Use MUI controls directly. Extract small shared product patterns when they repeat; avoid wrapping every primitive or building a universal UI framework.
- Keep one primary component library and reuse the shared layouts across screens. Add grid/visualization dependencies only for an actual requirement; verify any licensing constraints first.
- For UI/UX design, implementation, or review, use the installed `.agents/skills/ui-ux-pro-max/SKILL.md` alongside DESIGN.md and design-tokens.json. Keep its recommendations within the chosen MUI stack and this policy. Merge accepted rules into DESIGN.md and exact values into the token file; preserve test ownership.

## Simple, readable implementation

- Write the smallest clear implementation that correctly satisfies the requirement, expected use cases, and relevant failure cases. Do not build for hypothetical future requirements.
- Prefer straightforward control flow, descriptive names, and focused functions/modules. Avoid deeply nested logic, clever expressions, and unnecessary indirection.
- Keep responsibilities clear without splitting simple logic across many tiny files or one-line wrappers. Do not impose arbitrary file or function length targets.
- Reuse existing code, libraries, and established project patterns. Add abstractions, dependencies, configuration, or new layers only when a concrete requirement justifies them.
- Keep changes focused. Avoid unrelated refactors, speculative optimizations, unused helpers, and placeholder implementations.
- Use comments to explain a non-obvious reason or constraint, rather than restating the code. Remove dead code and obsolete comments.
- Handle errors where they can be recovered from or reported meaningfully. Do not hide failures with blanket exception handling, silent fallbacks, or invented success values.

## React components and hooks

- Keep page and modal components focused on composing the UI. Split substantial sections, tables, filters, form steps, and feedback regions into cohesive components instead of keeping an entire workflow in one large JSX file.
- Extract related form state, dependent-selection resets, query composition, mutation/preflight sequencing, and effects into focused custom hooks when they obscure the rendering component. Give hooks meaningful actions and a small, explicit return surface; avoid merely moving a large component's code into one equally unfocused hook.
- Group related draft fields and use a reducer when coupled transitions and resets become clearer that way. Keep independent UI state local. Derive selected records and other computed values from existing state/query data rather than maintaining duplicate state; use memoization only when it has a concrete benefit.
- Pass child components the typed data and callbacks they need through clear props. Use canonical generated types for domain data; do not invent parallel DTOs or pass an entire query client, query result, or hook state bag when a few values and actions suffice.
- Keep server state in TanStack Query and local form concerns in the form hook. Preserve generated client validation, cache identity, eligibility checks, idempotency, pending guards, and focus behavior when extracting logic.
- Before handoff, split files that mix substantial query/mutation logic, workflow transitions, effects, and many large rendering branches. Split by responsibility and readability, not an arbitrary line count. Small components and simple logic may stay together; avoid one-line wrappers, unnecessary prop drilling, and a universal component framework.

## Contracts and correctness

- Keep generated schema/client directories out of Git as build artifacts; workspace setup, typecheck, and build regenerate them. Track canonical definitions, HTTP metadata, generators, handwritten client policy, fixtures, and dependency lockfiles.
- Use the canonical contracts and generated client/types/validators. Do not hand-maintain duplicate DTOs, enums, schemas, or API paths.
- Preserve necessary boundary validation, authorization, version checks, lease rules, evidence checks, and process cleanup. Simplicity must not remove required correctness.
- Keep types explicit at integration boundaries. Avoid unchecked casts and `any` that bypass the contract.
- Minimal MSW fixtures needed for UI development are allowed. Use shared contracts; do not create a separate mock domain model or a large speculative fixture catalog.

## Formatting

- Use Prettier for supported frontend and document files, following the repository configuration. Configure it during authorized project setup if it is not present.
- Use the configured Python formatter; prefer Ruff formatting when Python tooling is established. Prettier is not the Python formatter.
- Keep formatting consistent and limit formatting changes to relevant files. Formatting does not replace readable structure or clear names.

## Verification and test ownership

- Do not create or modify automated tests, snapshots, test scaffolding, or coverage targets unless the user explicitly requests it. Do not apply TDD or generate tests automatically through a skill or template.
- Finish the implementation and manually verify the relevant behavior before handing it back. The user will add automated tests afterward.
- Run relevant existing format, lint, type, build, and test checks where available. This permits running existing tests, not writing additional ones.
- Manually exercise the main flow and relevant empty, loading, error, and failure states. Keep verification proportionate to the change; do not introduce redundant verification frameworks or scripts.
- Report what was actually checked and any remaining limitation. Do not claim a feature works based only on code generation, formatting, or a successful build.
- This test-ownership policy overrides generic skill defaults for TDD, test generation, or coverage percentages. Future testing requirements in the engineering spec describe later testing work; they do not authorize agent-written tests.
