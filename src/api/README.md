# Control-plane foundation

P05 provides the runnable FastAPI service, validated process configuration,
PostgreSQL sessions/migrations, safe HTTP errors and a private storage port.
P06A adds the authentication endpoints described below alongside `GET /api/v1/meta`.
Runs and other business declarations in
`featherlane_api.openapi.schema.create_schema_app()` are for offline client generation;
they are never mounted in the runtime application. Memberships, business operations, the worker, artifact uploads and storage
adapters belong to their later phases. A real Google callback and reauthentication
were verified against the direct local API at `http://127.0.0.1:8008`, including
actual session read, handle rotation, CSRF rejection and API logout/revocation.
P06.5 browser controls/proxy wiring, HTTPS deployment and deliberate invalid-token
negative cases remain outside that qualification. An unconfigured provider returns
a safe 503.

## Backend architecture

The control plane is a domain-oriented modular monolith. Its API and future
worker share application modules and PostgreSQL; the customer execution runner
remains a separate process. The implemented foundation is organized as follows:

```text
featherlane_api/
├── app.py                     composition root and lifespan
├── cli.py                     API process entry point
├── config.py                  Doppler-injected settings
├── http/
│   ├── dependencies.py        request-local session integration
│   ├── errors.py              canonical HTTP errors
│   ├── meta.py                public compatibility route
│   └── middleware.py          request ID, version and JSON boundary
├── infrastructure/
│   └── database.py            SQLAlchemy resources; no FastAPI imports
├── openapi/
│   ├── schema.py              offline contract declarations
│   └── export.py              deterministic export entry point
└── modules/
    └── evidence/
        └── ports.py           existing private artifact-storage boundary
```

P06A implements `modules/identity/` with application use cases, internal ORM
mappings, Authlib adapter, HTTP routes and shared auth dependencies. P06 is UI-only. P07 introduces
`modules/access/` once its actual authentication dependency is ready. Later phases
introduce runners, catalog, execution and evaluation modules as their real work
arrives. Do not create empty feature modules or placeholder business routes.

Within a substantive business module, `http.py` handles transport,
`application.py` coordinates use cases and transaction decisions, `domain.py`
holds business invariants, `ports.py` describes actual external capabilities,
and `persistence.py` implements database mappings/queries. Create only the files
needed by that feature, splitting cohesive workflows into packages as they grow.

Domain rules import no FastAPI, SQLAlchemy or provider SDK types. Application
use cases accept no HTTP Request/Response objects and call small explicit ports
where an integration needs a boundary. Persistence adapters own SQL/locking
mechanics; application use cases own atomic commit decisions. Add a small unit
of work port when an actual use case requires it, preserving the transaction
guarantees below. Avoid a generic repository framework or mirrored DTO hierarchy.

Keep canonical wire DTOs/enums in `packages/contracts/python`; HTTP adapters map
business outcomes into those envelopes. Domain failures describe business meaning;
HTTP adapters choose safe status/code responses. Cross-module calls use explicit
application capabilities rather than another module's ORM rows. Identity owns
sessions/Principal/CSRF; access owns real organization/project membership projection. P07 uses two
explicit membership tables; organization membership alone grants no project access.
The composition root wires adapters and routers. Both HTTP and the future worker
use the same application logic.

Offline generation uses `python -m featherlane_api.openapi.export`; the workspace
generation script invokes this entry point. Retired flat modules are removed,
so downstream phases must use the concrete import paths below.

## Local database and API setup

Run commands from this worktree's root. Use its own `.venv`, `node_modules`,
database and ports. Install with `pnpm install --frozen-lockfile` and
`uv sync --all-packages --frozen`.

Use Doppler to inject these variables into each process. Select the appropriate
Doppler project/config for this phase before running the commands below. Do not
download secrets into a local `.env` file. The settings loader reads process
environment variables and does not implicitly load dotenv files.

`src/api/migrations/env.py` is Alembic's migration bootstrap module, not an
environment-variable file. It loads database settings from the injected process
environment and runs the reviewed revisions; it contains no secret values.

