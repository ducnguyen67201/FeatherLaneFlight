# Required events and replay (P15 candidate)

This is a local implementation candidate under review. It adds no PX4 execution,
normal synthetic runner qualification, handler or passing evaluation. The shipped
NON_EXECUTING path stays DISABLED/DECLARED. Stand-in checks use P14 supervision
diagnostics and explicitly seeded protocol fixtures.

## Shared bounded storage

`RunnerStoragePolicy` and `DiskBudget` are the exact frozen common v2 subset, first
landing with P14 under its own review/merge gates. Use one private budget root for
all participating event spool, P14 raw originals and P16 candidate/copy storage.
The default logical total is 500 MiB: 64 MiB events, 435 MiB evidence, and 1 MiB
accounting. There are at most 32 reservation slots, including zero-byte files.
Consumers bound each reservation's contents to four entries including nested
folders, enforce data limits before incremental writes, and reserve simultaneous
copies separately. This is managed logical byte accounting, not a physical
whole-host filesystem quota; runner identity/process metadata and uncontrolled
host outputs are outside it.

`reserve(id, attempt_id, kind, byte_limit)` durably reserves the complete worst
case before creating/writing its returned directory. Exact retries recover that
reservation; changed owner/category/size conflicts. There is no resize operation.
`release(id, attempt_id)` requires the entire reservation directory already gone.
Missing directories after a crash remain charged until explicit reconciliation.
The ledger uses its own short internal nonblocking lock, distinct from P14's
runner.lock; never nest the budget lock. A consumer serializes creation, writing
and final removal of its reservation ID under its own ownership lock; the short
ledger lock protects accounting. Parent mode stays 0700. P14 can seal its
nested output at 0500 and file at 0400 only after actual exit. Only P14 removes
those originals or releases their charge.

## Durable event spool

Prepare `EventSpool(budget, attempt_id)` before launching any process. A failure
prevents launch. SQLite holds typed pending events, next sequence, acknowledged
sequence and sent-through progress in the same durable transaction. Unique IDs
and sequences reject conflicts; identical pending appends are idempotent.
Acknowledgments delete only sent, contiguous acknowledged rows. Close preserves
both required bytes and the reservation; it does not imply cleanup or removal.

One EVENTS reservation covers the bounded database, rollback journal and file
allowance. The main database gets less than one third of that reservation; WAL,
VACUUM, external temporary files and uncharged copies are not used. Pending rows
are also bounded at 10,000. Restart opens only the known private regular files and
rejects oversized or unsafe state. Batch construction uses the current lease ID
and fence, never a saved grant, and enforces canonical 100-event / 256 KiB bounds.

## Actual stop and authority boundaries

`RequiredEventDelivery(spool, supervisor)` consumes the actual merged P14
`Supervisor` under its existing context/runner.lock. It checks the spool belongs
to the currently owned attempt. Required append/batch/ack capacity failures and a
server EVIDENCE_BUFFER_FULL response call `Supervisor.stop` and raise
`EventDeliveryStopped` with its actual frozen StopResult. Process, group and
cleanup flags must be read individually; the exception does not invent success.
CLEANUP_FINISHED is spooled only after actual child/group exit and cleanup are
confirmed, and its payload must agree that the process exited.

`flush(transport, credential, current_lease, live_window)` sends one bounded batch
through `RunnerTransport.attempt_events`. Use the actual P13 LeaseWindow anchored
at request dispatch with the stopping margin; never reconstruct it from a saved
response after restart. Stale/revoked/expired authority stops the actual owned
process. Network failures retain bytes while the independent guardian enforces
its existing deadline. Nothing here renews a lease, starts a job or reassigns one.
P14's cleanup/recovery receipts remain a separate server path, including after
terminal expiry; a full event spool cannot grant late evidence-write rights.

The server validates current credentials, attempt/lease/fence, accepted manifest,
contiguous sequence, duplicate identity and allowed observation ordering. Whole
batches fail atomically. A completed trial observation never produces PASS,
COMPLETED, cleanup confirmation or available capacity; P14/P17 own those decisions.
High-rate telemetry and evidence files do not travel on this event channel.
