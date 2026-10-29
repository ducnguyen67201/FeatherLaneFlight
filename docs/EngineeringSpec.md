# FeatherLaneFlight Engineering Specification

Status: proposed design, documentation only. Updated October 28, 2026.

This document defines the intended first implementation from UI and design tokens through authentication, API contracts, runner execution, and PX4 integration. No application, credentials, infrastructure, or simulator installation is created by this specification. File trees, commands, routes, and examples below are planned interfaces, not existing functionality.

**Hosting direction updated by the human:** FeatherLane-managed cloud workers are the default; connected customer machines are optional. [Execution hosting design and deployment plan](plans/execution-hosting.md) records the exact source, revised trust boundaries, contract/phase impacts, and deployment gates. Its dual-hosting amendment supersedes customer-only assumptions below. The product choice and shown architecture design are approved (see the plan for the human approval source); revised application UI and new implementation increments remain review-gated. It does not approve managed deployment or purchases.

## 1. Product boundary and first deliverable

FeatherLaneFlight helps drone engineering teams run repeatable simulation tests, verify disturbances, inspect evidence, and compare software releases. The first user is an engineer testing software or configuration they control.

The first complete deliverable is:

> From the web UI, an authenticated engineer chooses a compatible build and immutable test suite, runs on FeatherLane cloud by default or explicitly selects a connected customer machine, inspects evidence/results, and compares compatible runs. Managed execution uses a privately ingested supported SITL build and a qualified disposable execution environment; customer execution resolves locally approved inputs.

Initial limits:

- Simulation only. No serial-device access, real aircraft endpoints, firmware flashing, or physical flight control.
- One active run per runner and sequential trials within that run.
- One qualified PX4/SIH quadrotor integration before adding other flight stacks or simulators.
- Managed cloud execution by default, with optional customer-operated execution. Managed mode adds a separately scoped private supported-build ingest and isolated execution path; customer mode keeps executables local. No general source/model upload, arbitrary command service or execution inside the control-plane process. The new scopes and approval/qualification gates are defined in the hosting plan.
- An initial autopilot/mission test exercises PX4 and its configuration. It does not establish vision-AI performance. A customer autonomy application and suitable simulated sensors require a separately qualified integration.
- Test results support engineering decisions. The UI must not describe them as certification, proof of safety, or automatic permission to deploy.

## 2. Proposed technology choices

These are design defaults. Exact package patch versions must be pinned during implementation and changed through reviewed compatibility updates.

| Area                      | Proposed choice                                                                              | Reason and boundary                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Web                       | React, strict TypeScript, Vite                                                               | A focused application with a separate, reusable HTTP backend.                                                                 |
| UI foundation             | MUI Core, Material Icons, one central MUI theme                                              | Reuse prebuilt controls; define theme, shared layouts, and product patterns before screens.                                   |
| Design token values       | Root design-tokens.json, mapped by the future MUI theme                                      | One machine-readable value source for color/state pairs, type, spacing, shape, motion, and shared layout dimensions.          |
| Styling and tables        | MUI's default Emotion engine; Core Table for initial lists                                   | Theme-derived CSS variables and bounded cursor pagination; add a richer grid only for a demonstrated requirement.             |
| Web state                 | TanStack Query v5 for server state; local form state                                         | Generated query/mutation options call the validated SDK; application policy owns caching and invalidation.                    |
| Mock transport            | MSW with contract-validated fixtures                                                         | Build UI first using the same HTTP operations as the eventual backend.                                                        |
| Control plane             | Python 3.12, FastAPI, Pydantic 2                                                             | One modular service for authorization, scheduling, evidence metadata, and scoring; shares Python wire models with the runner. |
| Authentication            | Authlib Google OIDC; opaque server-side application sessions                                 | Library handles the identity protocol; the application owns sessions, membership, and authorization.                          |
| Persistence               | PostgreSQL, SQLAlchemy 2.x, Alembic                                                          | Reviewed migrations and transactions for run admission, claims, leases, and finalization.                                     |
| Artifact storage          | Storage port; private filesystem in development, S3-compatible storage for hosted deployment | Durable artifacts without exposing host filesystem paths.                                                                     |
| Runner                    | Python 3.12, uv-managed environment, MAVSDK Python                                           | Execute near the customer's PX4 environment and reuse drone tooling.                                                          |
| Scenario implementation   | Versioned Python handlers; pytest for adapter verification                                   | One supervisor owns execution; pytest is not a second independent scheduler.                                                  |
| Contracts                 | Shared Pydantic 2 package; generated OpenAPI 3.1/JSON Schema and TypeScript client           | API and runner import canonical Python models; browser types and runtime validators are generated.                            |
| Browser client generation | Pinned `@hey-api/openapi-ts`: Fetch SDK, Zod 4, TanStack Query v5 options                    | One generation pipeline from the local OpenAPI snapshot; explicitly enable runtime validation.                                |
| Workspace                 | pnpm workspace for web tooling; uv workspace for Python packages                             | One JavaScript lockfile and one Python lockfile; no Node service required for the backend.                                    |

Use supported package versions compatible with these choices; exact versions and generator/plugin compatibility are resolved in the bootstrap stage. Node.js 24 LTS is the proposed frontend tooling runtime. Commit JavaScript and Python lockfiles. No dependency installation is part of this documentation task.

FastAPI is chosen for Python integration work and shared API/runner models. Broad drone compatibility comes from the versioned adapter interfaces in section 12, not from a web framework or from requiring customers to use Python internally. A customer application can use another language while exchanging the supported protocol at its integration boundary.

Do not introduce Redis, a separate message broker, Kubernetes, or independent scheduling microservices for the first implementation. A PostgreSQL-backed work queue and one control-plane worker process are sufficient for the initial concurrency model.

## 3. System architecture

Subsystem detail: [events and live updates](architecture/events-live-updates.md) records the approved P15 event delivery, authorized SSE and snapshot recovery design, local implementation status and dependency gates.

Subsystem detail: [build and profile registration architecture](architecture/build-profile-registration.md) records the approved P09 scope and its implementation status.

Subsystem detail: [suite authoring architecture](architecture/suite-authoring.md) records the approved P11 draft/publication scope, edit and publication versioning, trust boundary and local implementation status.

```text
 USER'S BROWSER                         FEATHERLANEFLIGHT CONTROL PLANE
 +--------------------------+           +-----------------------------------+
 | React web app            |  HTTPS    | Same-origin ingress               |
 | - token-based UI styles  +---------->| - static web assets               |
 | - typed HTTP client      |           | - /api/auth/*                     |
 | - run/results screens    |<----------+ - /api/v1/*                       |
 +--------------------------+ JSON/SSE  +----------------+------------------+
                                                        |
                                       +----------------v------------------+
                                       | FastAPI application               |
                                       | AuthZ | Runs | Runners | Evidence  |
                                       | Profiles | Evaluation | Compare   |
                                       +----------+--------------+---------+
                                                  |              |
                                       +----------v----+   +-----v---------+
                                       | PostgreSQL    |   | Private       |
                                       | queue + state |   | artifact store|
                                       +---------------+   +---------------+
                                                        ^
                       outbound HTTPS only              |
                 claims / heartbeat / events / artifacts|
 +------------------------------------------------------+------------------+
 | CUSTOMER EXECUTION MACHINE                                              |
 | +---------------------------+    +------------------------------------+ |
 | | Runner supervisor         |    | One isolated simulation attempt    | |
 | | - local profile allowlist +--->| Scenario handler -> MAVSDK         | |
 | | - lease watchdog          |    |                     |              | |
 | | - process ownership       |    |                MAVLink/loopback    | |
 | | - durable event spool     |    |                     v              | |
 | | - artifact policy         |    | PX4 SITL <-> built-in SIH physics   | |
 | +---------------------------+    | Logs + telemetry -> output folder  | |
 |                                  +------------------------------------+ |
 +-------------------------------------------------------------------------+
```

The browser never opens a direct connection to a runner, simulator, or drone. The customer runner makes outbound connections to one configured control-plane origin. MAVLink and process control remain local to the execution machine. The diagram above shows this customer-hosted path. In managed mode, a trusted project-bound controller outside the customer-code guest owns claims, leases and infrastructure cleanup; the disposable guest has only a single-attempt evidence channel. See the dual-hosting architecture for that additional trust boundary. The control-plane maintenance worker remains a separate responsibility from the simulation runner.

The API process and background worker are two entry points into the same application modules and database. The API serves requests; the worker expires leases, finalizes derived summaries, and performs retention work. Tests must not run in either process.

For production, the ingress routes the web and API under one origin. During development, Vite proxies `/api` to FastAPI so browser behavior remains same-origin. Do not solve development convenience by allowing arbitrary CORS origins.

The approved [runner execution subsystem architecture](architecture/runner-execution.md) expands the execution part of this system overview and links its deployment proposal, editable sources, approval evidence and implementation status.

## 4. Ownership and dependency direction

| Component                    | Owns                                                                            | Must not own                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Web features                 | Screens, forms, accessibility, presentation, HTTP adapters                      | Credentials for runners, flight commands, authoritative scoring.     |
| Contracts                    | Pydantic wire models, status vocabulary, metric definitions, protocol envelopes | React, FastAPI, database clients, subprocess execution.              |
| Generated browser client     | Derived TypeScript types, SDK, Zod validators, query/mutation options           | Handwritten copies of schemas or application caching policy.         |
| Application services         | Authorization, admission, orchestration policy, evaluation and comparison       | HTTP objects or simulator SDK types.                                 |
| Persistence/storage adapters | SQLAlchemy transactions, private object reads/writes                            | Product decisions or UI semantics.                                   |
| Runner supervisor            | Lease enforcement, local execution policy, child lifecycle, evidence transport  | User/org administration or arbitrary cloud-provided shell execution. |
| Drone adapters               | PX4 connection, supported commands, observations, parameter changes             | Cloud sessions, application routing, release approval.               |
| Scenario handlers            | Trigger conditions and collection of scenario observations                      | Secret management or independently claiming work.                    |

Dependencies flow inward through explicit interfaces. PX4 and MAVSDK-specific values are translated at the runner adapter boundary; they must not leak into every screen or domain entity.

## 5. Repository structure

Applications live under `src/`; canonical contracts and their generated consumers live together under `packages/contracts/`. P01 supplies the Python contract package, offline API metadata, client generation, and web mocks. `packages/contracts/schemas/` and `packages/contracts/typescript/src/generated/` are ignored outputs created during setup/build; only their sources and handwritten consumers are tracked. Web screens, the runner, migrations, event schemas, and infrastructure below remain planned for their assigned phases.

```text
FeatherLaneFlight/
|-- README.md
|-- DESIGN.md                        UI library, theme, layouts, manual review gates
|-- design-tokens.json               canonical visual values
|-- .agents/skills/ui-ux-pro-max/     installed local design guidance
|-- docs/                            specification, plans, and handoffs
|-- src/
|   |-- api/
|   |   |-- pyproject.toml
|   |   |-- alembic.ini               planned migration configuration
|   |   |-- migrations/              planned reviewed migrations
|   |   `-- src/featherlane_api/
|   |       |-- app.py                composition root / runtime lifespan
|   |       |-- cli.py                flf-api process entry point
|   |       |-- config.py             validated process configuration
|   |       |-- http/                 errors, middleware, dependencies, meta router
|   |       |-- openapi/              resource-free schema.py / export.py
|   |       |-- infrastructure/       shared database.py Base/engine/session factory
|   |       |-- modules/
|   |       |   `-- evidence/ports.py  private-storage boundary; adapter deferred
|   |       `-- worker/               later background work
|   |-- web/
|   |   |-- package.json
|   |   |-- mocks/                    validated JSON fixtures and MSW handlers
|   |   |-- app/                      planned routes and shared providers
|   |   |-- design/                   planned theme and status presentation
|   |   |-- layouts/                  planned shared shell and layouts
|   |   |-- components/               planned repeated product patterns
|   |   |-- features/                 planned feature screens
|   |   `-- api/                      planned feature query/session policy
|   `-- runner/                      planned Python runner
|       |-- pyproject.toml
|       `-- src/featherlane_runner/
|           |-- protocol/             enrollment, leases, events, uploads
|           |-- supervisor/           watchdog, locks, process cleanup
|           |-- adapters/px4/         MAVSDK and SIH integration
|           |-- scenarios/            versioned built-in handlers
|           `-- evidence/             telemetry and redacted logs
|-- packages/
|   `-- contracts/
|       |-- README.md                 source and generation ownership
|       |-- python/
|       |   |-- pyproject.toml
|       |   `-- src/featherlane_contracts/ canonical Pydantic wire models
|       |-- schemas/
|       |   |-- openapi.json          generated HTTP operations and schemas
|       |   |-- manifest.json         generated versions and schema digest
|       |   `-- events.schema.json    planned generated event catalog
|       `-- typescript/
|           |-- package.json          @featherlane/contracts
|           `-- src/
|               |-- generated/        generated SDK, Zod, Query options
|               |-- transport.ts      validated status-aware transport
|               |-- sdk.ts            typed public SDK entry points
|               `-- queries.ts        shared query defaults
|-- integrations/                    planned compatibility manifests
|-- infra/                           planned local services configuration
|-- scripts/contracts.mjs            generation and drift check
|-- pyproject.toml                   uv workspace: contracts and API now
|-- uv.lock                          pinned Python dependency resolution
|-- pnpm-workspace.yaml              web and TypeScript contracts
`-- pnpm-lock.yaml                   pinned JavaScript dependency resolution
```