| Variable                     | Meaning                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `FLF_API_DATABASE_URL`       | `postgresql+asyncpg://flf:<password>@127.0.0.1:55405/featherlane_p05`; percent-encode password characters when necessary.             |
| `FLF_API_CANONICAL_ORIGIN`   | Browser-facing origin; use `http://127.0.0.1:8005` for direct local API inspection. HTTP is permitted only on loopback.               |
| `FLF_API_ARTIFACT_ROOT`      | Absolute private artifact-directory path within this worktree's ignored `.local/p05/`. No storage adapter or public mount is created. |
| `FLF_API_PORT`               | Defaults to `8005`; backend consumers use separately assigned ports.                                                                  |
| `FLF_API_HOST`               | Defaults to `127.0.0.1`.                                                                                                              |
| `FLF_API_DATABASE_POOL_SIZE` | Defaults to `5`, maximum `20`; overflow is disabled.                                                                                  |
| `FLF_API_MAX_JSON_BYTES`     | Defaults to `1048576` (1 MiB); may be reduced.                                                                                        |
| `FLF_API_MAX_JSON_DEPTH`     | Defaults to `32`, maximum `64`.                                                                                                       |

`infra/compose.database.yaml` runs one PostgreSQL 18.4 service with loopback-only
port publication. Supply all six variables in the Compose process; there are no
shared instance defaults or fixed container names:

