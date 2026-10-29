# Private evidence transport

P16 supplies local private evidence transport and the approved standalone Evidence
panel, metadata dialog and protected browser downloads for phase review. The runner remains
NON_EXECUTING/DISABLED/DECLARED; neither an uploaded artifact nor a stand-in child
establishes qualified execution or a passing result. P17 owns evaluation.

## API and integrity boundary

Canonical declarations and local policy live in
`featherlane_contracts.evidence`, reusing P13 `AttemptWrite` and the existing
artifact/observation contracts. Routes are derived from those canonical constants:

- `POST /api/v1/runner/attempts/{attemptId}/artifacts`: reserve an immutable
  declaration under the current authenticated attempt/lease/fence. Same operation
  and payload recover the same artifact; changed payload conflicts.
- `PUT /api/v1/runner/artifacts/{artifactId}/content`: authenticated binary stream,
  current lease/fence headers, full-stream byte count and SHA-256, bounded private
  staging and immutable publication. No client path or URL is accepted.
- `GET /api/v1/runs/{runId}/artifacts`: current session plus explicit current
  organization/project membership. Local-only declarations remain NOT_VERIFIED.
- `GET /api/v1/artifacts/{artifactId}/content`: authorized attachment with a fixed
  server filename, `nosniff`, no-store and a declared length. Current session,
  membership, verified state and retention are rechecked before each 64 KiB chunk.
  Browser cookies never authenticate machine endpoints.

Uploads stream outside database locks. Publication follows the actual merged P13
runner → run → attempt order, current identity/version checks and policy 2's
assignment-based five-minute maximum. It rechecks authority after filesystem
publication and before verified metadata becomes visible. The project quota uses
its own evidence row lock after attempt locking, avoiding reversal of admission's
project/runner ordering. A declaration does not retain a timestamp from before a
quota-lock wait.

Verified metadata is the visibility gate. Disconnects, invalid streams and normal
cancellation remove their owned staging file. Process crashes can leave private
staging bytes which still consume bounded capacity. Failed metadata commits or
expiry during publication can leave a complete private orphan; it cannot be
served through the API. Reconciliation must distinguish it from an active upload.
Never mount the storage root as static files. Identical verified receipt recovery
can hash an incoming retry without staging or changing anything; terminal state
never grants new declaration/upload mutation rights. Revoked credentials fail.

Matching a digest is insufficient for an unsupported content kind. Observation
arrays use the canonical bounded observation schema. Redacted process diagnostics
permit only explicit process event names, elapsed time and exit code; arbitrary
stdout, environment/configuration dumps and unknown fields reject. The ULog gate
checks only the version-1 header from the
[PX4 format specification](https://docs.px4.io/main/en/dev_log/ulog_file_format#header-section).
P17 retains full topic/semantic checks. No uploaded content is rendered or executed.

## Limits and local policy

Default bounds: 100 MiB per artifact, 10 MiB observation arrays, 1 MiB process
logs, a tighter frozen-suite artifact cap when present, 500 MiB/100 declarations
per run and 10,000 declarations per project. Full declared lengths reserve quota
before streaming, including pending/failed declarations. Local-only declarations
reserve a count slot and no content bytes. Uploaded content uses a bounded
60-second request window; retry uses the same declaration identity.

Validated API settings:

| Setting                                | Default                | Purpose                                                                 |
| -------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `FLF_API_ARTIFACT_ROOT`                | Required absolute path | Private local staging/objects; startup enforces owner-only directories. |
| `FLF_API_ARTIFACT_STAGING_BYTES_LIMIT` | 500 MiB                | Incremental total across cooperating API processes.                     |
| `FLF_API_ARTIFACT_STAGING_FILES_LIMIT` | 32                     | Bounds concurrent and crash-retained staging files.                     |
| `FLF_API_PROJECT_EVIDENCE_BYTES_LIMIT` | 5 GiB                  | Full declared project byte quota.                                       |

Artifact metadata initially records 30-day raw retention. P23 owns scheduled
expiration/deletion and project retention configuration; expired/missing content
already refuses download and stays visibly unavailable in metadata.

`EvidenceUploadPolicy` defaults to no uploads. ULogs require explicit local
permission, and a suite requiring a blocked kind must fail local preflight.
Fixed allowlisted filenames, no-follow held descriptors, owner-only modes,
regular/single-link files and change checks restrict local reads. API paths never
select host files.

## Runner ownership and remaining integration

`open_closed_evidence` calls the merged P14 `Supervisor.closed_output` proof
and compares its confirmed stop flags and file identity/hash. P14 retains original
removal authority through `remove_closed_output`; P16 never chmods/deletes those
originals or releases their reservation on upload acknowledgment or lease expiry.
P14's current `standin.txt` is deliberately rejected as canonical domain evidence.
No actual producer of owned domain artifacts has been added or invented by P16.

The shared disk-budget library merged with P14 is consumed through its required
`Supervisor(StateStore, DiskBudget)`. Reservation parents remain 0700; nested
closed output may be 0500 and files 0400. Raw originals stay charged until actual
owner removal. Copies would need separate full reservations before creation,
including simultaneous copy peaks and bounded file/directory metadata. There is
no duplicate P16 ledger. The common 500 MiB logical budget excludes process/journal
metadata and uncontrolled host output; it is not a physical whole-host quota.

`EvidenceTransport` reuses the existing pinned-origin runner client, rejects
redirect/proxy changes through that client, streams a measured held descriptor,
uses canonical routes and validates bounded receipts against the declaration.
The caller must retain the declaration/operation identity for uncertain-response
recovery. The NON_EXECUTING CLI does not invoke this transport as an execution
capability. No new runner journal or execution pipeline was introduced.

The schema generator emits `binaryTransportPolicies` separately from JSON
`operationPolicies`, preserving merged P13 empty-204 behavior. Binary attachment
streams must not enter a JSON validator. No SSE framing or second browser
lifecycle implementation was added.

This branch includes actual merged P15 (`16dcc4cea1da1cbcdd3424f228f902165bb043de`)
and its P14 predecessor, including shared cancellation/expiry decisions,
cleanup/usage contracts, event delivery and supervisor ownership. Migration 0016
follows 0015 in one chain. P16 keeps the merged cleanup/recovery/event transport
methods and adds only its shared bounded response decoder. It does not replace
P14 cleanup/usage reporting or P15 event sequencing, stream and cache policies.

Authorized RunDetail snapshots now compose evidence counts from the same bounded
records and availability projection as the artifact listing. Available/verified,
missing and expired counts reflect stored evidence, including absent physical
objects; local-only declarations increase the total without becoming verified.
P15's signed event cursor and P14 usage composition remain intact.

The approved Evidence component is implemented with loading/empty/error/access-loss
states and verified/available-only downloads. Its browser adapter refreshes metadata
through the existing scoped Query cache, uses a same-origin/session-protected
binary stream, verifies full bytes/SHA-256, and saves only complete valid content.
The bounded client shares current-context guards with the JSON/SSE clients and
does not bypass their cache/session ownership. Local-only, pending, failed, missing
and expired content is not downloadable. Metadata remains a separate dialog.

The approved
compact timeline now consumes P15's validated event pages through its existing
live-update adapter. Pages remain bounded to 100 records with incomplete-page
warnings; this is not a raw-log tail or arbitrary nested span protocol.
Evaluation, video, managed provisioning and actual domain-output production
remain later work. The managed-service architecture/deployment proposals are
unapproved and excluded from this local transport implementation. Final scoped
review and individual publication approval remain separate from UI approval.