The backend follows a modular monolith: HTTP adapters and resource-free OpenAPI metadata stay separate from shared infrastructure and focused feature modules. P06A adds `modules/identity/`; P07 adds `modules/access/` only when implemented. Keep domain rules independent of FastAPI, use application services for explicit transaction ownership, and add ports/adapters only where needed. Do not scaffold empty future modules or a generic repository framework. P05's API README records actual import paths and process configuration. Secrets are injected by Doppler into the process; retain no local secret/environment files.

The Python packages retain their internal `src/<import_package>/` layout for isolated packaging. The web package uses `src/web/` as its application root. Mock payloads live with the web application and are validated by the shared generated contracts; they do not define another schema.

Do not vendor another project's application source into this workspace. PX4 may be an explicitly pinned external checkout or build dependency referenced by a locally approved execution profile.

## 6. UI-first design and token contract

Use **MUI Core (`@mui/material`) and Material Icons (`@mui/icons-material`)** as the first UI library, with its supported default Emotion dependencies. Pin compatible versions during bootstrap. MUI supplies the controls; FeatherLaneFlight defines the product theme, layouts, and domain presentation. [DESIGN.md](../DESIGN.md) is the maintained UI design guide; this specification owns workflow, contract, and status semantics.

Use near-black surfaces, fine borders, bright yellow accents, small corner radii, clear typography, and compact data displays with a clear hierarchy. [design-tokens.json](../design-tokens.json) defines exact values. Implement them through the MUI theme and component defaults while preserving shared navigation and simulation workflows. DESIGN.md records their use and the installed project-local UI UX Pro Max workflow. Application implementation remains deferred until requested.

Use MUI components directly. Extract shared product components when behavior or composition repeats, such as run status and evidence summaries. Avoid a wrapper for every Button/TextField or a configurable universal dashboard framework. Initial lists use Core Table with shared cursor navigation matching the API. A future MUI X Community Data Grid needs a demonstrated interaction/virtualization requirement and a qualified pagination adapter; Pro/Premium features require a separate licensing decision.

### 6.1 Information architecture

```text
Sign in
   |
Organization / Project selection
   |
   +-- Runs -----------------> Run detail
   |                              |-- Summary and checks
   |                              |-- Stage / disturbance timeline
   |                              `-- Evidence and artifacts
   +-- Compare --------------> Compatible baseline vs candidate
   +-- Test suites ----------> Immutable suite revisions and requirements
   +-- Runners --------------> Enrollment, health, capabilities, diagnostics
   `-- Settings -------------> Build registrations, baseline, access, retention
```

Runs is the first landing screen. The primary operation is **New simulation run**. There is no arm/takeoff control panel in the web UI; the runner executes those steps only inside approved simulation scenarios.

### 6.2 Screen-to-contract map

| Screen      | Primary data                                                                           | Allowed actions                                                                                       |
| ----------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Runs        | Build, suite revision, execution state, test outcome, runner                           | Create run; filter; open evidence.                                                                    |
| Run detail  | Immutable manifest, trials, checks, event timeline, artifacts                          | Request cancellation; create an explicit rerun; select as baseline if eligible.                       |
| Compare     | Matched manifests, sample counts, metric deltas, missing evidence                      | Select runs; inspect incompatibility reasons; open changed checks.                                    |
| Test suites | Scenario and requirement definitions, capability needs, revisions                      | Edit draft; validate; publish immutable revision.                                                     |
| Runners     | Connection health, capacity, protocol version, available builds, verified capabilities | Project members enroll/revoke within their explicitly granted project; view diagnostics.              |
| Settings    | Own memberships, builds, baseline pointer, effective retention                         | Register builds/change baseline; membership and retention editing are deferred from the first web UI. |

Example run detail layout:

```text
+-----------------------------------------------------------------------+
| Project / Runs / Run 184        Execution: Completed   Tests: Failed    |
| Build digest ...  Suite rev ...  Runner ...      [Compare] [Rerun]      |
+--------------------------+--------------------------------------------+
| Trial and check list     | Selected trial                              |
| - Nominal flight: PASS   | Trigger -> injection confirmed -> response  |
| - GNSS scenario: FAIL    | Expected / observed / evidence references   |
| - Evidence checks       |                                            |
+--------------------------+--------------------------------------------+
| Tested versions | Parameters digest | Telemetry | ULog | Redacted log |
+-----------------------------------------------------------------------+
```

### 6.3 Design token layers

```text
Product design rules -> design-tokens.json -> MUI theme adapter
                              |
                              v
                   Component defaults + shared layouts
                              |
                              v
                   Shared product patterns -> Feature screens
```

| Layer      | Examples                                                                                        | Rule                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Values     | Dark surfaces, brand/state pairs, type, spacing, shape, motion, layout                          | Exact definitions live in design-tokens.json; DESIGN.md owns usage rules. |
| Semantic   | `surface.canvas`, `text.primary`, `border.default`, `focus.ring`                                | Describe purpose; map consistently across supported themes.               |
| Status     | `status.success`, `status.failure`, `status.warning`, `status.infrastructure`, `status.pending` | Distinguish assertion failure from execution/infrastructure problems.     |
| Components | MUI defaults/variants, status badge, table row, evidence timeline                               | Consume the central theme; feature code uses semantic values.             |

Use the token-defined spacing base/scale and typography variants, with proportional UI text and monospace identifiers/logs. Preserve visible focus, keyboard navigation, semantic headings, accessible dialogs, and status text/icons alongside color. Manually verify reduced-motion behavior and contrast in rendered components. A component library alone does not establish application accessibility.

The existing root `design-tokens.json` is the canonical value source. The planned `src/web/design/theme.ts` imports it and owns MUI mappings, component defaults, and variants without another set of raw values. One root ThemeProvider and CssBaseline apply the result. MUI generates CSS variables for components and custom evidence visualizations. The planned `statusPresentation.ts` maps generated contract states to labels, icons, and semantic theme roles without duplicating colors. Keep feature-local layout composition simple; put repeated visual decisions into the central mapping and usage guide.

| Meaning                                                   | Semantic role     | Example label                           |
| --------------------------------------------------------- | ----------------- | --------------------------------------- |
| Queued, claimed, starting, running, finalizing            | pending           | Queued / Running / Collecting evidence  |
| PASS                                                      | success           | Tests passed                            |
| FAIL                                                      | failure           | Assertion failed                        |
| INCONCLUSIVE or stale connection                          | warning           | Inconclusive / Connection stale         |
| ERROR or NEEDS_CLEANUP                                    | infrastructure    | Infrastructure error / Cleanup required |
| CANCELED, SKIPPED, NOT_EVALUATED, offline/disabled runner | neutral secondary | Canceled / Not evaluated / Offline      |

Execution COMPLETED alone is neutral; the evaluation outcome provides its separate badge. Maintain an exhaustive central presentation map so new contract states cannot acquire an accidental default color or label.

### 6.4 Fixture-first implementation contract

Before drawing screens, define the status vocabulary and DTO schemas in section 7. Build MSW handlers using the exact proposed routes in section 8. Fixtures are schema-validated and deterministic; they do not embed secrets or connect to real runners.

Required fixtures: no project; no runner; queued; starting; running; passed; assertion failed; inconclusive; infrastructure error; stale/offline runner; busy runner; cancellation requested; canceled; expired enrollment; rejected capability; incompatible comparison; missing artifact; forbidden action.

The mock transport changes when the API arrives. Page components, field names, status semantics, and action meanings must stay the same. No component-owned timer may manufacture an authoritative run outcome.

The revised New Run form follows **execution location (FeatherLane cloud by default / your machine) -> compatible profile/build -> eligible published suite -> repetitions -> review**. Managed mode resolves a qualified pool/profile and private verified input artifact; customer mode resolves a selected runner's approved declarations. Changing location resets incompatible selections; never silently move a job between modes. Populate choices from canonical inputs and the API's eligibility response. Digests are read-only evidence, not values a user must type. The API revalidates eligibility at admission, so stale browser choices cannot bypass checks. Suite editing initially configures allowlisted built-in handlers/checks and bounded parameters; there is no custom scenario scripting language. Material UI changes require the revised rendered preview approval.

### 6.5 TanStack Query and live updates

TanStack Query owns remote resource caching, request lifecycle, refetching, and mutation status. It does not validate JSON, authorize access, or own the run state machine. Components consume thin feature query modules that compose generated query/mutation options with application policy. Those modules must not duplicate URL paths, DTOs, enums, or validators.

| Concern             | Required behavior                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query function      | Call the generated SDK with runtime validation enabled. Validate before resolving the query function, so invalid data never enters the cache. Validation only in `select` is insufficient.                                                                      |
| Cache identity      | Include an authenticated-context epoch, org/project scope, generated operation key, and all response-changing filters/pagination inputs. Never include secrets. Cache keys do not replace server authorization.                                                 |
| Read freshness      | Active runs use SSE-driven invalidation with a bounded polling fallback. Immutable suite/build revisions may have long stale times; eligibility and runner health must refetch before submission.                                                               |
| Read retry          | At most two retries for transient network/5xx failures; respect Retry-After. Do not retry authentication, authorization, schema, incompatibility, or other permanent validation errors automatically.                                                           |
| Mutations           | `retry: false` initially; no persisted offline mutation queue. A manual transport retry of an uncertain submission reuses its original idempotency key and payload. Never start a run from a query/refetch function.                                            |
| Authoritative state | Show submission/cancellation intent while awaiting server confirmation. Do not optimistically invent RUNNING, CANCELED, or PASS. Invalidate affected lists, details, and eligibility after acknowledged changes.                                                |
| SSE                 | Parse the exported event envelope before processing it; track the cursor and invalidate affected resource queries. Event data is not a complete RunDetail and must not be inserted as one. Recover gaps with a REST snapshot.                                   |
| Identity changes    | Close SSE, cancel outstanding reads, clear query/mutation caches, and replace the authenticated QueryClient on logout/account change. Guard delayed callbacks with the old auth epoch. Clear affected caches on membership loss. No persistent cache initially. |

Passing an AbortSignal to a read cancels that HTTP request only. Stopping a simulation always uses the explicit cancellation endpoint and its server-owned lifecycle. Form drafts and design tokens remain local UI concerns rather than query cache resources.

### 6.6 Shared layouts before feature screens

Build the shared shell and page composition before implementing individual routes. AppShell owns the project/org selector, navigation, user menu, and content region. PageLayout gives every feature the same breadcrumb/title/action area, filter area where needed, and content spacing. A run-detail composition provides the check list and selected evidence panel. Compose these from MUI layout/navigation primitives; extract only the layouts that actually repeat.