| Variable               | Meaning                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME` | Unique Compose project identity, such as `featherlane-p05`.                                       |
| `FLF_DB_USER`          | PostgreSQL initialization user, such as `flf`.                                                    |
| `FLF_DB_NAME`          | PostgreSQL initialization database, such as `featherlane_p05`.                                    |
| `FLF_DB_PASSWORD`      | Private password injected into the process; never save it in a file or put it in a command.       |
| `FLF_DB_HOST_PORT`     | Unique host port; the host address is fixed to `127.0.0.1`.                                       |
| `FLF_DB_DATA_DIR`      | Absolute existing private data-directory path, normally inside this worktree's ignored `.local/`. |

For the existing P05 instance, select the following non-secret values in this
terminal, with the password injected by Doppler. Keep the matching
`FLF_API_DATABASE_URL` in the API/migration process configuration; Compose does
not derive or change that URL. If the selected secret source uses a different
password key, map it to `FLF_DB_PASSWORD` only in the child process without
printing it or changing the stored secret.

```sh
export COMPOSE_PROJECT_NAME=featherlane-p05
export FLF_DB_USER=flf FLF_DB_NAME=featherlane_p05 FLF_DB_HOST_PORT=55405
export FLF_DB_DATA_DIR="$PWD/.local/p05/postgres"
```

Keep an existing instance's original project name, port, credentials and data
path when switching filenames. PostgreSQL initialization variables do not
rename databases/users or rotate credentials in an initialized data directory.
For a new instance, deliberately prepare a separate private directory first;
Compose will fail if it does not exist rather than create a store at a mistyped
path. Never reuse another worktree's project name, port or data directory.
The role is a local development role; hosted privileges, TLS termination and
trusted proxy deployment are outside this phase.

```sh
doppler run --no-fallback -- docker compose --env-file /dev/null -f infra/compose.database.yaml config --quiet
doppler run --no-fallback -- docker compose --env-file /dev/null -f infra/compose.database.yaml up -d --wait
doppler run --no-fallback -- uv run --no-env-file --frozen --package featherlane-control-plane alembic -c src/api/alembic.ini upgrade head
doppler run --no-fallback -- uv run --no-env-file --frozen --package featherlane-control-plane flf-api
```

`doppler run` injects the selected configuration into the child process. These
commands disable Doppler's local fallback file and prevent uv/Compose from
loading a dotenv file. See the [Doppler CLI guide](https://docs.doppler.com/docs/cli).
Use `config --quiet` for validation; unfiltered `config` output includes the
resolved database password. Historical P05/P06A handoffs record the retired
`infra/compose.p05.yaml` and `infra/compose.p06a.yaml` filenames used in those
checks; current launches use the shared file above.

In a separate terminal:

```sh
curl -i http://127.0.0.1:8005/api/v1/meta
curl -i -X POST -H 'Content-Type: application/json' --data '{' http://127.0.0.1:8005/api/v1/meta
doppler run --no-fallback -- uv run --no-env-file --frozen --package featherlane-control-plane alembic -c src/api/alembic.ini current
doppler run --no-fallback -- uv run --no-env-file --frozen --package featherlane-control-plane alembic -c src/api/alembic.ini check
```

Startup verifies connectivity, application schema and a recorded migration; it
does not create tables or apply migrations. Failure messages and request logs
omit SQL, connection strings, request bodies and exception tracebacks. The CLI
disables access logs (which can contain sensitive query strings) and forwarded
proxy headers. Do not enable those in an unreviewed deployment configuration.

Stop the API with Ctrl+C. Stop only this instance's database using the same
Compose file and six process variables with `stop`. Its ignored data remains available for later review;
configuration comes from Doppler. Do not use another phase's database or stop
its processes.

## Integration seams and ownership

- `featherlane_api.app.create_app(settings: ApiSettings | None = None) -> FastAPI`
  is the composition root. Register phase-owned routers with `app.include_router`;
  never mount the metadata-only schema app. `app.state.settings` holds validated
  settings. `app.state.database` exists inside the application lifespan.
- `featherlane_api.config.ApiSettings` and `load_settings()` use `FLF_API_` names.
  `DatabaseSettings`/`load_database_settings()` require only database settings for
  migrations. Loading configuration is explicit; imports do not read secrets.
  P06A adds identity configuration without inventing
  a second loader.
- `featherlane_api.infrastructure.database.Base` owns
  `MetaData(schema="featherlane")` and shared constraint naming conventions.
  Domain mappings remain internal and import this
  Base. Name check constraints explicitly. Cross-domain foreign keys use qualified
  table names such as `featherlane.users.id`.
- `Database.session_factory` is `async_sessionmaker[AsyncSession]` with
  `expire_on_commit=False`, `autoflush=False`.
  `featherlane_api.http.dependencies.get_session(request)` yields one request-local
  session and closes it without auto-commit. Use explicit `flush()`
  before queries that depend on pending writes. Each task/concurrent operation
  opens its own session; sessions must not be shared concurrently.
- Services own a complete `async with session.begin():` operation, including
  current authorization checks, writes and audit records. Commit before returning
  a successful response. Read/auth dependencies finish a short read transaction
  before returning an immutable principal. A bare SELECT autobegins; do not leave
  it open and then call `begin()` in a mutation service. Recheck active identity,
  organization/project membership in the write transaction. Never silently roll back
  another layer's transaction to make nesting work. See SQLAlchemy's
  [session ownership rules](https://docs.sqlalchemy.org/en/20/orm/session_basics.html).
- `featherlane_api.http.errors.ApiError(status, code, message, details=())` accepts
  canonical `ErrorCode`/`FieldError` values and application-owned safe text only.
  `ERROR_RESPONSES` documents common responses including the custom 422 envelope;
  `install_error_handlers(app)` installs those runtime handlers. Response-model
  failure is generic 500; malformed JSON is 400; well-formed invalid fields are 422. Field errors name only a known request section so dynamic keys cannot leak
  secrets. They omit raw input, validator messages and exception context.
- The HTTP boundary issues fresh server-owned request IDs and includes the same
  ID in error envelopes and `X-Request-ID`. API responses use
  `Cache-Control: no-store`. `/api/v1/meta` is readable with any/missing contract header. Other
  `/api/v1/` requests require one exact `X-FLF-Contract-Version` before consuming
  JSON bodies. JSON is bounded by bytes/depth and rejects duplicate keys, nonfinite
  numbers, unsafe integers and invalid UTF-8/surrogates. Content-Length and streamed
  chunks are both bounded. Future P16 binary upload routing must explicitly own
  its streaming limits rather than being fed into this JSON path.
- `featherlane_api.http.middleware.HttpBoundary` owns that request middleware;
  `featherlane_api.http.meta.router` owns the public metadata route. The composition
  root supplies its compiled digest as `app.state.schema_digest`.
- `featherlane_api.modules.evidence.ports.PrivateArtifactStorage` defines private immutable
  publication, reading and deletion. `StoredArtifact` is internal metadata with
  canonical identifier/digest types; no wire DTO or host path is exposed. P16 owns
  the actual adapter, upload authorization, per-run quota and atomic verification.

## Migration chain

`src/api/alembic.ini` points to `src/api/migrations`. Root revision
`0001_foundation` creates the `featherlane` schema and records its revision in
`public.alembic_version`. It adds no premature domain tables. Downgrade drops the
empty application schema without CASCADE, refusing to delete unexpected tables.

P06A's identity/session migration follows
`0001_foundation`; P07's access migration follows that actual identity revision. The master integrates these checkpoints in order.
Each phase owns its model/migration module; central model imports in `env.py` and
router/settings composition require reconciliation through the master. Import
actual domain models before Alembic autogeneration/check; do not create competing
Base objects or heads. Autogeneration is a review aid, never a deployment step.

Offline SQL rendering and contract export require no configured database:

```sh
uv run --frozen --package featherlane-control-plane alembic -c src/api/alembic.ini upgrade head --sql
pnpm contracts:generate
pnpm contracts:check
```

`schema_json()` and `schema_digest()` in `featherlane_api.openapi.schema` provide the same
deterministic digest for the exported snapshot and live compatibility metadata.
The snapshot includes planned business routes; runtime OpenAPI/Swagger endpoints
are disabled. Generated outputs remain ignored. Contract source/error additions
and `uv.lock` are the only shared dependency changes in P05.

## P06A authentication API

P06A introduced no login bypass, membership admission, UI routing or provider-token
storage. P07.5 adds bounded admission as described below. Migrate through `0002_identity` before starting it. The API factory and
existing database/configuration loaders keep their P05 import paths. Identity
mappings use the shared `Base`; startup verifies their tables and columns before
serving requests. P07 references `featherlane.users.id` and follows
`0002_identity` with its access migration.

| Route                       | Behavior                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/google/login`    | Top-level browser navigation to Google; no query parameters accepted.                                                                                                         |
| `GET /auth/google/callback` | Browser-bound one-use state/nonce/PKCE completion; redirects to the canonical origin's `/`.                                                                                   |
| `GET /api/v1/session`       | Canonical `SessionEnvelope`: `data.user` (`id`, `displayName`, `email`) and `data.csrfToken`. No memberships.                                                                 |
| `POST /api/v1/logout`       | Requires the contract header, exact `Origin` and `X-CSRF-Token`; revokes the session before returning `LogoutEnvelope` with `data.signedOut: true` and clearing both cookies. |

