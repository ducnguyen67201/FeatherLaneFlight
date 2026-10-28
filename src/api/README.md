# Control-plane foundation

P05 provides the runnable FastAPI service, validated process configuration,
PostgreSQL sessions/migrations, safe HTTP errors and a private storage port.
Only `GET /api/v1/meta` is implemented. Runs and other business declarations in
`featherlane_api.openapi.schema.create_schema_app()` are for offline client generation;
they are never mounted in the runtime application. Authentication, business
operations, the worker, artifact uploads and storage adapters belong to later
phases.

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

P06A, the separately coordinated authentication-backend task, introduces
`modules/identity/`; P06 is UI-only under the latest master scope. P07 introduces
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

## Local P05 setup

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
| `FLF_P05_DB_PASSWORD`        | Private local password consumed only by Docker Compose.                                                                               |
| `FLF_API_DATABASE_URL`       | `postgresql+asyncpg://flf:<password>@127.0.0.1:55405/featherlane_p05`; percent-encode password characters when necessary.             |
| `FLF_API_CANONICAL_ORIGIN`   | Browser-facing origin; use `http://127.0.0.1:8005` for direct local API inspection. HTTP is permitted only on loopback.               |
| `FLF_API_ARTIFACT_ROOT`      | Absolute private artifact-directory path within this worktree's ignored `.local/p05/`. No storage adapter or public mount is created. |
| `FLF_API_PORT`               | Defaults to `8005`; backend consumers use separately assigned ports.                                                                  |
| `FLF_API_HOST`               | Defaults to `127.0.0.1`.                                                                                                              |
| `FLF_API_DATABASE_POOL_SIZE` | Defaults to `5`, maximum `20`; overflow is disabled.                                                                                  |
| `FLF_API_MAX_JSON_BYTES`     | Defaults to `1048576` (1 MiB); may be reduced.                                                                                        |
| `FLF_API_MAX_JSON_DEPTH`     | Defaults to `32`, maximum `64`.                                                                                                       |

The Compose file runs PostgreSQL 18.4 on loopback port `55405`, database
`featherlane_p05`, with data under ignored `.local/p05/postgres`. It creates only
P05's container/network. The role is a local development role; hosted privileges,
TLS termination and trusted proxy deployment are outside this phase.

```sh
doppler run --no-fallback -- docker compose --env-file /dev/null -f infra/compose.p05.yaml up -d --wait
doppler run --no-fallback -- uv run --no-env-file --frozen --package featherlane-control-plane alembic -c src/api/alembic.ini upgrade head
doppler run --no-fallback -- uv run --no-env-file --frozen --package featherlane-control-plane flf-api
```

`doppler run` injects the selected configuration into the child process. These
commands disable Doppler's local fallback file and prevent uv/Compose from
loading a dotenv file. See the [Doppler CLI guide](https://docs.doppler.com/docs/cli).

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

Stop the API with Ctrl+C. Stop only P05's database using the same Compose command
with `stop`. Its ignored database data remains available for later review;
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