```text
 +-----------------+--------------------------------------------------+
 | FeatherLane     | Organization / Project                  User menu|
 |                 +--------------------------------------------------+
 | Runs            | Breadcrumbs                                      |
 | Compare         | Page title + description        Primary action   |
 | Test suites     +--------------------------------------------------+
 | Runners         | Filters / tabs when applicable                   |
 | Settings        +--------------------------------------------------+
 |                 | Main content: list, detail, comparison, or form   |
 +-----------------+--------------------------------------------------+
```

Keep sidebar width, header height, page padding, content widths, table density, and responsive breakpoints in design-tokens.json and map them through the theme. At narrow widths, navigation becomes a temporary drawer and detail panels stack. Tables may scroll horizontally within their content region while preserving labels/actions and page navigation. [DESIGN.md](../DESIGN.md) defines usage and page patterns.

Before application UI implementation, show an isolated rendered foundation preview containing the shell, page patterns, representative MUI controls, status badges, and loading/empty/error/disabled states. It uses minimal mock data and requires no new Storybook setup or automated test suite. Wait for explicit user approval before implementing that foundation. Each later UI task also needs a rendered preview and approval for its proposed scope. Revisions update the preview; they do not authorize implementation. Approval remains valid for the unchanged shown scope. AGENTS.md defines the approval policy, and DESIGN.md defines the sequence.

## 7. Domain model and canonical contracts

All public JSON uses camelCase, UTC ISO timestamps for wall time, explicit units, and opaque identifiers. Use schema-derived types and versioned constant sets. Validate unknown JSON at every boundary; no unchecked type assertions or `any` at integration boundaries.

The canonical owner is the `packages/contracts/python/src/featherlane_contracts` package containing Pydantic 2 wire models. FastAPI and the Python runner import the same pinned package directly. It has no FastAPI, SQLAlchemy, MAVSDK, subprocess, or UI dependencies. Database records and adapter SDK objects are translated into these models; neither is the public contract.

```text
                     HAND-MAINTAINED SOURCES
 +-----------------------------------+  +-------------------------------+
 | featherlane_contracts (Pydantic 2) |  | FastAPI route declarations    |
 | DTOs, enums, envelopes, constraints|  | methods, paths, operationIds  |
 +-----------+-----------------------+  +---------------+---------------+
             |                                          |
             +-------> FastAPI requests/responses <------+
             |                         |
             |                   deterministic export
             |                         v
             |             +----------------------------+
             |             | OpenAPI 3.1 + event schemas |
             |             | versioned local snapshots  |
             |             +--------------+-------------+
             |                            |
             |                  pinned Hey API generator
             |                            v
             |             +----------------------------+
             |             | Generated TypeScript       |
             |             | DTOs + Fetch SDK + Zod     |
             |             | TanStack Query options     |
             |             +--------------+-------------+
             v                            v
 +------------------------+   +-------------------------+
 | Python runner          |   | React UI + MSW fixtures  |
 | same Pydantic package  |   | validated SDK -> cache   |
 +------------------------+   +-------------------------+
```

Pydantic owns data shapes; FastAPI route metadata owns HTTP operations. OpenAPI and the browser client are derived artifacts, never independent handwritten sources. The explicit event catalog is exported from the same Pydantic models and registered in OpenAPI components for TypeScript generation; SSE framing itself is specified separately in section 8. Track canonical Python models, HTTP route metadata, generator scripts/configuration, handwritten client policy, fixtures, and dependency lockfiles. Generated schema snapshots and browser client code are ignored build artifacts, regenerated during setup and before builds; do not commit them. Local drift checks compare regenerated bytes with existing local output, without Git diffs on ignored files. This pipeline uses local inputs and requires no hosted code-generation service.

### 7.1 Records

| Record                               | Meaning and invariants                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User / ExternalIdentity / AppSession | Application-owned identity mapping and revocable server-side sessions; Authlib handles OIDC protocol validation. External identities are keyed by issuer and subject.                                                                                                                                                  |
| Organization                         | Application-owned tenant boundary with one explicit owner. Owner-configured saved email or exact-domain rules may grant organization membership at verified login; project grants remain explicit.                                                                                                                     |
| Project                              | Organization-owned grouping of builds, suites, runs, and a baseline pointer. Creation includes an explicit project grant for the creator in the same transaction.                                                                                                                                                      |
| OrganizationMembership               | User/organization grant from an explicit operator change or owner-configured admission rule. Project access also requires a current ProjectMembership. Revocation invalidates prior project grants and excludes automatic rejoining until explicitly allowed.                                                          |
| ProjectMembership                    | Explicit user/project grant with no role or permission flags. Valid only with current organization membership; organization rejoining does not reactivate an old grant.                                                                                                                                                |
| Runner                               | Bound to one org/project in MVP; connectivity, capacity, runtime version, credential generation.                                                                                                                                                                                                                       |
| EnrollmentGrant / RunnerCredential   | One-use bootstrap grant and separately revocable machine identity; only digests stored.                                                                                                                                                                                                                                |
| Build                                | Immutable source revision, artifact digest, target OS/architecture, PX4 version, and configuration digest. No remote executable URL.                                                                                                                                                                                   |
| IntegrationProfile                   | Immutable, versioned compatibility specification: flight stack, simulator, vehicle, tools, available checks and disturbances.                                                                                                                                                                                          |
| LocalExecutionProfile                | Locally approved launch roles, working directory, environment references, endpoints, and artifact policy. A separate local build registry resolves an allowed Build ID/digest to an executable; registry additions do not change scenario semantics. Cloud sees IDs/digests and capabilities, not local secrets/paths. |
| TestSuite / SuiteRevision            | Editable draft plus immutable published scenario and check definitions.                                                                                                                                                                                                                                                |
| Run                                  | Immutable requested build, suite revision, runner, repeat plan, and comparison-relevant inputs.                                                                                                                                                                                                                        |
| RunAttempt                           | Lease, fencing number, execution manifest, timestamps, and terminal reason. One active attempt per run and runner.                                                                                                                                                                                                     |
| Trial                                | One scenario/repetition inside an attempt; preserves observed outcomes and evidence references.                                                                                                                                                                                                                        |
| RunEvent / CheckResult               | Ordered typed events and evidence-backed requirement evaluations.                                                                                                                                                                                                                                                      |
| Artifact                             | Private object key, digest, size, media type, verification state, retention deadline.                                                                                                                                                                                                                                  |
| AuditEvent                           | Enrollment, revocation, baseline changes, cancellations, membership/configuration actions; safe metadata only.                                                                                                                                                                                                         |

```text
Organization -> Project -> Build
                  |-----> TestSuite -> SuiteRevision
                  |-----> Runner -> LocalExecutionProfile declaration
                  `-----> Run -> RunAttempt -> Trial -> CheckResult
                                      |         `----> evidence references
                                      |--------------> RunEvent
                                      `--------------> Artifact
```

A run references exact revisions; edits create a new suite or profile revision. Baseline selection points to an exact eligible completed run and is audited. Re-running creates a new Run with `retryOfRunId`; it never replaces old evidence.

### 7.2 State vocabulary

| Dimension             | Values                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Run/attempt execution | `QUEUED`, `CLAIMED`, `STARTING`, `RUNNING`, `FINALIZING`, `COMPLETED`, `CANCELED`, `ERROR` |
| Trial execution       | `PENDING`, `RUNNING`, `COMPLETED`, `CANCELED`, `ERROR`, `SKIPPED`                          |
| Evaluation outcome    | `PASS`, `FAIL`, `INCONCLUSIVE`, `NOT_EVALUATED`                                            |
| Check outcome         | `PASS`, `FAIL`, `INCONCLUSIVE`                                                             |
| Runner connection     | `CONNECTED`, `STALE`, `OFFLINE`                                                            |
| Runner capacity       | `AVAILABLE`, `BUSY`, `NEEDS_CLEANUP`, `DISABLED`                                           |
| Capability support    | `DECLARED`, `VERIFIED`, `UNSUPPORTED`                                                      |
| Suite authoring       | Editable `DRAFT`; publishing creates a separate immutable `PUBLISHED` SuiteRevision.       |

Cancellation intent is `cancellationRequestedAt`, with nullable `cancellationDeadlineAt`; it is not proof that execution stopped. Only the server owns durable transitions. Runner connection health and capacity are independent: a busy runner can be connected and healthy.

```text
QUEUED -> CLAIMED -> STARTING -> RUNNING -> FINALIZING -> COMPLETED
   |         |          |          |            |
   +---------+----------+----------+------------+------> CANCELED
             +----------+----------+------------+------> ERROR