The logout result accepts only the actual boolean `true` for `signedOut`, matching
the generated literal validator; numeric `1` is invalid.

The two JSON operations require `X-FLF-Contract-Version`. Navigation routes use
Authlib's browser protocol instead; never fetch them as JSON. Offline metadata
marks them `x-flf-transport: navigation`. The generator derives
`browserNavigationPolicies` in ignored `policy.gen.ts`, separate from JSON
`operationPolicies`; P06.5 can consume those paths. Generated JSON SDK, Zod and
TanStack operations include `getSession` and `logout`; this phase does not wire UI
or change the handwritten client/cache policy.

Authlib's Starlette integration receives a request-local `request.session` dictionary.
The adapter persists its authorization state/nonce/PKCE verifier in a short-lived
PostgreSQL transaction row, then restores it only after atomic browser-cookie/state
matching and consumption. It never uses Starlette's readable signed-cookie session
middleware. The opaque OIDC browser cookie and application session cookie contain
no profile, CSRF value or provider token. The database stores keyed application
handle and CSRF digests. User mapping uses exact Google issuer and subject;
verified email never links accounts. P07.5 separately applies explicit owner-configured admission rules within the verified-login transaction, as described below.

Successful reauthentication issues a fresh opaque handle and CSRF value, and
revokes the prior session atomically. Expiry during the provider round trip permits
reauthentication; revocation after initiation prevents the old live session from
being rotated. If the initiating cookie changes during the round trip, the callback
fails. Failed provider calls consume the transaction, so retry starts a fresh login.
The default application lifetime is 12 hours; OIDC transactions last 10 minutes.

Supply these additional process variables through Doppler; never save a dotenv or
Doppler fallback file. No aliases are loaded from other applications' settings.

