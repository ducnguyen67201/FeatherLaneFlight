# Published synthetic suites

P10 provides project-authorized catalog and exact revision reads, plus a local
operator import command. The browser cannot create or edit suites. Draft authoring
belongs to P11; PX4 runtime qualification and nominal flight belong to P18/P19.

## Operator workflow

Use Python 3.12 through the repository's uv workspace. Before importing, apply the
integrated API migrations and configure the documented `FLF_API_` settings through
the approved process environment. The operator's issuer/subject must resolve to an
existing active user with explicit organization and project membership. This command
does not create an identity, grant access, or register an integration profile.

1. Describe the synthetic reference profile for this host and Python version:

   ```sh
   uv run --package featherlane-control-plane python -m featherlane_api.modules.suites.cli describe-profile
   ```

2. Register that exact profile through P09's authenticated integration-profile endpoint. Keep the returned
   profile ID, revision and digest. Metadata registration remains `DECLARED`.
   `describe-profile` only prints metadata; it does not perform registration or
   establish runner availability.

3. Import the supported preset using those exact registered values:

   ```sh
   uv run --package featherlane-control-plane python -m featherlane_api.modules.suites.cli import \
     --issuer "$OPERATOR_ISSUER" --subject "$OPERATOR_SUBJECT" \
     --project-id "$PROJECT_ID" --builtin synthetic-nominal \
     --profile-id "$PROFILE_ID" --profile-revision "$PROFILE_REVISION" \
     --profile-digest "$PROFILE_DIGEST"
   ```

   The import authorizes the project, resolves the actual P09 record, executes the
   bounded synthetic reference handler, evaluates its checks, and atomically writes
   a published revision, a separate immutable qualification report, and an audit
   event. Identical replay returns the existing revision without another audit;
   different content at the same suite/revision is rejected. Changed definitions
   require a new revision.

For an operator-owned definition, `validate path/to/suite.json` checks structure
without configuration, a database, publication or qualification. `import` accepts
`--file path/to/suite.json` instead of `--builtin` and profile arguments; the file
contains its exact profile binding. Input is limited to 64 KiB of regular-file JSON,
rejects duplicate keys and unknown fields, and supports only `fake.nominal` v1.
Import additionally verifies the reference host/configuration, check inventory,
thresholds, evidence limits and exact registered profile.

## Qualification and read boundaries

The reference handler generates completion, landed/disarmed and virtual-duration
observations. It launches no process and connects to no simulator or vehicle. Its
`VERIFIED` provenance qualifies only this bounded synthetic reference path. It does
not promote the P09 registration, qualify a runner or PX4, or authorize a live job.
The report is stored with its SHA-256, exact suite/profile binding, host/runtime,
handler/check versions, observations and bounded evidence metadata.

Catalog filters are applied before cursor pagination. Reads require a current
session and explicit access to the requested project; exact revisions cannot be
resolved through another project. `require_qualified_suite` is a caller-owned
transaction seam for later admission work, which must still enforce authorization,
build compatibility and runner eligibility itself.

P10 uses the actual merged P09 models, registration store and exact-profile lookup.
Migration `0010_suite_catalog` follows `0009_registration`; fresh database setup
uses the complete reviewed chain.