COMPLETED -> evaluation PASS / FAIL / INCONCLUSIVE
CANCELED or ERROR -> aggregate NOT_EVALUATED; retain individual observations
```

An assertion failure is a completed test with outcome FAIL. An execution failure is ERROR. Unsupported requests are rejected before execution where possible; a runtime capability mismatch produces ERROR with a specific reason, never PASS.

### 7.3 Run manifest and comparison fingerprint

Every accepted run snapshots: contract/protocol versions; build and configuration digests; suite revision/digest; integration and local-profile digests; runner/Python/MAVSDK/PX4 versions; simulator and vehicle configuration; OS/architecture; clock policy and speed factor; actual randomization policy; repetitions; checks and their thresholds; evidence policy and evaluator version.

Separate `requestedManifest` from `observedManifest`. Admission freezes expected values from the selected build, profiles, and runner declaration. During STARTING, the runner measures actual versions/digests and submits a separately immutable observed manifest before mission commands begin. The API rejects drift outside the selected compatibility rules. Comparisons use observed manifests; original requests are never silently rewritten to match what happened to run.

The comparison fingerprint excludes only the intended candidate build difference and incidental IDs/timestamps. Require the same suite, checks, integration profile, simulator settings, clock policy, evidence completeness, and runtime class. Unrelated differences yield an incompatibility explanation, not a regression verdict.

Metrics include a stable key, unit, aggregation, comparison direction, sample count, and owning check version. Keep task completion, interventions, fallback behavior, and task-output quality separate. The API computes the outcome from versioned rules and validated observations; the runner supplies observations and evidence, not an authoritative browser-visible PASS flag. A customer runner's observations are trusted input from that customer, not independent attestation of physical truth.

Default comparison eligibility requires both runs to be COMPLETED, required evidence to be available and verified, and an evaluation outcome of PASS or FAIL. Incomplete, canceled, errored, or inconclusive runs can be inspected side by side but receive no regression verdict. After raw evidence expires, historical summaries remain visible and explicitly evidence-expired; the comparison is descriptive only. Report total scheduled, completed, failed-check, inconclusive, canceled, and infrastructure-error trial counts. Fixed-seed repetitions must not produce an independence-based statistical confidence claim.

### 7.4 Minimum DTO field inventory

This inventory is the starting contract for UI fixtures and schema implementation. Fields listed as nullable must be present with null when absent. Additional fields require a deliberate contract update, not screen-local substitutes.

| DTO               | Required fields                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ContractMeta      | `supportedContractVersions`, `supportedProtocolVersions`, `schemaDigest`; public compatibility data only.                                                                                                                            |
| SessionView       | `user` and `csrfToken` only. This is an authenticated response; an unauthenticated request returns 401. P07 owns separate membership and organization/project discovery contracts.                                                   |
| RunSummary        | `id`, `projectId`, `buildId`, `suiteRevisionId`, `runnerId`, `executionState`, `evaluationOutcome`, `cancellationRequestedAt` nullable, `cancellationDeadlineAt` nullable, `createdAt`, `startedAt` nullable, `finishedAt` nullable. |
| RunDetail         | RunSummary fields plus `requestedManifest`, `attempts` with nullable-until-startup `observedManifest`, `trials`, `checks`, `artifactSummary`, `terminalReason` nullable, `serverEventCursor`.                                        |
| RunnerSummary     | `id`, `projectId`, `displayName`, `connectionState`, `capacityState`, `lastSeenAt` nullable, `contractVersion`, `protocolVersion`, `hostPlatform`, `capabilities`, `localProfiles`, `availableBuilds`, `diagnostics`.                |
| CapabilityView    | `key`, `version`, `supportLevel`, `verifiedAt` nullable, `verificationEvidenceId` nullable, `limitation` nullable.                                                                                                                   |
| BuildView         | `id`, `label`, `baseFlightStackRevision`, `sourceRevision`, `patchDigest` nullable, `artifactSha256`, `flightStack`, `flightStackVersion`, `executionTarget`, `configurationDigest`, `createdAt`.                                    |
| SuiteRevisionView | `id`, `suiteId`, `revision`, `status`, `digest`, `integrationProfileId`, `scenarios`, `checks`, `requiredCapabilities`, `evidencePolicy`, `createdAt`.                                                                               |
| TrialView         | `id`, `scenarioId`, `repetitionIndex`, `executionState`, `evaluationOutcome`, `startedAt` nullable, `finishedAt` nullable, `disturbanceVerification`, `observationSummary`, `checkResults`, `terminalReason` nullable.               |
| ArtifactView      | `id`, `attemptId`, `trialId` nullable, `kind`, `displayName`, `mediaType`, `byteLength`, `sha256`, `verificationState`, `expiresAt` nullable, `availability`. No server path or pre-authorized remote URL.                           |
| ComparisonView    | `baselineRunId`, `candidateRunId`, `eligibility`, `reasons`, `manifestDifferences`, `sampleCounts`, `metricComparisons`, `changedChecks`.                                                                                            |

Scenario definitions use an allowlisted `handlerId` and `handlerVersion`, bounded typed parameters, an event-based trigger, required capabilities, check references, and evidence requirements. They are data, never executable scripts or general expression strings.

An editable SuiteDraft uses the same authoring fields with explicit incomplete-field errors. SuiteRevisionView represents published, immutable content only; its status is always PUBLISHED. Publishing copies a valid draft into a new revision rather than changing an existing revision's state.

Built-in check types initially cover metric thresholds, time-bounded expected mode transitions, mission completion, landing/disarm observation, and disturbance verification. Each check has `id`, `version`, `kind`, typed configuration, units where relevant, required evidence kinds, and the condition under which it is inconclusive. A published revision cannot contain unresolved threshold or expected-mode placeholders. Pure evaluation rules have shared golden test cases; telemetry extraction stays in its owning adapter.

Comparison eligibility uses `ELIGIBLE`, `INCOMPATIBLE`, or `INCOMPLETE`, with stable reason codes and field-level differences. Numeric comparisons carry baseline/candidate values, units, direction, delta, and the relevant sample counts. Unknown or missing observations are represented explicitly, not coerced to zero.

### 7.5 Wire rules and validation ownership

| Rule                  | Contract requirement                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field names           | CamelCase JSON aliases are canonical on the wire. Python may use snake_case internally; requests do not silently accept an alternative field spelling.                          |
| Required and nullable | Required-nullable fields must be present with null. Optional means the key may be absent. Defaults must not erase meaningful missing/unknown observations.                      |
| Unknown values        | Reject extra JSON fields, unknown enum members, unknown command/event tags, and unsupported envelope versions. Do not silently strip them or substitute a default state.        |
| Primitive types       | JSON `3` and `"3"` are different. Avoid implicit string/number/boolean coercion; separately validate naturally textual URL/header/query parameters.                             |
| Bounds                | Bound strings, lists, batches, and numeric ranges; reject NaN/infinity and unsafe JSON integer ranges. Use named units such as `durationMs`, rather than an unlabelled `value`. |
| Large integers        | Microsecond counters such as `simulationTimeUs` are bounded decimal strings. Do not turn them into JavaScript numbers or mix them with wall-clock timestamps.                   |
| Time                  | Wall times use one documented UTC representation ending in Z. Keep the JSON string representation in the SDK; no automatic Date transformation.                                 |
| Variants              | Commands, events, observations, and check configurations use tagged/discriminated unions with explicit versions. Avoid unbounded dictionaries of arbitrary data.                |
| Evidence              | Metadata shape, byte limits, and hashes establish structure/integrity. They do not prove that a disturbance occurred or an observation is physically true.                      |

Prefer constraints that can be expressed in JSON Schema: literals/enums, strict object keys, ranges, patterns, array limits, and discriminated variants. Sharing schemas does not reproduce arbitrary Python custom validators in JavaScript. Authorization, state transitions, cross-record consistency, capability qualification, lease fencing, and evidence sufficiency remain authoritative application rules. UI form checks improve feedback; the backend repeats all required checks.

Pydantic's strict JSON and Python-object validation paths differ for some types. Test the actual FastAPI request path and runner decoder against exact JSON fixtures rather than assuming a single strict-mode flag creates equivalent behavior. Distinct request and response models are explicit when needed; generated input/output differences must not be collapsed by hand.

### 7.6 Runtime checks at each boundary

```text
 UI form
    | generated request validator; useful feedback
    v
 HTTP request -> FastAPI/Pydantic -> authz + domain rules -> transaction
                                                             |
                   response model validation <---------------+
                              |
                    generated SDK validation
                              v
                    TanStack Query cache -> UI

 API JSON <-> runner Pydantic models <-> adapter normalization <-> PX4/SDK
                                          units, frames, clocks