| Variable                                                    | Meaning                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `FLF_API_SESSION_HASH_KEY`                                  | Required stable secret of at least 32 bytes, shared by API processes. Changing it invalidates outstanding sessions and login transactions. |
| `FLF_API_GOOGLE_CLIENT_ID` / `FLF_API_GOOGLE_CLIENT_SECRET` | Configure both or neither. When absent, Google routes fail closed with `AUTH_UNAVAILABLE`; no fake provider is installed.                  |
| `FLF_API_SESSION_TTL_SECONDS`                               | Default `43200`, allowed `300`–`604800`.                                                                                                   |
| `FLF_API_OIDC_TTL_SECONDS`                                  | Default `600`, allowed `60`–`600`.                                                                                                         |
| `FLF_API_ALLOW_LOOPBACK_AUTH`                               | Defaults to false. Set explicitly for the existing loopback HTTP development origin. All other origins require HTTPS and Secure cookies.   |

Register exactly `<FLF_API_CANONICAL_ORIGIN>/auth/google/callback` with Google.
The configured origin is normalized with the existing Pydantic URL parser to
browser form: lowercase hostname, omitted default ports and compressed/bracketed
IPv6; nondefault ports remain explicit. The callback and final return URL are
derived from that validated origin, never from an incoming Host, forwarded header
or return query. Auth routes reject a
request whose origin differs from the configured canonical origin. TLS/proxy
termination must preserve that origin through a separately reviewed deployment;
the P05 CLI still disables forwarded proxy headers. Production cookies use the
`__Host-` prefix, Secure, HttpOnly, SameSite=Lax and `/` with no Domain. Explicit
loopback development uses names including the canonical port to isolate phases.

For P06A, use the same shared database file with these distinct non-secret
settings. Inject its own `FLF_DB_PASSWORD` into the Compose process, point
`FLF_API_DATABASE_URL` at `127.0.0.1:55408/featherlane_p06a` with the matching
user/password, and set `FLF_API_PORT=8008`. Do not reuse P05's database. Keep the
existing project's identity and private data path; the filename change alone
requires no migration, teardown or container rename. After selecting the
appropriate existing Doppler project/config per process:

```sh
export COMPOSE_PROJECT_NAME=featherlane-p06a
export FLF_DB_USER=flf FLF_DB_NAME=featherlane_p06a FLF_DB_HOST_PORT=55408
export FLF_DB_DATA_DIR="$PWD/.local/p06a/postgres"
doppler run --no-fallback -- docker compose --env-file /dev/null -f infra/compose.database.yaml config --quiet
doppler run --no-fallback -- docker compose --env-file /dev/null -f infra/compose.database.yaml up -d --wait
doppler run --no-fallback -- uv run --no-env-file --frozen --package featherlane-control-plane alembic -c src/api/alembic.ini upgrade head
doppler run --no-fallback -- uv run --no-env-file --frozen --package featherlane-control-plane flf-api
```

### Downstream authentication seam

`modules.identity.domain.Principal` is frozen and contains `user: User`,
`session_id: str`, `expires_at: datetime` (UTC aware), with `user_id: str` as a
property. Frozen `User` contains `id`, `display_name` and `email`, all strings.
It conveys identity only and grants no organization/project access.

Use FastAPI `Depends(modules.identity.dependencies.get_principal)` for reads,
`Depends(require_csrf)` for mutations, and `Depends(get_identity_service)` for the
shared request service. They reuse P05's `get_session`, finish short read
transactions before returning, and never leave a SELECT's autobegin transaction
open. `session_handle(request)` is the sole cookie parsing seam;
`require_csrf` owns same-origin and single CSRF-header validation. Consumer HTTP
adapters may pass `session_handle(request)` to their service; never expose it in
a DTO or log it.

A consumer mutation begins its explicit `async with session.begin():` on that
same request session, then calls `await identity_service.require_live(principal,
handle)` before its own current membership checks/writes. This re-reads the
session/user with `populate_existing` and `FOR UPDATE`, validates identity,
expiry, activation and revocation, and holds row locks until the consumer commits.
It does not start or end the consumer transaction. Optional `csrf` revalidates
CSRF in that transaction when needed; the HTTP `require_csrf` dependency remains
mandatory. Commit before returning a successful response. P07 owns both explicit
membership checks within that same transaction and must not import identity ORM
rows or infer membership from this principal.

## Organization and project access (P07)

