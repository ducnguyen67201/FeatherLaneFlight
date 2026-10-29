# Build and integration registration

P09 records approved simulator inputs. It does not launch PX4, connect to a vehicle, upload binaries or qualify mission capability. P18–P21 own the real PX4 adapter and evidence gates.

## Data and behavior

The canonical models live in `packages/contracts/python/src/featherlane_contracts/registration.py`.

- `BuildMetadata` describes the exact source revision, approved source-file digest, optional patch digest, executable digest, configuration digest and target. `BuildDeclaration` adds its content-derived identity; `BuildView` adds the project and registration timestamp.
- `IntegrationProfileSpec` describes the PX4/SIH compatibility specification: pinned base revision, tools, target, vehicle, clock, speed, randomization and declared checks/capabilities. Its immutable registration stays `DECLARED`. `SyntheticIntegrationProfileSpec` is a separate bounded SYNTHETIC/FAKE variant with no PX4/MAVSDK/vehicle fields. `RegisteredIntegrationProfileSpec` and `RegisteredIntegrationProfileView` select variants through runtimeFamily; unknown families are rejected. Synthetic registration does not require or introduce a synthetic Build. Metadata compatibility does not establish verified capability.
- `LocalLaunchProfile` is private runner configuration: approved directories, environment variable references, loopback endpoint and structured local launch arguments. `LocalProfileDeclaration` is its bounded public metadata projection and digest. Actual environment values, paths and arguments never enter the public contract.
- A later `Px4SihAdapter` owns runtime behavior. It consumes an exact approved profile, measures startup reality, connects to the owned simulator, implements supported scenario operations, collects evidence and confirms cleanup. No adapter is implemented by P09.

Selecting PX4/SIH will select a typed profile and a code-owned adapter. Future integrations should introduce a distinct validated profile variant and an explicit adapter implementation. Keep their simulator-specific settings with that variant. Add the shared adapter interface when the real execution phases establish the needed operations; do not create empty adapters or a universal plugin framework now. Never import a class or execute a command supplied by the browser.

## Local resolution

The local `registration.py` module uses the canonical contracts directly. `resolve_build` accepts an operator-approved build collection, an exact identity and artifact digest. It measures regular local executable, source, optional patch and configuration files and rejects missing approvals or changed digests. A non-null patch digest requires its matching approved local patch file. File-set digests hash a sorted JSON object mapping unique logical names to file SHA-256 digests. `declare_local_profile` checks local configuration against the integration profile and produces only metadata. `resolve_local_profile` rechecks the exact approved identity/digest.

The resolver never starts a process or downloads files. A returned path is a resolution result, not a guarantee against later filesystem changes; the execution phase must measure/freeze the actual startup inputs immediately before launching, as required by the observed-manifest gate. Source digest covers the explicit operator-approved source manifest, not an implicit claim that every file in a checkout was measured.

## Identity and persistence

Canonical JSON uses camelCase keys, sorted object keys, compact separators and ASCII escaping. SHA-256 over that representation produces `build_…`, `integration_…` and `local_…` identities. Use `integration_digest(spec_or_view)` for profile hashing. It includes the runtime family and excludes server ID/project/timestamp/support fields, so a spec and its registered view share the same digest. Local launch-policy digests include local references but never reveal their contents. Any changed registration metadata produces a new identity; an existing record cannot be updated or deleted through the database.

P08 owns enrollment, machine authentication, heartbeat transport and current declaration availability. P09 integrates its actual approved P08 PR14 source at main06be441; the reviewed frozen identity/runtime checkpoints match that merged source. Registration consumes `require_runner_declarations` inside the existing authorized transaction, retaining its runner-row lock through commit. New runner-backed registrations require CONNECTED health, unexpired/unrevoked identity, no cleanup or disabled-input diagnostic, and an exact canonical declaration match. A measured runner may remain DISABLED with INPUTS_DECLARED solely to register metadata; it is not eligible for run execution.

The API exposes same-origin, session/CSRF-protected POST operations on project `builds`, `local-profiles` and `integration-profiles`. Every write rechecks live user and project membership. Build/local writes carry an enrolled runner ID and exact declaration; local profiles must match their registered integration digest, configuration and target. Integration specifications register as DECLARED without claiming runner qualification.

Idempotency keys are scoped to project and actor across registration kinds. An atomic immutable receipt binds the key to the exact canonical request. An identical retry returns the same committed registration after checking current user access, even if the runner later goes offline or is revoked; this recovery creates no new runner-backed record. Changed input conflicts. A failed new write rolls back its receipt, registration and audit together. Repeated identities create no duplicate audit event. The migration follows actual merged P08 `0005_runners`; the final chain was checked through `0009_registration` without drift.

## Declaring an approved inventory

Use `uv run flf-runner start --inventory /absolute/private/approved-inventory.json` (add `--once` for one health update). The optional file is an `ApprovedInventory`: `builds` contains private `ApprovedBuild` objects, and `localProfiles` contains private `LocalLaunchProfile` objects. Construct these using the typed models and measured file-set digests above; do not send this private JSON to the API. Keep it outside Git checkouts, with mode 0600 and owner-controlled local paths. The loader rejects symlinks, nonregular/multilink files, wrong ownership/permissions and files over 1 MiB. An omitted/empty inventory advertises NOT_CONFIGURED.

Each new heartbeat remeasures declared inputs and checks their target against the actual host. Only canonical public BuildDeclaration/LocalProfileDeclaration projections enter P08's pinned-origin transport. Heartbeats remain DISABLED because P09 installs no execution loop. Valid inputs advertise INPUTS_DECLARED. Missing, invalid or drifted inputs withdraw all declarations with LOCALLY_DISABLED; private paths and exception contents are never sent or logged. This is an inventory-level failure, so a partially measured set is not advertised.

P08's exclusive process lock and durable sequence/pending journal are preserved. An uncertain pending heartbeat is replayed unchanged before any new measurement or sequence. File measurement establishes current bytes, not ongoing immutability or capability qualification; execution must remeasure/freeze inputs again immediately before launch.

## Exact profile lookup and synthetic qualification

`featherlane_api.modules.registration.application.require_integration_profile(session, *, project_id, profile_id, expected_revision, expected_digest)` returns the exact canonical registered profile view. The caller authorizes the project and owns the active transaction. The helper starts/commits no transaction and grants no qualification. P10 owns separate immutable synthetic provenance tied to the exact ID, revision, digest, versions and evidence. P09's registration remains DECLARED. A PX4 build cannot become compatible with a SYNTHETIC profile.

The coordinated replacement contract is frozen under `.local/checkpoints/p09-registration-v2/`, with per-file hashes and export/signature notes. The prior cc1156c0 source remains a historical checkpoint. Consumers must update together; a profile's new explicit runtimeFamily changes its content identity.
