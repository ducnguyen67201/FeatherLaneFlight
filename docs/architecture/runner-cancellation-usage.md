# Runner cancellation and usage observations

This child of the [runner execution architecture](runner-execution.md) covers
P14's local cancellation/cleanup usage observations and their existing API read
path. It does not describe the whole runner, flight evidence, managed hosting or
billing system. See [local supervision](../../src/runner/SUPERVISION.md) for the
process, lease and file-ownership rules.

[Architecture SVG](../diagrams/runner-cancellation-usage-architecture.svg) ·
[Editable Archify source](runner-cancellation-usage-architecture.json)

![Runner cancellation and usage architecture](../diagrams/runner-cancellation-usage-architecture.svg)

## Approval and implementation status

Human approval: October 29, 2026, P14 chat
`01a18387-0fea-7960-bebd-214f5054330e`, turn
`01a1892f-4b5e-73b1-9c37-30103df920e5`, message
`01a1892f-4b8f-78b3-ad22-167e7489da6a`:
“Yeah, I approve adding the usage reporting to phase 14. Keep the actual cost and
billing stuff for later. Go ahead and implement it.”

The approved scope adds observed local supervised intervals and P14-owned storage
snapshots to cleanup reports, append-only persistence, and the authorized run-detail
response. The proposal was explained and rendered before this approval. The durable
diagram preserves its topology and boundaries, with status labels updated after
approval. Automated Archify validation, provenance and browser checks passed; no
perceptual review is claimed.

This scope is implemented locally for phase review. Approval does not publish a PR,
merge code, admit a qualified executor or deploy infrastructure. Existing P13
identity/lease authorization and PostgreSQL remain the underlying components. P15/P16
integrations retain their ownership; the shared logical disk-budget implementation
and public stop/closed-output signatures are unchanged.

## Facts captured at cancellation

The guardian records a clock-session identity after starting its fixed child. The
same guardian samples monotonic elapsed milliseconds when it observes child exit,
before output sealing. UTC timestamps identify observations; subtracting wall-clock
or server terminal timestamps is never used to manufacture runtime. This is an
observed supervision interval, with observation latency, not CPU/GPU usage or
provider VM allocation time.

A complete same-clock interval is `CONFIRMED`. If the guardian is lost, recovery
retains the last persisted counter as `OBSERVED_LOWER_BOUND`, even if recovery later
confirms exit. Only startup and final clock samples are durable in this increment;
the last known counter can be zero when the guardian dies before its final sample.
A missing sidecar produces `UNAVAILABLE` with a null duration. The report therefore
does not claim a complete usage total across an orphan/restart gap.

Storage values are snapshots: the logical reservation for this generation and
verified retained closed-output file bytes. They cover only P14's at-most-128-byte
stand-in output. An open or unreadable output has null retained bytes. Files remain
reserved after stop/upload; zero is reported only after explicit owned removal.
The shared 500 MiB policy is a staging allowance, not a monetary budget or a
measurement of physical filesystem blocks, all host storage or accrued byte-seconds.
Private process/usage metadata stays outside that logical output allowance.

## Reporting and reads

`AttemptCleanupRequest.usage` is optional. A caller takes
`Supervisor.usage_snapshot()` after stopping and includes that observation with the
canonical cleanup fields. It retains the **entire same request and operation ID**
for retries, rather than taking a fresh timestamp under an old ID. The existing idle
CLI remains non-executing; it does not gain an automatic reporting loop.

The cleanup service authenticates the current runner/project/lease/fence, holds the
existing runner/run/attempt locks, and commits the cleanup receipt and usage row in
one transaction. Receipt identity covers the usage payload. An identical retry
returns its original receipt; a changed payload with that operation ID conflicts.
An absent usage field preserves the earlier cleanup fingerprint. Every new usage
operation appends a row; database triggers reject updates and deletes.

A summary contains the latest observation plus the greatest known cumulative
elapsed counter and its operation ID. It does not add repeated intervals or storage
snapshots. Generation/clock conflicts and confirmed intervals below a known counter
are rejected. Existing browser session/project membership protects the run-detail
read; no new UI screen or separate usage endpoint is added.

A late cleanup report may append diagnostics after expiry. It cannot change the
terminal cancellation/error outcome, renew a lease, admit work or grant evidence
writes. Runner reports are authenticated observations, not provider attestation.

## Deferred scope

Cost is explicitly `UNAVAILABLE`; amount and currency are null. There are no prices,
spend enforcement, credits, invoices or billing calculations. Actual resource
metering, versioned rates and provider reconciliation remain later work, described
as the proposed P23.5 increment in the [hosting plan](../plans/execution-hosting.md).
That proposal label is not an active phase dispatch. Unknown usage or cost never
means zero or free.