Migration `0003_access` follows `0002_identity`. `modules/access/` owns organizations,
projects, exactly two membership tables, and safe access audit events. Organization
membership alone grants no project visibility. Project membership has composite
foreign keys to its organization membership and project/organization pair. Removing
an organization grant cascades its project grants; rejoining does not restore them.
P07 introduced no roles or permission flags. P07.5 below adds the explicit owner and bounded admission/people administration without a role hierarchy.

Protected operations are `GET /api/v1/orgs`, `GET /api/v1/orgs/{orgId}/projects`,
`GET /api/v1/projects/{projectId}`, and `POST /api/v1/orgs/{orgId}/projects`.
Lists use `limit` (1–100) and `cursor`, returning `meta.nextCursor`. Requests require
the contract-version header. Creation additionally requires same-origin/CSRF and an
`Idempotency-Key` identifier. An unchanged retry returns the same project; changed
inputs with the same key return 409. First creation and replay both return201 with
`Location: /api/v1/projects/{projectId}`. Creation, the creator's explicit project grant,
and its audit event commit together. Other organization members receive no grant.

`AccessStore.require_organization` and `require_project` are the shared consumer
authorization helpers. Call them inside the consumer's explicit transaction after
`IdentityService.require_live`. Both memberships are checked for project resources;
lock the organization membership before reading the current project grant. Unknown,
cross-organization and ungranted resources return the same non-disclosing 404.
Future project resources must reuse this boundary; an ID in a DTO is not authority.

Membership provisioning is an operator command against an existing active identity,
matched by its exact verified issuer/subject. The identity lookup uses `lock=True`
inside the same transaction before membership changes. It neither creates users nor
matches email. Supply process configuration through the project's authorized Doppler
run; do not store credentials in files. For example, inside that configured process:

```sh
uv run --no-env-file --frozen --package featherlane-control-plane python -m featherlane_api.modules.access.cli --issuer https://accounts.google.com --subject VERIFIED_SUBJECT bootstrap --name "Organization name"
uv run --no-env-file --frozen --package featherlane-control-plane python -m featherlane_api.modules.access.cli --issuer https://accounts.google.com --subject VERIFIED_SUBJECT organization-member grant --organization-id ORGANIZATION_ID
uv run --no-env-file --frozen --package featherlane-control-plane python -m featherlane_api.modules.access.cli --issuer https://accounts.google.com --subject VERIFIED_SUBJECT project-member grant --project-id PROJECT_ID
```

Use `revoke` in place of `grant` to remove membership. Project grants require an
existing organization grant. Repeated grant/revoke operations are no-ops when already
in the requested state; bootstrap deliberately creates a new organization each time.
Commands print success only after commit. Configuration, socket/timeout/pool and
known PostgreSQL connection/authentication/resource failures have a sanitized error
boundary. Programming errors (for example SQL syntax/missing columns) still surface.
An operational failure may occur after a commit whose acknowledgment was lost:
inspect current state before retrying, especially non-idempotent bootstrap. No raw
exception, SQL parameter, connection URL or credential is printed by this boundary.

P07 now uses only `infra/compose.database.yaml` and the six variables above. The
stopped original data directory `.local/p07/postgres` is preserved; its ephemeral
password was not retained, so changing initialization variables cannot make that
existing database reusable. The final manual review deliberately used a separate
fresh private instance (project featherlane-p07-review, loopback55417, database
featherlane_p07_review, user flf, absolute directory `.local/p07-review-final/postgres`,
API8017). This did not recreate, reset, migrate or delete the original P07 data.
No phase-specific database Compose file is part of the publication packet.

## P07.5 owner and people administration

Migration `0004_owner_admission` adds one explicit nullable owner user ID to each
organization, plus saved email grants, exact-domain rules and join exclusions.
The owner is constrained to current organization membership. Existing organizations
remain unowned; there is no guessed backfill or role hierarchy. New operator
`bootstrap` calls explicitly name the existing verified user as the owner. To
backfill an existing organization, use the existing issuer/subject lookup:

```sh
uv run --no-env-file --frozen --package featherlane-control-plane python -m featherlane_api.modules.access.cli --issuer https://accounts.google.com --subject VERIFIED_SUBJECT assign-owner --organization-id ORGANIZATION_ID
```

