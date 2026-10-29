# Published synthetic suites

P10 provides project-authorized catalog and exact revision reads, plus a local
operator import command. P11 adds browser draft authoring and immutable publication; PX4 runtime qualification and nominal flight belong to P18/P19.

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

## Browser draft and publication boundary (P11)

P11 backend authoring uses the actual merged P10 canonical definitions, validator,
digest, exact-profile lookup, reference qualifier and immutable store. The approved browser editor uses these routes. Local implementation and verification
do not imply a deployed service. See the [approved architecture](../../../../../../docs/architecture/suite-authoring.md)
for approval scope and versioning.

All draft routes include `/api/v1/projects/{projectId}`. `GET/POST /test-suites`
lists bounded draft summaries or opens a draft. A create body is either `{}` for
a supported preset with profile selection incomplete or `{ "sourceRevisionId": "..." }` to copy an exact project
revision. Creation requires an `Idempotency-Key`; the same principal/project/key
with changed inputs conflicts. Opening a suite with an existing draft returns it
without overwriting edits. Suite identity and published revision numbers are
server-owned; a suite ID is not an authorization boundary by itself.

`GET/PATCH /test-suites/{suiteId}/draft` reads or replaces draft content. The PATCH
body includes `expectedDraftVersion` and canonical-derived incomplete `content`.
Missing values, unresolved metric thresholds and empty lists can remain in drafts;
unsupported kinds, unknown fields and out-of-bound supplied values reject. All
write operations recheck the live session, same-origin CSRF and both memberships
inside the transaction. Session/membership loss also prevents receipt replay.

`POST .../draft/validate` takes `expectedDraftVersion`, checks the saved content,
then resolves its exact profile and runs P10's bounded qualifier without writing
publication records. It returns structured issues and, only on success, the
canonical definition digest. `POST .../revisions` takes the same saved-version
precondition, reruns authoritative validation/qualification, and commits the new
immutable revision, digest-bound qualification, audit and draft publication
receipt atomically. The draft stays editable. An identical publication retry
recovers the original revision even after later edits; it never publishes the
newer draft silently. Concurrent edits produce one winner and a 409
`SUITE_DRAFT_CONFLICT` for stale writers. A lost PATCH response can produce a
conflict on retry; clients must load the latest saved draft, not overwrite it.

The reference qualifier currently requires all three fixed built-in check IDs and
both `OBSERVATIONS` and `REDACTED_PROCESS_LOG`. Structure-valid drafts that remove
that inventory cannot publish. New revisions run separate qualification bound to
their own digest; old revision verification is never inherited.

`publication.py` contains the shared policy extracted from the operator importer.
The operator still resolves its real identity and owns its transaction. The
browser service still requires its real live principal/CSRF, owns draft locking
and its transaction, and does not call the operator importer. Shared publication
rechecks project membership and takes the project lock before revision work; it
never begins/commits a transaction or establishes a login. No raw store append is
exposed as an authenticated API. No second published suite store is added.

Migration `0011_suite_drafts` follows merged `0012_run_admission` (which follows `0010_suite_catalog`); mutable
draft rows coexist with immutable creation/publication receipts and audit events.
Generated contracts/client output remains ignored. Handwritten validated client
wrappers and scoped read query options live in `suiteDrafts.ts` and
`suiteDraftQueries.ts`; the approved application editor uses these wrappers and the same scoped cache policy.

The current saved draft's `publishedRevisionId` distinguishes a committed publication
from an editable unpublished version; `lastPublishedRevisionId` remains the last
linked publication after edits. The editor disables redundant publication until
content changes. Automatic review returns `nextPublishedRevision` and a canonical
`definitionDigest`; browser publication supplies that digest as
`expectedDefinitionDigest` to reject intervening publication changes. Receipt
recovery checks a supplied digest against the original committed definition.
