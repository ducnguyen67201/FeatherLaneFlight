# Non-executing runner protocol

Phase 13 adds a client for claims, startup manifests and active lease heartbeats.
The implementation does not execute a scenario or a child process. Protocol
readiness is `DISABLED` and `DECLARED`; it is not `fake.nominal` job capability.
The original metadata-only `start --inventory` behavior remains available.

## Measure synthetic input facts

After enrollment, an explicit owner-only private inventory can be measured with:

```sh
uv run --package featherlane-runner flf-runner \
  --state-dir /absolute/private/runner-state \
  start --once --synthetic-inventory /absolute/private/synthetic-inventory.json
```

Keep the inventory, configuration, input data and credential state outside the
checkout with protected ancestors and owner-only file permissions. The existing
state lock and atomic heartbeat journal remain authoritative. An uncertain
heartbeat is retried unchanged before measuring a new one. Changed or invalid
inputs withdraw declarations rather than silently refreshing an approved digest.

`SyntheticInventory` in `featherlane_runner.synthetic` is the private input schema:
`buildMetadata` is the canonical synthetic build metadata; `inputFile` and
`configurationFile` are approved data paths; `integrationProfile` is the canonical
synthetic profile; `displayName` labels the local policy. There are no commands,
launch arguments or executable paths. The source revision is descriptive metadata;
`sourceDigest` must match the actual installed runner module measurement.

The input data uses canonical P10 `SyntheticReferenceObservation` values and a
strict redacted synthetic log declaring zero owned children. Reading this data
proves format and fingerprint agreement only. P10's separate server reference
qualification does not qualify an execution-capable runner.

## Claims and recovery

`ProtocolClient` composes the real pinned `RunnerTransport`, `ProtocolJournal`
and an in-memory `LeaseWindow`, under `StateStore.lock()`:

- Persist a claim request ID before transmitting it. Reuse it after uncertain
  delivery; create a new ID only after an acknowledged empty claim.
- Recover the same assignment and current remaining TTL from the server. A saved
  grant never provides new authority after restart. No local deadline is persisted.
- Submit a measured canonical observed manifest. Acceptance freezes it; a replay
  or manifest acknowledgment never renews the lease.
- Persist each active heartbeat's sequence/payload before transmitting it. A
  duplicate acknowledges the current lease without extending its server expiry.
- Anchor local deadlines to request-dispatch monotonic time, subtract the ten
  second stopping margin, and reject responses after the previous local deadline.
- Retain terminal/unresolved assignment state. No automatic new claim or cleanup
  acknowledgment is implemented. P14 owns supervisor cleanup and recovery.

There is no automatic claiming execution loop in the `start` CLI. Public claim
eligibility remains fail-closed until a separately authorized supported runtime
exists; `ProtocolClient` is the non-executing integration surface. Positive normal
admission remains blocked. Seeded reservation fixtures used during development
are not normally admitted jobs and do not provide production eligibility.

## Server composition

The API mounts the canonical machine routes from `featherlane_contracts.leases`.
They reuse existing runner credentials, project binding and contract/protocol
headers. P12 owns one Run queue and its immutable requested manifest/trial matrix.
Claim, cancellation and lease writes share runner -> run -> attempt locking.
Unique active-attempt indexes and a monotonically increasing runner counter fence
writes; claim receipts retain empty or assigned outcomes without caching authority.

The expiry worker shares the API rules and PostgreSQL store:

```sh
uv run --package featherlane-control-plane python \
  -m featherlane_api.modules.leases.worker --once
```

It uses the documented `FLF_API_` configuration and a bounded batch. Omit `--once`
for the five-second maintenance loop. It does not execute, reassign, recover or
finalize jobs. Expiry marks an attempt/run `ERROR / LEASE_EXPIRED`, retains every
scheduled trial, and leaves runner capacity `NEEDS_CLEANUP` until the separately
owned recovery path is implemented.