The target must already be a member. Repeating the same assignment is harmless;
assigning another owner or revoking the owner is rejected. Ownership transfer is
outside this phase. Project creation now requires the owner, including replay;
project-resource reads/actions still require the existing two explicit memberships.
An owner may administer project grants without being admitted to that project's
resources. `AccessStore.require_project(user_id, project_id)` retains P07's policy
and signature for downstream consumers such as runner enrollment/revocation.

Owner administration lives under `/api/v1/orgs/{orgId}`:

- `GET /access`: current organization/owner summary, available to current members.
- `GET /people`, `DELETE /people/{userId}`: joined people and member removal.
- `GET/POST /email-grants`, `DELETE /email-grants/{ruleId}`: persistent saved emails.
- `GET/POST /domain-rules`, `DELETE /domain-rules/{ruleId}`: exact-domain rules.
- `GET /join-exclusions`, `DELETE /join-exclusions/{ruleId}`: exclusions and explicit permission to join automatically again.
- `GET /managed-projects`: project metadata for owner administration, without granting project-resource access.
- `GET/PATCH /projects/{projectId}/people`: bounded organization-person pages with explicit project membership, and a batch of at most 100 per-person changes. Changes never replace unseen page rows.

All lists use P07's bounded cursor pattern. All mutations require current session,
contract header, exact origin and CSRF, with current ownership checked again inside
the transaction. New rule saves are idempotent by normalized email/domain; project-membership setters are no-ops when already in the requested state. Unknown, removed or foreign deletion/restoration targets return the same non-disclosing 404; reload current state after an uncertain acknowledgement. Audit events
commit with the mutation and reference rule IDs rather than recording email values.
Cross-organization resources remain non-disclosing 404s; a current member who lacks
ownership receives 403 for owner administration.

Email/domain matching accepts conventional ASCII addresses/domains, lowercases and
trims input, and performs no provider-specific dot/plus rewriting. Domains match
exactly: no wildcard, URL, suffix or automatic subdomain matching. The composition
root injects `AccessEnrollment.apply(User)` into the existing verified-login use
case. Admission and session establishment commit together. No periodic scheduler,
invitation acceptance, email lookup/account linking or session-read admission is
introduced. No existing user is admitted until their next verified login.

Removing a person cascades project grants and persists email and stable-user
exclusions, including protection across a later verified email change. Allowing
joining again only removes the exclusion; a matching rule and a later verified
login are still needed. Project grants never return automatically. Removing a
saved email cancels that future admission and excludes the address; existing
members with that email retain their current membership until explicitly removed.
Removing a domain rule likewise preserves current members.

The UI components under `src/web/features/people/` consume canonical generated types
and explicit callbacks. After the human-authorized integration of merged P06.5,
the actual authenticated application mounts them at `/settings/orgs/{orgId}/people`
with epoch-bound validated clients, real queries/mutations, CSRF and cache cleanup.
Settings uses the owner summary to gate project creation; the API rechecks ownership
for every creation/replay. Real Google/HTTPS end-to-end verification is not implied
by the isolated service/HTTP/SDK checks; see the phase handoff for actual results.

## Runner enrollment and health (P08)

Migration `0005_runners` follows merged `0004_owner_admission`. API startup checks
both runner tables. No maintenance process is introduced for health: connection
state is derived from the last accepted heartbeat (CONNECTED below 30 seconds,
STALE at 30 seconds, OFFLINE at 90 seconds). Capacity is separate; enrollment starts
DISABLED until a machine reports its idle state. Credential expiry/revocation
forces the browser projection to DISABLED without claiming process termination.

Project members use `GET /api/v1/projects/{projectId}/runners`,
`POST /api/v1/projects/{projectId}/runner-enrollments` (CSRF and Idempotency-Key),
and `POST /api/v1/runners/{runnerId}/revoke` (CSRF). Both current memberships are
checked in the transaction after live session validation. Lists are bounded
cursor pages. Unknown/ungranted resources share 404. Busy identity changes are
rejected; active claims/cancellation belong to later phases.

Machine-only `/api/v1/runner/enrollments`, `/me` and `/heartbeat` use the canonical
paths and Pydantic models in `featherlane_contracts.runners`. Contract and protocol
versions are checked before consuming a grant. Enrollment requires the one-use
10-minute grant plus a runner-generated request ID and 256-bit credential; exact
retries recover the same identity, including after the grant lifetime, only while
that identity's credential is still live. Changed retries fail. `/me` and idle
heartbeats require the machine bearer credential and protocol header; a browser
cookie grants no machine access, and a machine bearer grants no browser access.

