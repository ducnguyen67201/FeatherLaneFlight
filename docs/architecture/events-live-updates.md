# Events and live updates architecture

This P15 subsystem is a child of the [runner execution architecture](runner-execution.md)
and the [system architecture](../EngineeringSpec.md#3-system-architecture). It covers
bounded runner observations, ingestion, event storage/read cursors and browser
freshness. Execution, cleanup authority, final evaluation, artifact transport and
hosting retain their separate ownership.

[Architecture SVG](../diagrams/events-live-updates-architecture.svg) ·
[Editable Archify source](events-live-updates-architecture.json)

![Approved events and live updates architecture](../diagrams/events-live-updates-architecture.svg)

## Human approval and exact scope

Approved October 29, 2026 in P15 chat `01a18387-1296-73b0-8d19-a4034678db9b`,
turn `01a18924-e569-7513-a177-371c1b5aef65`, human message
`01a18924-e5e6-7c33-afd1-b714fc23d3e5`. The user answered **“Approve shown scope”**
to: “Do you approve the shown Phase 15 live-update UI and event architecture
proposal? This covers connection/freshness notices, snapshot recovery, validation
errors, and the existing event timeline.”

The approved diagram is the bounded event delivery/recovery proposal shown before
this approval: original editable source SHA-256
`55c657559550c18cd0678ad1b4fd2621396e66cf6b4afb0f17ee317f4694d39a`.
The maintained diagram updates its title and approval/implementation labels without
changing the approved components, relationships, trust boundaries or limits.
Approval covers that design and shown UI implementation; it does not authorize a
push, pull request, merge, provider work or deployment.

## Responsibilities and boundaries

The customer runner reserves its bounded storage before producing bytes. A durable
SQLite spool sends contiguous typed batches under the current attempt lease/fence;
only acknowledged progress advances the durable delivery cursor. Logical shared
managed storage defaults to 500 MiB (64 event, 435 evidence, 1 accounting), at most
32 reservations with four contents each. It is not a whole-host physical quota.
Actual P14 owned process/group cleanup remains responsible for stop truth and raw
original removal. Buffer exhaustion requests that real stop path; events cannot
prove cleanup, free capacity or produce a final PASS.

The API rechecks current machine authority and accepted manifest before atomic
persistence, deduplicates identical retries and rejects gaps/conflicts. Batches are
bounded to 100 events / 256 KiB; retained observations are capped at 10,000 per run.
PostgreSQL serializes run event ordering and snapshot cursors under the run lock.
JSON pages and SSE require current session plus organization and project grants.
Run-scoped signed cursors reject tampering and retained-history gaps; pre-open
expiry returns canonical JSON 410, while an open stream sends STREAM_RESET.
SSE is bounded to eight process-local subscriptions and rotates at 30 seconds.

The browser validates framing and the generated message union before handling an
event. Valid observations invalidate the scoped detail, run list and eligibility
queries; they never replace a RunDetail or invent an execution/evaluation outcome.
Transient reconnect is bounded; cursor/sequence gaps allow one fresh snapshot
recovery per subscription. Invalid/permanent streams pause until manual refresh.
Independent 10-second snapshot checks cover server-only cancellation/expiry/cleanup
changes even when the stream is healthy. Permanent REST/schema errors stop
automatic reads, transient failures retain and label the last valid snapshot, and
Retry-After defers reads (long deferrals require manual retry). Membership loss
cancels reads, closes the stream and clears the affected project cache; auth epoch
guards retire old callbacks. The existing timeline remains a bounded 100-event page.

## Implementation status

P15 backend, spool, validated transport and approved live-detail UI are implemented
locally and manually verified. The checkout consumes actual P14 PR21 squash merge
`1588e51124c67d3835e412a55207bfbde3b4c85a`, including optional usage reporting.
The common storage policy/budget and P14 supervision/cleanup source belong to the
merged base; P15 adds event delivery and composes its signed cursor with the
existing usage-aware RunDetail snapshot.

The actual authenticated run-detail cancellation flow was exercised against an
owned PostgreSQL database, API, event transport and merged P14 supervisor. An
active cancellation returns 202 and remains pending until the actual child/group
stop and cleanup receipt; a queued or terminal cancellation returns 200. The UI
then reads Canceled / Not evaluated, closes the live stream and retains the four
acknowledged timeline observations. The cleanup receipt also preserves P14 usage
and exact-replay behavior. The diagnostic stand-in and seeded protocol records
are operator fixtures, not normally admitted or qualified execution.

Automated Archify validation, delivery, artifact and browser gates passed.
No new automated tests were written. Temporary review captures/source/servers
are removed before handoff; final SVG, editable JSON and this approval record are
durable. No PX4, runtime qualification, results PASS, high-rate telemetry or new
infrastructure is delivered. NON_EXECUTING remains DISABLED/DECLARED.
See the [P15 handoff](../phases/handoffs/P15.md) for exact source ownership,
checks and limitations. P15 publication and acceptance remain separate review gates.