```

Enable the Hey API SDK's generated Zod runtime validation explicitly; generation of TypeScript types alone is insufficient, and SDK validation is not enabled by default. Use a pinned generator configuration for requests and responses. The HTTP wrapper must branch on the actual response status and validate the corresponding documented success or error envelope before returning data or throwing a typed error. Test this behavior because generated endpoint validators may cover a union of response shapes; an error body with a 2xx status must not become a successful cached resource.

Validation failures produce a typed `ContractValidationError`, a safe request ID, and an upgrade/retry explanation where appropriate. Do not log raw submitted bodies, credentials, or full telemetry merely because parsing failed. Expected API errors become typed `ApiError` values. Neither is retried as a transient network failure.

The runner validates every received manifest, command, policy, and response even though it imports the canonical package. The API validates runner event batches and finalization observations before applying domain rules. Adapters validate/normalize raw SDK values, units, coordinate frames, and clock identity before constructing canonical observations. Missing or invalid required observations become explicit errors or inconclusive checks, never zero values or PASS. Binary artifacts follow their own size/hash/content checks in section 13.

### 7.7 Generation and CI contract

The planned generation command imports a lightweight API factory to read route/model metadata without opening a database connection, contacting Google, starting a worker, or importing a simulator. Every route has an explicit stable `operationId`; renaming a Python function must not unexpectedly rename the SDK. Document success and error responses, including the custom validation error envelope.

The pinned `@hey-api/openapi-ts` configuration generates the Fetch SDK, TypeScript DTOs, Zod validators, and TanStack Query v5 options into `packages/contracts/typescript`. Generated files are never edited manually. Thin handwritten transport/query policy modules add session/CSRF headers, typed error handling, tenant cache scope, retries, and invalidation without duplicating schemas.

Required contract gates:

1. Export deterministic OpenAPI/event snapshots and regenerate the client from pinned tools/lockfiles. Record the build snapshot digest. With local outputs present, compare a fresh temporary generation against their bytes/file sets; report stale or missing outputs with a regeneration/setup instruction. Generated directories are ignored artifacts, so no Git-diff gate applies to them.
2. Validate OpenAPI and event schemas; reject unsupported generator constructs instead of replacing them with unchecked values.
3. Run one raw JSON valid/invalid fixture corpus through Python and generated TypeScript validators. Cover aliases, extra keys, required versus nullable, strict numeric types, safe ranges, timestamps, tagged unions, and versions.
4. Exercise real API request decoding and success/error serialization against the published contract. A fake fixture test alone cannot establish API conformance.
5. Compile representative SDK/Query usage and verify that invalid responses never reach the cache. Test status-specific success/error handling, tenant-safe keys, identity-change cleanup, and retry identity.
6. Test stream framing, cursor/gap recovery, and decoded event validation separately. OpenAPI generation does not implement these behaviors.

The bootstrap compatibility spike must prove the pinned generator preserves forbidden extra fields, discriminated unions, string formats/patterns, nullable-required fields, and numeric bounds. If it cannot, change the wire model or add a reviewed validation mechanism derived from the same schema. Do not maintain a second handwritten schema that can drift. MSW fixtures use generated output types and pass runtime validation from this pipeline.

### 7.8 Version negotiation and deployments

Keep three identifiers distinct: `/api/v1` is the HTTP major version; `contractVersion` identifies the pinned contract-package revision; `protocolVersion` identifies runner lifecycle semantics. A schema digest records generated-snapshot provenance. Existing envelope `schemaVersion` fields identify the payload variant within this negotiated contract.

`GET /api/v1/meta` exposes supported contract/protocol versions and the schema digest without secrets. The browser compares its compiled contract version before enabling mutations. JSON API requests other than this metadata handshake send `X-FLF-Contract-Version`; enrollment also declares the runner's protocol version. Validate compatibility before consuming the one-use enrollment grant, and enforce the negotiated versions before claims or attempt writes. Return `CONTRACT_VERSION_UNSUPPORTED` or `PROTOCOL_VERSION_UNSUPPORTED` with a safe upgrade explanation.

For MVP, pin one exact compatible contract revision and coordinate releases. Strict unknown-field/enum rejection means an additive change is not automatically compatible. Supporting a previous revision requires explicit adapters and compatibility tests. Drain active attempts before an incompatible deployment, or retain their negotiated protocol until terminal; never strand a runner by removing its contract mid-lease. The metadata endpoint remains readable for version diagnostics when the caller is incompatible.

## 8. HTTP and event contracts

The Python identity adapter owns `/api/auth/*`: Google login initiation, its fixed callback, and CSRF-protected POST logout. Application JSON endpoints use `/api/v1`. Runner endpoints use a distinct `/api/v1/runner` namespace and accept machine credentials only, except the scoped enrollment grant used for bootstrap.

Successful resource responses use `{ "data": ... }`. Lists add `meta.nextCursor`; events use a monotonically increasing server cursor. Errors use `{ "error": { "code", "message", "details", "requestId" } }`, with bounded field errors and no internal stack/configuration data.

Normalize FastAPI request-validation errors into the canonical `ErrorEnvelope`: well-formed JSON with invalid fields returns 422 / `VALIDATION_FAILED`; malformed JSON returns 400 / `INVALID_JSON`. Sanitize field paths/codes and omit raw input values and exception context. A response-model validation failure is a generic 500 with a request ID, not a client-facing 422. Document the custom 422 schema so the generated client does not retain FastAPI's default `HTTPValidationError` shape. Errors raised before JSON parsing, such as proxy limits or connection failures, are transport failures and must not be treated as valid resource JSON.

### 8.1 Browser-facing routes

| Method and route                                                                  | Contract / authorization                                                                                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/meta`                                                                | Public protocol/contract compatibility metadata only; no org or runtime secrets.                                                              |
| `GET /api/v1/session`                                                             | User identity and session-bound CSRF token only; no memberships, permission matrix or provider tokens.                                        |
| `GET /api/v1/orgs/:orgId/projects`                                                | Projects explicitly granted to the current organization member; organization membership alone exposes no project.                             |
| `POST /api/v1/orgs/:orgId/projects`                                               | Organization owner creates a project; the transaction explicitly grants the creator project membership.                                       |
| `GET /api/v1/projects/:projectId/builds`                                          | Immutable build registrations available to this project.                                                                                      |
| `POST /api/v1/projects/:projectId/builds`                                         | Project member registers metadata matching a runner's locally available approved build declaration.                                           |
| `GET /api/v1/projects/:projectId/settings`                                        | Current membership, build/baseline settings and effective retention; no role/permission matrix or secret values.                              |
| `GET /api/v1/projects/:projectId/run-options`                                     | Runner/profile/build selections and server-calculated eligible suites/reasons. Bounded query fields: `runnerId`, `localProfileId`, `buildId`. |
| `GET /api/v1/projects/:projectId/integration-profiles`                            | Supported compatibility profiles and capabilities.                                                                                            |
| `GET /api/v1/projects/:projectId/suites`                                          | Published immutable revisions; search/check filtering before cursor pagination.                                                               |
| `GET /api/v1/projects/:projectId/test-suites`                                     | Bounded editable draft summaries; published history uses the separate catalog.                                                                |
| `POST /api/v1/projects/:projectId/test-suites`                                    | Create a preset draft with an unselected profile, or open an exact published source; principal/project-scoped idempotency.                    |
| `GET /api/v1/projects/:projectId/test-suites/:suiteId/draft`                      | Editable draft content, saved draft version, next published revision and incomplete-field issues.                                             |
| `PATCH /api/v1/projects/:projectId/test-suites/:suiteId/draft`                    | Replace bounded draft content with `expectedDraftVersion`; reject stale edits without overwriting.                                            |
| `POST /api/v1/projects/:projectId/test-suites/:suiteId/draft/validate`            | Validate the saved expected version, canonical definition, exact profile and synthetic reference qualification without publication.           |
| `POST /api/v1/projects/:projectId/test-suites/:suiteId/revisions`                 | Publish the expected saved version atomically with optional reviewed-definition digest fencing; retry recovers the same immutable revision.   |
| `GET /api/v1/projects/:projectId/suite-revisions/:suiteRevisionId`                | Exact published immutable content; suite identities and all authoring access remain project-scoped.                                           |
| `GET/POST /api/v1/projects/:projectId/runs`                                       | Read runs / admit idempotent simulation job.                                                                                                  |
| `GET /api/v1/runs/:runId`                                                         | Run manifest, execution, outcome, trials, and checks.                                                                                         |
| `GET /api/v1/runs/:runId/events`                                                  | JSON event page by default; `Accept: text/event-stream` selects authenticated resumable SSE.                                                  |
| `POST /api/v1/runs/:runId/cancel`                                                 | Persist cancellation intent; idempotent.                                                                                                      |
| `GET /api/v1/runs/:runId/artifacts`                                               | Authorized artifact metadata, including pending/failed verification.                                                                          |
| `GET /api/v1/artifacts/:artifactId/content`                                       | Authorized attachment stream; no arbitrary path or URL lookup.                                                                                |
| `GET /api/v1/projects/:projectId/comparison?baselineRunId=...&candidateRunId=...` | Read-only derived comparison or explicit incompatibility reasons.                                                                             |
| `PUT /api/v1/projects/:projectId/baseline`                                        | Project member sets exact eligible run with revision precondition.                                                                            |
| `GET /api/v1/projects/:projectId/runners`                                         | Connectivity, capacity, local declarations, diagnostics.                                                                                      |
| `POST /api/v1/projects/:projectId/runner-enrollments`                             | Project member mints a short-lived enrollment grant after current organization/project membership checks.                                     |
| `POST /api/v1/runners/:runnerId/revoke`                                           | Project member revokes machine access and requests stop after current organization/project membership checks.                                 |

P07 owns organization and project discovery separately from SessionView. Organization-scoped operations require current organization membership. Every project-scoped operation requires both current organization membership and an explicit current project grant, including reads of runs, suites, runners and artifacts reached through their IDs. All nested IDs are resolved through that authorized tenant; a project ID in a URL or a DTO is not authorization. Use a consistent non-disclosing 404 policy for cross-tenant or ungranted resources. P07.5 adds one explicit organization owner for project creation and human membership administration. Project creation atomically adds only its creator's explicit grant. The owner manages saved email grants, exact-domain admission rules and explicit project grants; owner status alone grants no project-resource access.

Run creation example, showing a proposed wire contract only:

```json
{
  "schemaVersion": 1,
  "buildId": "build_candidate",
  "suiteRevisionId": "suite_revision_1",
  "runnerId": "runner_local_1",
  "localExecutionProfileDigest": "sha256:<approved-profile-digest>",
  "repetitions": 3
}
```

Browser `POST` mutations that can create work require `Idempotency-Key`. Persist the principal, route, key, canonical payload hash, and response for 24 hours. Same key/payload returns the original response; changed payload returns 409. Authorize every replay before returning it. Machine claim/lease/finalization retries follow section 10 instead of replaying stale authorization. Creation returns 201 with a Location header; asynchronous cancellation returns 202 until terminal; an incompatible test request returns 422; state/version conflicts return 409; rate limits return 429 with Retry-After.

Event pages accept `after` (opaque server cursor) and `limit`; SSE reconnect uses Last-Event-ID and the same ordering. An expired cursor returns 410 / `CURSOR_EXPIRED` in the canonical JSON ErrorEnvelope, including when rejecting a stream before it opens. The client then fetches RunDetail and resumes after its `serverEventCursor`; the snapshot and cursor must represent a consistent read. Do not return RunDetail under the event-page response type. The browser may poll RunDetail and JSON event pages when streaming is unavailable. Draft edits and baseline updates carry an expected revision; stale revisions return 409.

Use a small fetch-based SSE transport that sends the same-origin session cookie, contract-version header, Accept header, and reconnect cursor. It owns framing/reconnect only and imports generated event validators; it does not define its own event DTOs. The generated JSON SDK explicitly requests JSON event pages. Do not feed a streamed response into a JSON response validator or assume a native EventSource can attach custom request headers. Artifact binary streams likewise bypass JSON parsing while validating metadata and stream-specific limits.

### 8.2 Machine-facing routes

| Method and route                                       | Purpose                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/runner/enrollments`                      | Consume a scoped enrollment grant and register a runner-generated credential.                                   |
| `GET /api/v1/runner/me`                                | Recover identity and current settings after an interrupted enrollment.                                          |
| `POST /api/v1/runner/heartbeat`                        | Idle health, local profile/build declarations, diagnostic state.                                                |
| `POST /api/v1/runner/claims`                           | Idempotently claim one compatible queued run; 204 if none.                                                      |
| `POST /api/v1/runner/attempts/:attemptId/manifest`     | Verify and freeze actual execution inputs before mission commands.                                              |
| `POST /api/v1/runner/attempts/:attemptId/heartbeat`    | Renew current lease; return cancellation/revocation intent.                                                     |
| `POST /api/v1/runner/attempts/:attemptId/events`       | Submit contiguous typed event batches.                                                                          |
| `POST /api/v1/runner/attempts/:attemptId/artifacts`    | Declare allowed artifact type, byte length, SHA-256.                                                            |
| `PUT /api/v1/runner/artifacts/:artifactId/content`     | Bounded authenticated upload through the configured API origin.                                                 |
| `POST /api/v1/runner/attempts/:attemptId/finalization` | Declare final sequence, trial observations, cleanup, and evidence references.                                   |
| `POST /api/v1/runner/recovery`                         | After local cleanup/doctor checks, report recovery from NEEDS_CLEANUP; old execution evidence remains terminal. |

New attempt-bound writes include the current lease ID and fencing number. They are checked against runner/project identity and current lease ownership. The explicit idempotent terminal-receipt exception in section 10.4 permits no new writes. The machine principal cannot create users, alter a suite, set a baseline, or read another runner's jobs.

No browser or machine API accepts host shell commands, arbitrary working directories, simulator endpoints, unrestricted executable uploads, or remote artifact destinations for execution. The separately planned managed-build ingest is the sole bounded executable-input exception: supported SITL bundles only, private quarantine/validation/immutable publication, then disposable-guest execution. It is not implemented by runner enrollment or the existing evidence upload routes.

## 9. Authentication, authorization, and tokens

### 9.1 Browser identity

Use Authlib's FastAPI/Starlette client integration for Google OIDC with discovery, authorization-code flow, PKCE S256, state, and nonce. Configure exact callback and return URLs at the canonical origin. Authlib handles protocol validation; the identity module owns users, external identity mapping and sessions. P07 owns separate organization/project membership records. Match identities by issuer/subject rather than email. Account linking requires an explicit authenticated flow; email never links accounts. Under P07.5, an owner may explicitly configure saved email grants or exact-domain admission rules. These grant organization membership only after a successful verified provider login, including first-time account creation, without an acceptance step.

Use a server-side session layer compatible with Authlib's `request.session` expectations. The browser receives only a high-entropy opaque handle; the database stores its digest, user ID, expiry, revocation, and CSRF state. Short-lived browser-bound OIDC transaction state is consumed once. Rotate the application session after login and revoke it on logout. Default Starlette `SessionMiddleware` stores signed, readable cookie data; copying that example does not create these database-backed application sessions. Do not store provider tokens or user profiles in that cookie. Discard provider access/refresh tokens after login unless a later feature explicitly needs them.

Session cookies are HttpOnly, Secure outside explicitly configured loopback development, and SameSite=Lax to support sign-in redirects. Do not store auth bearer credentials in browser localStorage. Add session-bound CSRF protection and same-origin validation to all cookie-authenticated mutations, including logout. OAuth callbacks use their one-use state/nonce checks. Do not derive the public callback origin from an untrusted Host header. The auth adapter and session layer must be exercised together before claiming sign-in is implemented.

Phase ownership is explicit: **P06 is UI-only**, using approved sign-in/access presentation and clearly labeled fixtures without backend authentication or a live sign-in claim. **P06A owns the identity/session/CSRF backend**, canonical SessionView and auth endpoints, migrations, provider verification and safe process configuration on the real P05 foundation. **P06.5 is wiring-only**: it starts after verified P05 and P06 merges and actual auth endpoints are available, connects the approved UI to those endpoints and handles session/cache cleanup, and publishes only after the P06A backend merge. It does not add backend auth logic or bypass real-provider verification. **P07 owns membership and organization/project discovery** separately from SessionView.

P07 uses exactly two membership tables: OrganizationMembership and ProjectMembership. There are no human role enums, permission flags or permission matrix. P07.5 adds a single nullable owner user ID on each organization, constrained to an existing organization member. Existing organizations receive no inferred owner; an operator explicitly assigns an existing verified member before owner administration or project creation is enabled. Current organization membership and an explicit current project grant are both required for project access. An organization grant alone exposes no projects or project resources. Project members share the same scoped application actions. Apart from the explicit creator grant at project creation, project membership requires an explicit owner or operator change with an audit record. Human membership administration belongs to the owner; retention changes remain operator-managed.

Project grants are selective. Creating a project requires the current organization owner and atomically creates an explicit project grant for its creator; it does not grant other organization members access. An operator may explicitly grant or revoke membership for a verified identity. Revoking organization membership invalidates the user's prior project grants; adding that user back to the organization never restores them automatically. Project access requires a new explicit project grant. Recheck both memberships on every project request and within mutations; active event streams recheck periodically and terminate when access is removed.

No default privileged account, inferred ownership, implicit project joining or production auth bypass is permitted. P07.5 admission is opt-in per organization: the owner saves a normalized email or exact-domain rule, applied inside the verified-login transaction. Existing sessions are not auto-admitted by ordinary session reads. Rules never restore project grants. Removing a member deletes their saved grant and all project grants, and excludes both their email and stable user identity from future automatic joining; an explicit owner action may allow joining again without restoring old project access. Removing a domain rule stops future joining while preserving current memberships. UI fixtures may show signed-in state without adding a bypass route. The approved people-management presentation remains separate from live P06.5 UI wiring until the human authorizes that integration; retention editing remains deferred. An authenticated user without the required memberships sees an access-required state. Identity/session verification belongs to P06A; P06 UI approval or a passing fixture does not establish live authentication.

### 9.2 Token types

| Token                             | Scope and lifetime                                        | Storage / exposure                                                               |
| --------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Browser session                   | User identity; application-enforced expiry and revocation | Opaque HttpOnly cookie; DB stores digest/session state; never runner identity.   |
| CSRF token                        | Browser session and mutation protection                   | Browser memory; verified on custom cookie-auth mutations.                        |
| Enrollment token                  | One project, one enrollment; 10 minutes; one use          | Digest at server; show once; paste into runner prompt, not shell arguments.      |
| Runner credential                 | One runner/project; proposed 30-day expiry; revocable     | Runner generates 256 random bits; local secure storage; server digest/HMAC only. |
| Lease identifier + fencing number | One active execution attempt                              | Protocol metadata; not sufficient without runner authentication.                 |
| Future CI token                   | Deferred                                                  | Separate principal, scopes, and lifecycle; never reuse a runner secret.          |

Never put credentials in URLs, logs, fixtures, screenshots, run manifests, or artifact filenames. Production secret digests should use a server-side keyed hash with key identifiers so token verification and key rotation can be managed deliberately.

### 9.3 Enrollment flow

```text
Project member       Control plane                  Local runner
     | create grant       |                              |
     |------------------->|                              |
     | one-use token      |                              |
     |<-------------------|                              |
     | paste token into runner's interactive prompt ----->|
     |                    |        persist generated secret + request ID
     |                    |<-------- enroll(token, request ID, secret)
     |                    | transaction: consume grant, bind digest
     |                    |--------> runner ID + protocol settings
     |                    |<-------- authenticated runner heartbeat
```

The runner persists its candidate secret and registration request ID before the exchange. Identical retries recover the original registration; different data cannot reuse a consumed token. The server returns no second long-lived secret. A lost response can be recovered by retrying or authenticating `/runner/me` with the already saved credential.

Store credentials in an OS key store where available, otherwise an owner-only file outside the project with mode 0600 and a protected parent directory. MVP credential rotation requires current organization and explicit project membership for revocation and re-enrollment while the runner is idle; do not build a refresh-token service. Never overwrite an active runner's credential or local execution profile while it has a lease.

## 10. Queue, leases, event ordering, and cancellation

### 10.1 Admission and claim

Admission checks current organization and explicit project membership, published suite revision, build/profile compatibility, quotas, runner assignment, and supported capabilities. A queued run snapshots the immutable request. The runner checks its local allowlist and actual digests again before starting.

Run creation is permitted for an AVAILABLE or BUSY runner with a current verified matching declaration. STALE, OFFLINE, DISABLED, or NEEDS_CLEANUP targets are rejected with a specific runner-unavailable reason. A runner going offline after admission leaves its unclaimed work queued and visibly waiting; cancellation is always available. Apply a configurable per-project queued-run limit rather than accepting unlimited work.

Claiming occurs in a transaction that reserves both the run and runner, creates a RunAttempt, assigns a monotonically increasing fencing number, and records an expiry. Use serializable transactions/conditional updates and uniqueness constraints; handle concurrency conflicts explicitly. No two active attempts may own the same runner or run.

The runner persists a claim request ID before sending it. Lost responses are retried with the same ID; an acknowledged empty claim is followed by a new ID on the next poll. A repeated claim returns the same assignment identity with its current state and remaining lifetime, not a cached authorization to start an expired job. The local attempt journal prevents starting the same assignment twice.

After expiry, a claim replay returns LEASE_EXPIRED rather than a positive duration. A replay does not renew a lease. Only a current active heartbeat may renew it.

Proposed defaults: claim polling every 2 seconds while available with bounded backoff; idle heartbeat every 10 seconds; active heartbeat every 10 seconds; lease lifetime 60 seconds. These are versioned configuration values, not simulator timing settings.

Lease policy version 2 caps each attempt at five minutes from assignment. Queue wait is excluded; startup, execution and finalization share that budget. A heartbeat may renew for at most 60 seconds, bounded by the fixed five-minute deadline, credential expiry and any cancellation deadline. Replay never resets the deadline. At the cap, apply the existing `ERROR / LEASE_EXPIRED` and `NEEDS_CLEANUP` rules. The runner still applies its ten-second stopping margin. This bounds lease authority; physical process supervision remains required under section 10.2 and is not implemented by P13.

```text
Runner                API / database                  Attempt child
  | claim(request ID)      |                               |
  |----------------------->| atomic reserve + fencing       |
  |<-----------------------| manifest + lease               |
  | validate local profile |                               |
  | start supervised child ------------------------------->|
  | heartbeat + sequence   |                               |
  |----------------------->| renew only current live lease  |
  |<-----------------------| remaining lifetime / stop flag |
  | events + evidence      |<------------------------------|
  |----------------------->|                               |
  | finalization           |                               |
  |----------------------->| verify evidence; compute result|
```

### 10.2 Network loss and execution fencing

A lease is not proof a disconnected child process stopped. The runner maintains an independent supervisor and monotonic watchdog. Calculate the local deadline conservatively from request-dispatch time and the granted lease duration, with a 10-second stopping margin. Delayed responses must not extend a lease beyond that deadline. A heartbeat arriving after server expiry cannot revive an attempt.

On loss of renewal, revocation, or cancellation: stop scenario commands, terminate the owned simulation process group, wait for exit, preserve bounded diagnostic evidence, and report cleanup. No real aircraft is involved. If graceful shutdown fails, force termination of owned children only. Never kill unrelated PX4 processes by name.

Expired/lost attempts become ERROR with reason `LEASE_EXPIRED`. Do not automatically reassign or re-run a lost active job. A user-initiated rerun is a new Run, and the runner must pass local orphan cleanup before accepting work. Failed or unconfirmed cleanup changes capacity to NEEDS_CLEANUP.

Maintain a local exclusive runner lock plus per-attempt process records. A runner restart must resolve its previous execution before claiming another job. Server fencing rejects late writes even when an old process continues running. Do not claim exactly-once physical execution; use idempotent protocol delivery, fenced state changes, and bounded simulation side effects.

### 10.3 Events and persistence

Events have `schemaVersion`, `eventId`, `attemptId`, `sequence`, `type`, bounded typed payload, `wallTimeUtc`, `monotonicElapsedMs`, and `simulationTimeUs` when available. Use integer-safe serialization for microsecond values and enforce its wire representation in shared contracts. Server receipt time and event cursor are separate.

Define runner batches and browser SSE envelopes as distinct canonical Pydantic models referencing the same typed event variants. A browser `BrowserStreamMessage` is a tagged union: `RUN_EVENT` carries the server cursor and typed event; `STREAM_RESET` carries a stable reset reason. If an already-open stream cannot resume retained events, send a validated `STREAM_RESET` with reason `CURSOR_EXPIRED`, close the stream, and fetch/resume from a fresh RunDetail snapshot. This is a stream-control message, not a flight observation. The browser envelope does not accept runner-controlled authorization or ordering metadata as server truth. Export all variants explicitly. SSE heartbeat comments carry no domain payload. Unknown event versions or invalid payloads stop cache updates and trigger a snapshot/version diagnostic; they are not silently interpreted as a familiar event type.

Represent microsecond timestamps as decimal strings on the wire; use finite, bounded numbers for durations/metrics with explicit units. The initial event catalog includes `ATTEMPT_STARTING`, `TRIAL_STARTED`, `READINESS_OBSERVED`, `MISSION_STARTED`, `TRIGGER_OBSERVED`, `DISTURBANCE_REQUESTED`, `DISTURBANCE_CONFIRMED`, `OBSERVATION_RECORDED`, `TRIAL_FINISHED`, and `CLEANUP_FINISHED`. Event handlers validate allowed transitions; a runner cannot skip directly to a passing terminal state. High-rate telemetry belongs in bounded evidence files, with summary observations on the event stream.

The sequence is contiguous per attempt. Persist unique `(attemptId, sequence)`. Identical duplicates acknowledge the original event; conflicting payloads return 409; gaps return the expected sequence. The runner keeps a bounded durable spool and resumes from the acknowledged sequence. It must stop with `EVIDENCE_BUFFER_FULL` rather than silently drop required evidence when the spool is exhausted.

SSE streams server-owned events to the browser and supports Last-Event-ID reconnect. A stale view is labeled stale; it is not a successful run. Large ULogs/video do not travel over SSE.

### 10.4 Cancellation and finalization

- Canceling QUEUED work immediately marks it CANCELED.
- Canceling active work persists intent. The UI shows **Cancellation requested** until process exit and cleanup are confirmed.
- Persist a cancellation deadline, initially 30 seconds after acceptance. Heartbeats cannot extend execution past that deadline. At the deadline, an unconfirmed stop becomes ERROR/CANCELLATION_UNCONFIRMED and the runner becomes NEEDS_CLEANUP. Later cleanup reports are diagnostic/recovery evidence only; they cannot change the old run's outcome.
- Serialize cancellation and completion. Cancellation committed first prevents a later passing finalization; completion committed first preserves its terminal result.
- Missing stop confirmation becomes ERROR with `CANCELLATION_UNCONFIRMED`; do not display **Stopped** without evidence.
- Finalization is idempotent and includes final sequence, observations, evaluator/schema versions, artifact references, and cleanup status.
- A finalization response lost after commit can be recovered with the same operation ID and payload. The authenticated runner may receive that stored acknowledgment after the attempt becomes terminal; this grants no new lease or evidence-write rights. Revoked credentials remain rejected.
- Required events and verified artifacts must exist before accepting a passing result. Missing evidence leaves the outcome inconclusive or produces a defined infrastructure error, never PASS.
- Admission creates the expected trial matrix from scenario IDs and repetition indices. COMPLETED finalization requires exactly one result for every expected trial, no duplicate/unexpected IDs, `finalSequence` equal to the last acknowledged event sequence, same-attempt/trial artifact references, and confirmed child exit/cleanup. A partial set of passing trials cannot produce an aggregate PASS.
- For CANCELED/ERROR finalization, remaining unexecuted trials are explicitly SKIPPED with a reason and NOT_EVALUATED. Preserve every originally scheduled trial in the report. These rows do not silently disappear from sample counts.
- Assertion failures complete the test normally. Infrastructure failures retain trial observations but do not enter the completed-trial success-rate denominator unnoticed.

Stable error codes include `VALIDATION_FAILED`, `INVALID_JSON`, `CONTRACT_VERSION_UNSUPPORTED`, `PROTOCOL_VERSION_UNSUPPORTED`, `CURSOR_EXPIRED`, `CAPABILITY_UNSUPPORTED`, `PROFILE_MISMATCH`, `BUILD_UNAVAILABLE`, `LEASE_EXPIRED`, `STALE_ATTEMPT`, `SEQUENCE_GAP`, `IDEMPOTENCY_CONFLICT`, `ARTIFACT_INVALID`, and `CANCELLATION_UNCONFIRMED`. Keep code meanings canonical in the contracts package.

## 11. PX4-first integration

### 11.1 Pin the tested combination

The initial proposed compatibility profile is `px4-sih-quadx-v1`:

| Item                 | Proposed pin / qualification rule                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PX4                  | v1.17.0; tag resolves to commit `d6f12ad1c4f70ad3230afd7d86e971421e02fef4`; include recursive submodule revisions.                                                                                  |
| Simulation           | Built-in SIH physics running as software-in-the-loop on the host. No separate Gazebo, Pegasus, or GPU is needed for this first slice.                                                               |
| Vehicle              | `sihsim_quadx`; preserve and fingerprint its airframe and parameter configuration.                                                                                                                  |
| Speed                | 1x; record launch environment and effective timeout parameters.                                                                                                                                     |
| Runner host          | Qualify macOS 15+ Apple Silicon first; record whether PX4 is native ARM64 or runs through Rosetta. Ubuntu is a separate compatibility target. Do not mark either verified from build success alone. |
| Python SDK           | MAVSDK Python 4.1.0 is the proposed candidate; its Mac wheels require macOS 15+. Qualify the pinned wheel/hash and Python interpreter against the PX4 runtime before publishing the profile.        |
| Python orchestration | FeatherLaneFlight's own supervisor/scenario handlers. Pytest verifies adapters and end-to-end behavior.                                                                                             |
| Randomization        | Record actual simulator behavior. v1.17 SIH contains a fixed internal seed; repetitions are not independent varied-seed Monte Carlo samples.                                                        |

The upstream stable v1.17 integration-test documentation describes a different framework from current development-branch Python/pytest examples. Our Python runner is a proposed integration, not a claim that the stable release ships that same upstream test suite. See the [stable integration-test guide](https://docs.px4.io/v1.17/en/test_and_ci/integration_testing_mavsdk).

The PX4 pin identifies the qualified upstream base, not a requirement that all candidate executables be identical. A candidate may be an explicitly approved build derived from that base, with its exact source revision, patch digest, and artifact digest recorded. Initial release comparisons permit changes to the declared flight-software build while holding simulator physics, sensor implementation, startup configuration, and check definitions fixed. Changes to those environmental inputs require a new integration qualification and are incompatible with the default regression comparison. Initial unmodified-base repeats qualify the infrastructure; they are not evidence of a new release improving behavior.

The [stable macOS setup](https://docs.px4.io/v1.17/en/dev_setup/dev_env_mac) also differs from the newer development-branch native setup. Resolve the actual toolchain/architecture combination during qualification. MAVSDK 4.1 calls a bundled native library directly; do not add a `mavsdk_server`/gRPC process from older Python examples. A mixed-architecture PX4 process and Python process can communicate over MAVLink, but each process's own native dependencies must be compatible.

The documented manual launch shape is:

```text
make px4_sitl sihsim_quadx
```

This is a reference for later setup, not a command executed by this specification. See [PX4 v1.17 SIH](https://docs.px4.io/v1.17/en/sim_sih/). The runner will use a prebuilt, fingerprinted executable and a locally approved structured launch profile; the browser cannot submit a make target or shell command.

### 11.2 Local connection topology

```text
Scenario handler
      |
      v
MAVSDK Python client ----- loopback MAVLink -----> PX4 SITL process
      ^                                                |
      |                                                v
      +------ telemetry / mode / mission progress -- SIH physics
                                                       |
                                       ULog + simulation ground truth
                                                       |
                                  per-attempt evidence output directory
```

Use a dedicated loopback endpoint; port 14540 is a candidate default to verify during qualification. Reserve the endpoint before launch and fail if occupied. The profile must verify the expected system/component and the child process it launched. Never auto-discover arbitrary vehicles, connect to a non-loopback address, or open a serial port. A single-host lock prevents two runner instances sharing the endpoint.

Audit every socket opened by the pinned PX4 startup, including its default GCS and SIH visualizer links. Disable unused links or configure and verify loopback-only bind/destination addresses. Binding the MAVSDK client to loopback alone does not establish isolation. Capture this check in the local qualification report and reject an unexpected link.

The MVP scenario handler is the sole writer of mission commands. Later customer-autonomy profiles must identify the command owner; do not let the test driver and customer application send competing mission/offboard commands.

### 11.3 Baseline smoke scenario

Qualification must first demonstrate a nominal simulation sequence: start isolated PX4, establish fresh telemetry and expected identity, apply the approved parameter configuration, wait for readiness, execute a short takeoff/land or mission sequence, observe landing and disarm, stop the owned process, and collect evidence.

The suite defines time limits and expected observations before running the candidate. Readiness checks have bounded timeouts. A timeout while waiting for a behavior can be a failed requirement when telemetry is healthy; a broken connection or missing required evidence is an infrastructure/inconclusive result.

SIH has no rendered camera scene in this profile. Do not present visual perception, obstacle detection, image-quality scoring, or realistic collision coverage as supported capabilities.

### 11.4 First disturbance: simulated GNSS fix loss

Use the pinned SIH sensor implementation rather than assuming the generic `failure gps off` command works in this environment. In v1.17, `SIM_GPS_USED` is an integer parameter; setting it to 0 makes the simulated GNSS report fix type 0 and zero satellites. The default value is 10. This is **simulated GNSS fix loss**, not a model of every real GNSS failure. See the [pinned sensor implementation](https://github.com/PX4/PX4-Autopilot/blob/v1.17.0/src/modules/simulation/sensor_gps_sim/SensorGpsSim.cpp) and [parameter declaration](https://github.com/PX4/PX4-Autopilot/blob/v1.17.0/src/modules/simulation/sensor_gps_sim/parameters.c).

Required event sequence:

```text
Fresh healthy GNSS observed
          |
Scenario trigger observed
          |
Disturbance requested: SIM_GPS_USED = 0
          |
Parameter accepted/read back       <- command evidence only
          |
Fresh fix-type-0 / zero-satellite observations
          |                        <- disturbance confirmed
Observe configured response and evaluate time-bounded checks
          |
Reset through fresh process / parameter state before next trial
```

With MAVSDK 4.1, numeric fix type 0 is named `NO_GPS`; do not confuse it with numeric 1 (`NO_FIX`). Its convenience GPS-info and raw-GPS callbacks do not expose all required fields in one timestamped sample. Confirm effect from one coherent GPS_RAW_INT observation through a qualified MavlinkDirect path, or from a timestamped ULog `sensor_gps` sample containing the fix and satellite fields. Independent callbacks alone are insufficient proof. If verification is deferred until ULog closure, live status remains provisional and only final evidence can mark the disturbance verified. Failure to observe the requested effect is an invalid disturbance/test infrastructure result, not proof that the aircraft handled it correctly.

Start by verifying the disturbance on an unarmed simulation. An airborne scenario is admitted only after its position-loss settings, expected mode transition, timing window, and cleanup behavior are documented and qualified. Do not assume Return-to-Launch remains possible after losing positioning, or derive the expected response from whatever the candidate happened to do.

Only a verified capability/profile revision may be offered as runnable in the real UI. Fixture examples remain clearly marked as demo data until qualification exists.

### 11.5 Evidence and clocks

- Record wall-clock time for audit, monotonic time for watchdogs, and PX4/simulation time for behavior assertions. Do not mix these units in latency calculations.
- Record boot/session identity and handle timestamp resets by starting a new trial or rejecting the trace; never join different boots as one continuous flight.
- Keep 1x speed initially. PX4 launch behavior can adjust failsafe timeout parameters when a speed factor is provided, so changing speed requires a new qualified profile and comparison fingerprint.
- Collect PX4 ULog, redacted process output, normalized observation/check events, parameter/configuration digest, and a run manifest.
- SIH publishes ground-truth position/attitude topics. Use explicitly identified ground-truth fields for simulator-truth checks; distinguish them from estimator outputs, especially after GNSS loss. Verify the pinned logging profile contains required topics at adequate frequency.
- The default logging interval for some GPS data is about one second in the pinned source. Evidence windows must accommodate the configured rate or explicitly change and version the logging profile.
- No first-profile metric claims physical collision avoidance or real-world safety. Repeated fixed-seed trials measure repeatability and regressions in this setup, not broad environmental generalization.

## 12. Adding a customer autonomy application or another stack

The shared engine should not import PX4-specific command code. Add implementations behind focused runner interfaces:

| Interface         | Contract                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| ExecutionHost     | Resolve approved local profile, start/stop owned processes, verify cleanup.                                 |
| FlightStack       | Identify system, inspect readiness, apply supported configuration/commands, stream normalized observations. |
| SimulationWorld   | Reset world, expose clock/truth, configure supported sensors/environment.                                   |
| Disturbance       | Declare support, apply/clear supported change, verify its observed effect.                                  |
| EvidenceCollector | Persist normalized events and allowed artifacts with integrity metadata.                                    |

Before adding an integration, define its observation/action formats, units and coordinate frames, command ownership, clock behavior, reset semantics, disturbance support, required evidence, and platform dependencies. A model file without its preprocessing and command interpretation is insufficient.

A customer application may later run as a locally approved process or digest-pinned container. Register a new local profile; the control plane still sends profile IDs and bounded scenario data, never arbitrary commands or image URLs. A compatible container does not remove CPU architecture, GPU, sensor, or simulator dependencies.

ArduPilot needs its own verified adapter even where MAVLink messages are shared. A vendor SDK integration exposes only the capabilities actually available; mark unsupported paths explicitly. Log import/replay is a separate execution mode and cannot claim closed-loop navigation evaluation.

## 13. Artifact handling, privacy, and operational diagnostics

Artifacts come only from a dedicated per-attempt output directory and an explicit local upload policy. Reject symlinks, traversal, non-regular files, and paths supplied by the API. No general filesystem browser or remote fetch proxy exists.

Proposed initial bounds: 1 MiB JSON bodies, event batches of at most 100 events and 256 KiB, 100 MiB per artifact, 500 MiB per run, and a bounded 500 MiB local spool. Requests above these limits fail explicitly. Make limits versioned configuration shared through runner policy, with tighter per-type caps where appropriate.

API-mediated uploads validate declared size and SHA-256 before marking an artifact VERIFIED. Generate storage keys server-side and never treat a client filename as a path. Finalization waits for required evidence; retrying an upload cannot overwrite another run's artifact. Serve authorized downloads as attachments with content sniffing disabled. Do not render uploaded HTML/SVG or execute uploaded content.

Write uploads to temporary private storage, enforce size/quota incrementally, and hash the complete stream. Recheck active attempt/lease ownership at verification commit, then atomically publish the immutable verified object and metadata. A disconnect or failed verification leaves no readable partial artifact. An identical retry recovers the existing verified object/receipt; changed bytes or declarations conflict. No verified object can be overwritten, even by its original runner. Terminal receipt recovery permits no new upload mutation.

The first version uploads no video by default, no model weights, no source archives, and no complete environment/configuration dumps. ULogs can contain locations and operational details; describe their upload in onboarding and allow a local-only artifact policy. A suite requiring evidence disallowed by policy must be rejected before running. Do not label a local-only artifact as cloud-verified.

Proposed hosted retention is 30 days for raw artifacts and 90 days for results/events, operator-configured for each project in the first version. Expired artifacts remain visibly unavailable; comparisons disclose missing evidence. Coordinate deletion across database metadata and storage, with retryable cleanup and an audit event.

Structured diagnostics contain request/project/run/attempt IDs, stage, adapter version, safe error codes, timing, sequence progress, disturbance confirmation, and cleanup outcome. Never log credentials, raw environment variables, unrestricted process output, or raw imagery to ordinary logs. Redaction is applied before upload; diagnostic logs are not a guarantee of complete root-cause analysis.

## 14. Local setup and deployment plan

### 14.1 Development layout

```text
Mac development machine
  Browser -> Vite :5173 -> /api proxy -> FastAPI :8000
                                          |
                                  PostgreSQL + private local artifact directory

  Python runner -> HTTP loopback API (development only)
       |
       `-> pinned PX4 SITL + SIH (qualified runtime architecture)
```

Loopback HTTP is a deliberate development exception; hosted/control-plane connections require HTTPS. The runner refuses insecure non-loopback origins. Production uses a configured canonical origin and trusted proxy settings.

Hosted delivery supports both paths: web/API/database/private storage plus trusted managed controllers and disposable execution guests on our infrastructure by default; customer runners remain near their locally approved software as an explicit option. The first managed target is a proposed pinned Linux CPU PX4/SIH environment, subject to actual qualification. GPU/rendered simulators are separate scope; do not assume Docker on a Mac satisfies NVIDIA requirements. The [deployment proposal](plans/execution-hosting.md#deployment-proposal) defines staged local, staging and capped private-pilot gates; no provisioning is authorized by this specification.

### 14.2 Future setup sequence

1. Bootstrap pnpm and uv workspaces, pin Node/pnpm/Python/tool versions, and define package ownership.
2. Establish canonical Pydantic contracts, metadata-only API route declarations, generated browser client, and minimal fixtures. After `pnpm install --frozen-lockfile`, `pnpm setup:workspace` installs frozen uv dependencies and generates ignored contract outputs. `pnpm typecheck` and `pnpm build` regenerate explicitly before compiling; future development/deployment builds must generate before consuming contracts. No live backend is needed for this export.
3. Show a rendered foundation preview and obtain explicit user approval before implementing the MUI theme/component defaults and shared layouts. Preview each feature scope and obtain approval before building its screens against validated mocks.
4. Establish the P05 persistence/private-storage foundation and the P06A identity/session/CSRF backend. P06 remains UI-only; P06.5 wires that approved UI after verified P05/P06 merges and actual auth endpoints are available. Publish the wiring only after the auth backend is merged.
5. Add the runner protocol using a fake adapter, exercising leases, cancellation, events, and artifacts before PX4.
6. Prepare the pinned PX4 checkout/build using its version-specific setup guide; qualify SDK and telemetry compatibility on the intended host.
7. Implement the nominal SIH scenario, then verify GNSS disturbance and any admitted airborne response checks.
8. Replace mock transport with the real API; demonstrate the same UI states and evidence chain.

The current foundation commands are `pnpm setup:workspace`, `pnpm contracts:generate`, `pnpm contracts:check`, `pnpm typecheck`, and `pnpm build`. Setup follows frozen pnpm installation; check requires local generated outputs. Other application commands below remain proposed:

| Future command                                                                                                 | Purpose                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm dev:web:mock`                                                                                            | UI with MSW; no database, identity provider, or PX4 required.                                   |
| `pnpm dev:web`                                                                                                 | Web with same-origin proxy to the local Python API.                                             |
| `uv run --package featherlane-control-plane flf-api` / `uv run --package featherlane-control-plane flf-worker` | Separate API and control-plane worker entry points.                                             |
| `pnpm contracts:generate` / `pnpm contracts:check`                                                             | Export Python/OpenAPI schemas, generate TS SDK/validators/Query options, and detect drift.      |
| `uv run --package featherlane-control-plane alembic -c src/api/alembic.ini upgrade head`                       | Apply reviewed local development migrations.                                                    |
| `uv run --package featherlane-runner flf-runner doctor`                                                        | Validate local configuration, dependencies, endpoints, and profiles without launching aircraft. |
| `uv run --package featherlane-runner flf-runner enroll`                                                        | Interactive enrollment; no secret CLI arguments.                                                |
| `uv run --package featherlane-runner flf-runner start`                                                         | Supervised outbound-polling simulation runner.                                                  |
| `uv run --package featherlane-runner pytest src/runner/tests`                                                  | Runner unit/contract/adapter tests with explicit markers for real SITL.                         |

The UI, runnable API/worker, migration, and runner commands in this table do not exist yet. Simulator setup and later production release procedures belong in README when implemented; do not publish copy/paste setup claims until they have been exercised.

### 14.3 Configuration boundaries

| Process     | Configuration categories                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Web         | Relative API base, fixture mode in development, public display settings. No secrets or runner endpoints.                        |
| API/worker  | Validated database URL, canonical public origin, auth/OIDC secrets, token-hash key, storage settings, quotas/retention.         |
| Runner      | Control-plane origin, secure credential reference, approved profiles/builds, artifact policy, spool directory, watchdog limits. |
| PX4 attempt | Explicit allowlisted launch/configuration values from the qualified local profile. No inherited cloud credentials.              |

Use per-process validated configuration modules, with Pydantic Settings for the Python API/worker/runner, and redact validation failures. Separate test fixtures from private development state. Do not modify the user's global shell, Docker, cloud, or credential configuration automatically.

SQLAlchemy mappings remain internal to persistence adapters. Use one AsyncSession per request/task; do not share it across concurrent operations. Preserve bounded, atomic claim/lease/fencing/finalization transactions and their audit writes. Alembic autogeneration produces migration candidates for review; it does not authorize applying destructive production changes.

## 15. Implementation order and acceptance gates

The stages below are broad milestones. Use [DeliveryPlan.md](DeliveryPlan.md) for the original small-to-medium phases P01-P24 plus the bounded P06A and P06.5 follow-ups, completion criteria, and shipment checkpoints. The current documentation, tokens, and installed skill are the completed planning baseline; application phases remain pending. The delivery plan preserves each UI task's rendered-preview/explicit-approval gate and the user's automated-test ownership.

| Stage               | Deliverable                                                                                                                             | Acceptance gate                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0: Vocabulary       | Pydantic states/DTOs, stable HTTP metadata, generated SDK/validators/Query options, fixture catalog                                     | Python/TS wire examples agree; generator preserves constraints; no ambiguous success/error states.                                                              |
| 1: UI foundation    | Approved MUI adapter for existing tokens, component defaults, design reference, application shell, page layouts, shared status patterns | Rendered foundation preview explicitly approved before application implementation; then manual review of layout, keyboard/focus/contrast, controls, and states. |
| 2: UI workflows     | Onboarding, runs, suite revision, runner setup, detail, comparison                                                                      | Each UI task's rendered preview approved before its implementation; MSW uses eventual routes and relevant behavior is manually verified.                        |
| 3: Auth and backend | Same-origin identity, explicit organization/project membership, persistence, run admission                                              | Separate backend and wiring verification; membership isolation, CSRF, revocation, immutable snapshots, idempotency, no production bypass.                       |
| 4: Fake runner      | Enrollment, claim, lease/watchdog, events, uploads, cancellation                                                                        | Partition/restart/stale writer tests; missing evidence never passes; cleanup ownership proven.                                                                  |
| 5: PX4 profile      | Pinned SIH runtime, nominal flight and verified GNSS disturbance                                                                        | Host-specific compatibility report and evidence; unsupported assumptions removed.                                                                               |
| 6: Real end-to-end  | UI starts local simulation and compares two compatible runs                                                                             | Traceable build -> scenario -> verified disturbance -> check -> artifact -> comparison.                                                                         |

UI work proceeds first, but stage 0's small contract vocabulary must exist before screen fixtures. Follow the design sequence in DESIGN.md: theme -> component defaults -> shell/layouts -> shared product patterns -> feature pages. Use fake transport/adapters to separate interface work from simulator readiness; do not simulate backend success inside production components. Agents follow AGENTS.md for manual verification and test ownership; future automated-test requirements below do not authorize agent-written tests.

## 16. Required verification before an implemented handoff

No application tests are run as part of this specification-only task. The implementation must add and run meaningful checks for:

1. **Contracts:** deterministic exports and generated-code drift; shared valid/invalid JSON parity; real API request/response/error conformance; strict fields/types, units, required-nullable differences, tagged unions, and version negotiation. Confirm custom 422 envelopes and safe generic 500 responses.
2. **UI:** pending/error/empty states, preserved form input, accessible keyboard flow, cancellation intent, stale data, incompatible comparisons, and status meaning independent of color. Invalid JSON never enters Query caches; caches are tenant-scoped and cleared on identity changes; mutation retries preserve operation identity; SSE gaps recover through snapshots.
3. **Authorization:** enforce current organization membership plus an explicit current project grant on every project resource and artifact. Organization membership alone grants no project access. Revocation takes effect on requests/streams; rejoining an organization does not restore old project grants. Verify owner-only creation, explicit creator grants, configured admission rules and owner/operator membership changes. Browser cookies cannot authenticate machine endpoints; runner revocation remains effective.
4. **Enrollment:** expired/reused grants fail; response loss recovers the same runner; plaintext secrets do not enter logs or browser storage.
5. **Scheduling:** concurrent claims cannot double-assign; stale fencing cannot write; late heartbeat cannot revive; no automatic execution retry after lost lease.
6. **Runner lifecycle:** network partitions trigger local stop; orphan cleanup precedes restart; cancellation/completion races follow commit order; failed cleanup is visible.
7. **Evidence:** duplicate/gapped/conflicting events; corrupt/truncated/oversized artifacts; missing required topics; policy-blocked uploads; no false passing finalization.
8. **PX4:** correct build/identity, nominal mission observations, actual GNSS disturbance confirmation, reset isolation, timebase handling, required ULog fields, and owned-process cleanup.
9. **Comparison:** matched manifests and metric definitions; incomplete sample counts; no false independence claims for fixed-seed trials; incompatible runs withheld from regression verdicts.
10. **Project checks:** lint, format, strict typing, unit tests, API/database integration tests, runner tests, UI end-to-end tests, dependency audits, and real-SITL acceptance tests where required. A clean mock run is not a substitute for the real integration gate.

## 17. Decisions to close during the compatibility spike

These items block claiming the real PX4 integration is supported; they do not block contract-driven UI work:

- Verify the PX4 tag/commit, submodules, native build toolchain, MAVSDK 4.1.0 behavior, Python version, and loopback endpoint together on the chosen host.
- Freeze the initial airframe/parameter/logging profile and nominal mission acceptance windows.
- Confirm the GNSS effect in fresh live telemetry and ULog. Select and review the expected airborne response from the configuration before admitting that scenario.
- Confirm which raw SIH ground-truth/logging fields are available at the chosen sample rates; do not invent unsupported collision/perception metrics.
- Resolve exact Pydantic/FastAPI/Hey API/Zod/Query versions; prove request/response/error/event validation and shared-fixture parity before treating the generated SDK as qualified.
- Qualify Authlib OIDC with the server-side session layer, CSRF, callback handling, session rotation, and revocation.
- Select the initial artifact budget/retention and identity provider deployment configuration with the first design partner.

When closing an item, update the corresponding profile/contracts and this document. No undeclared runtime fallback to a different PX4 version, simulator, speed factor, or fault mechanism is allowed.

## 18. Source references and evidence boundary

The application architecture, route names, membership model, token lifetimes, limits, and implementation order are project decisions for FeatherLaneFlight. They are not descriptions of an existing product or requirements imposed by the upstream tools.

- [PX4 v1.17 SIH](https://docs.px4.io/v1.17/en/sim_sih/) — version-specific simulation target and launch reference.
- [PX4 v1.17 MAVSDK integration tests](https://docs.px4.io/v1.17/en/test_and_ci/integration_testing_mavsdk) — stable upstream test framework; distinguish it from development-branch examples.
- [PX4 v1.17.0 release](https://github.com/PX4/PX4-Autopilot/releases/tag/v1.17.0) — source pin to verify during setup.
- [Pinned simulated GNSS implementation](https://github.com/PX4/PX4-Autopilot/blob/v1.17.0/src/modules/simulation/sensor_gps_sim/SensorGpsSim.cpp) and [parameters](https://github.com/PX4/PX4-Autopilot/blob/v1.17.0/src/modules/simulation/sensor_gps_sim/parameters.c) — basis for the first proposed disturbance.
- [Pinned SIH implementation](https://github.com/PX4/PX4-Autopilot/blob/v1.17.0/src/modules/simulation/simulator_sih/sih.cpp) — verify clock, randomization, and ground-truth assumptions against source.
- [Pinned logging topics](https://github.com/PX4/PX4-Autopilot/blob/v1.17.0/src/modules/logger/logged_topics.cpp) and [ULog format](https://docs.px4.io/v1.17/en/dev_log/ulog_file_format) — evidence fields and self-describing log schemas.
- [MAVSDK Python 4.1.0 package](https://pypi.org/project/mavsdk/4.1.0/) — candidate package/platform pin to verify during qualification.
- [MAVSDK Python quickstart](https://mavsdk.mavlink.io/main/en/python/quickstart.html) — current SDK installation/API direction; pin and validate the selected version.
- [PX4 macOS development environment](https://docs.px4.io/main/en/dev_setup/dev_env_mac) — current host setup guidance; version-check against the pinned source.
- [FastAPI SDK generation](https://fastapi.tiangolo.com/advanced/generate-clients/) — OpenAPI export and generated TypeScript client workflow.
- [Pydantic JSON Schema](https://docs.pydantic.dev/latest/concepts/json_schema/) and [strict-mode semantics](https://docs.pydantic.dev/latest/concepts/strict_mode/) — canonical wire-model exports and JSON/Python validation differences.
- [Hey API SDK](https://heyapi.dev/docs/openapi/typescript/plugins/sdk), [Zod runtime validation](https://heyapi.dev/docs/openapi/typescript/plugins/zod), and [TanStack Query generation](https://heyapi.dev/docs/openapi/typescript/plugins/tanstack-query) — candidate generation pipeline; runtime validation must be enabled and qualified.
- [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys), and [useQuery/select behavior](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) — cache/retry policy and validation before caching.
- [FastAPI error handling](https://fastapi.tiangolo.com/tutorial/handling-errors/) — normalize request-validation errors into the published application envelope.
- [Authlib FastAPI integration](https://docs.authlib.org/en/latest/oauth2/client/web/fastapi.html), [OIDC/Starlette integration](https://docs.authlib.org/en/latest/oauth2/client/web/starlette.html), and [Starlette session storage](https://starlette.dev/middleware/#sessionmiddleware) — protocol integration and distinction between cookie data and server-side application sessions.
- [SQLAlchemy async sessions](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#using-asyncsession-with-concurrent-tasks) and [Alembic autogeneration](https://alembic.sqlalchemy.org/en/latest/autogenerate.html) — transaction/session ownership and migration review.
- [Node.js release schedule](https://github.com/nodejs/Release) — frontend tooling runtime only; pin a supported patched version during bootstrap.
- [Material UI overview](https://mui.com/material-ui/getting-started/) and [installation](https://mui.com/material-ui/getting-started/installation/) — prebuilt component foundation and supported default styling dependencies.
- [MUI theming](https://mui.com/material-ui/customization/theming/) and [themed component defaults](https://mui.com/material-ui/customization/theme-components/) — one theme for tokens, CSS variables, and repeated component decisions.
- [MUI Table](https://mui.com/material-ui/react-table/), [responsive drawers](https://mui.com/material-ui/react-drawer/), and [MUI X licensing](https://mui.com/x/introduction/licensing/) — initial table/navigation primitives and limits of the free versus commercial packages.