The database stores purpose-separated HMAC digests, enrollment fingerprints and
key identifiers. A grant response is reproducible from its random server ID and
the injected key, so a lost browser response can be recovered without storing its
plaintext. Runner secrets are never returned in browser runner records. HMAC uses
the existing injected `FLF_API_SESSION_HASH_KEY` with separate `runner:*` purposes;
`FLF_API_RUNNER_KEY_ID` defaults to `identity-v1`. A deliberate key change must
change that identifier too; prior credentials/grants become unavailable and require
re-enrollment. This is not a key-ring rotation/refresh service. Credentials last
30 days; preserving the injected key across restarts is necessary for recovery.

The P09 integration seam is
`modules.runners.application.require_runner_declarations(session, *, project_id,
runner_id) -> RunnerSummary`. Authorize the project first and call inside your
active transaction. It locks the runner through the caller's commit, checks the
project binding and rejects revoked/expired identities; it never begins/commits a
transaction. It returns exact canonical build/local-profile declarations plus
connection/capacity state, not verified capabilities or a guarantee of freshness.
The consuming use case must enforce any freshness/eligibility it requires.
Missing/wrong-project identities raise `AccessNotFound`; unavailable identities
raise `RunnerUnavailable`. P09 must not import runner ORM mappings or duplicate
identity rules. The reviewed P09 `registration.py` packet is included unchanged;
its producer remains P09. No P09 application code or migration was imported.

P08's isolated manual review used API 8088/database 55418 and process-only ephemeral
configuration. It did not change Doppler or global credentials, add an auth bypass,
or requalify Google. The runtime UI remains behind the existing authentication
boundary. Live browser/provider qualification at a new origin requires its own
configured callback; the local demo is explicitly sample-only.

## Event ingestion and resumable reads (P15 candidate)

The local P15 candidate adds migration `0015_events` after the merged P14
`0014_cleanup_receipts` from actual main `1588e511`. The reconciled migration chain
has one head, `0015_events`. Events, per-attempt observation progress and per-run server cursor
progress extend the existing run/attempt records. They do not introduce another
queue, broker or deployment service. Startup checks all three event tables.

Machine `POST /api/v1/runner/attempts/{attemptId}/events` uses canonical typed
batches and the real current P13 credential/lease/fence and accepted-manifest
checks. It preserves committed P14 expiry/cancellation outcomes, rejects gaps
with the expected sequence, acknowledges identical duplicates, and rejects changed
identities/contents. At most 100 events and 256 KiB per request are accepted;
10,000 events per run is the explicit server limit. Invalid mixed batches roll
back without advancing acknowledgment or cursor. Receipt time/cursor are server
owned. Events never publish terminal evaluation or release runner capacity.

Browser `GET /api/v1/runs/{runId}/events` returns a bounded canonical JSON page by
default. An accepted `text/event-stream` request selects SSE; Last-Event-ID and
`after` must agree. Current session and both organization/project memberships are
checked for each read. An event cursor is signed and bound to the run. Detail
snapshots and their `serverEventCursor` are composed under the same run row lock
used by ingestion. An invalid/expired cursor returns canonical JSON 410 before a
stream opens; a retained-history gap after opening sends a canonical
STREAM_RESET/CURSOR_EXPIRED and closes. The consumer resumes only after a fresh
snapshot. Retention scheduling/pruning itself remains P23 scope.

Streams carry canonical envelopes and heartbeat comments, never raw telemetry.
They rotate after 30 seconds, have a process-local eight-connection cap and return
429/Retry-After when full. No transaction/auth lock is held across sleep or slow
network delivery. Revoked session/project access closes the stream without more
resource data; reconnect observes the canonical auth error. Capacity is released
on normal close, disconnect and response cancellation, even before the generator
starts reading.

Manual review uses an isolated loopback PostgreSQL18.4/API and seeded protocol
identities/attempts; it does not add a login, admission or normal-execution bypass.
The approved live-detail UI validates events before invalidating scoped Query resources.
Cancellation intent returns 202 while stop confirmation is pending; queued or terminal
cancellation returns 200. Cleanup and evaluation truth remain server-owned.
