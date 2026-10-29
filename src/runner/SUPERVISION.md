# Local stand-in supervision

P14 adds a bounded local process exercise and cleanup protocol. It does not install
a normally admitted job executor. The existing CLI remains
`NON_EXECUTING / DISABLED / DECLARED`; no PX4, flight scenario, qualification,
passing result or managed infrastructure is introduced.

This is one local subsystem increment of the
[runner execution architecture](../../docs/architecture/runner-execution.md).
The guardian design was rendered before implementation. The new diagram remains
an unapproved, ignored review artifact. The separately approved
[cancellation usage architecture](../../docs/architecture/runner-cancellation-usage.md)
records the later usage extension. No deployment is introduced.

## Process and authority boundary

`Supervisor(StateStore, DiskBudget)` is a context manager that owns the existing
`runner.lock`. Do not nest it inside `StateStore.lock()`. The guardian inherits the
lock, runs separately from the network caller, and starts one fixed Python
stand-in in a new session/process group. The child receives no commands,
executables, endpoints or output paths from the server and creates no descendants.
This first implementation supports Darwin's kernel PID/UID/group/microsecond
birth identity. Other hosts fail before starting a process. The identity fields
follow the public [Darwin process-info definition](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h).
These trusted local processes share an OS user; this is not a customer-code
sandbox or a managed guest isolation implementation.

Execution intent is fsynced before launch; the child waits on a pipe until its
precise identity is durable. Parent EOF, watchdog expiry or an explicit stop causes
TERM, a two-second grace period, then KILL of the exact unreaped direct child's
group, with a further two-second exit wait. A child already reaped is never signaled
again. The guardian confirms group absence before reporting cleanup. The caller's
`stop()` waits at most six seconds for the guardian and returns actual stored
flags; unconfirmed cleanup remains unconfirmed. Slow or failed local storage is
not a hard real-time guarantee.

`SupervisedLease` is an explicit local stand-in harness, not a normal job loop.
It consumes the reviewed P13 `LeaseGrant` policy 2 and `LeaseWindow`, anchors the
deadline at request dispatch and subtracts the ten-second stopping margin. The
server's remaining TTL already includes the fixed 300-second assignment limit,
credential expiry and cancellation cap. Delayed responses, duplicate heartbeat
receipts and saved grants cannot reset those clocks. A callback for an older
attempt cannot renew a later child. Independent guardian expiry continues while
the network caller is blocked.

## Consumer interface

Use the exact frozen source packet reported in the P14 handoff, not mutable files
from another checkout. Call these methods inside the same supervisor context.

| Export                                                    | Meaning                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start_standin(attempt_id, *, stop_at_monotonic) -> Path` | Local diagnostic exercise only. Deadline must already include the stopping margin. Returns the dedicated output directory; this does not mean its files are closed.                                                                                                                         |
| `update_deadline(*, stop_at_monotonic)`                   | Guardian accepts an update only while its previous deadline remains live. No expired child restarts.                                                                                                                                                                                        |
| `stop(reason) -> StopResult`                              | Accepts canonical `StopReason`, including `EVIDENCE_BUFFER_FULL`. Child and group exit are independently recorded. Bind a callback to its active attempt; do not reuse it for a later assignment.                                                                                           |
| `usage_snapshot() -> AttemptUsageObservation`             | Reads the durable guardian interval and P14-only storage snapshots. Missing data stays null; this does not renew a lease or calculate cost.                                                                                                                                                 |
| `snapshot() -> StopResult \| None`                        | Reads local evidence, with no network renewal or server lifecycle authority.                                                                                                                                                                                                                |
| `recover() -> StopResult`                                 | Explicit orphan recovery. A private authenticated socket asks the owned child to stop itself. No saved PID/name is signaled. Uncertain identity/group exit continues to block another child.                                                                                                |
| `closed_output() -> ClosedOutput`                         | Requires confirmed exit/cleanup and verifies the sealed directory identity plus each file's inode, size and SHA-256 against the durable record.                                                                                                                                             |
| `remove_closed_output(closed=None)`                       | P14-owned original removal, including a previous `ClosedOutput` handle after another attempt. Revalidates ownership/bytes before restoring directory write permission, records removal intent, and releases the reservation only after actual removal. Retry completes interrupted removal. |

`StopResult` is a frozen local dataclass with `attempt_id`, `generation`, `reason`,
`process_exited`, `group_exited`, `cleanup_confirmed` and nullable `exit_code`.
`ClosedOutput` contains that result, its exact local directory and a tuple of
`ClosedFileRecord(name, device, inode, size_bytes, sha256)`. These are local file
evidence, not duplicate server DTOs. Readonly permissions alone never prove exit
or closure. Consumers retain safe no-follow, regular-file, owner, single-link and
before/after descriptor checks while reading; they must not chmod/delete originals
or release their reservations after an upload acknowledgment.

Unconfirmed execution records block both `start_standin` and the real protocol
journal's next claim request. A local used-attempt marker prevents starting the
same attempt again after cleanup/restart. `ProtocolJournal.record_recovery()`
clears old assignment intent only after a matching explicit server recovery receipt
and matching local cleanup. A late receipt replay cannot erase a later pending
claim ID. Startup records without a precise child identity require operator
investigation; recovery does not guess a process or blindly delete the record.

## Bounded output and shared accounting

The fixed child writes only `standin.txt`, at most 128 bytes of supervision
diagnostics. Its stdout/stderr go to DEVNULL. These bytes are **not** canonical
OBSERVATIONS, a ULog, a redacted flight log or verified domain evidence.

The exact P15 `disk-budget-v2` common source first lands with P14. Before creating
the child, the supervisor calls
`reserve("p14-" + generation, attempt_id, "EVIDENCE", 128)` on the one configured
`DiskBudget`. The reservation parent stays 0700; its nested output directory
becomes 0500 and its file 0400 after confirmed exit. This uses two contents within
the four-content bound. The default managed logical budget is 500 MiB:
64 MiB events, 435 MiB evidence and 1 MiB accounting, with at most 32 reservations.
The ledger has its own short nonblocking lock, distinct from `runner.lock`.

Original files remain charged after cleanup, network failure and upload. Copies,
redaction and upload staging need separate worst-case reservations while both
exist; direct streaming does not transfer ownership of the original reservation.
Only explicit P14 removal releases its charge. Missing/crashed directories do not
auto-expire reservations. The ledger records logical staging bytes, not physical
filesystem quotas or a whole-host limit. Identity/process journals, closed-output
records, replay markers and uncontrolled host output are outside this allowance.
General child output requires a separately reviewed bounded writer; it cannot be
substituted for this fixed stand-in.

## Server cancellation and recovery

The existing authenticated, membership/CSRF-protected cancel route now persists
active cancellation intent and an initial 30-second deadline, without saying the
child stopped. Repeated requests preserve that deadline. It locks runner, run,
then attempt, as do P13 writes and cleanup. Renewal is capped at the persisted
deadline. The shared expiry worker commits `ERROR / CANCELLATION_UNCONFIRMED`
when that deadline wins, or `ERROR / LEASE_EXPIRED` for an earlier lease/assignment
expiry, and sets `NEEDS_CLEANUP`. Completion committed first remains terminal.

Canonical models and paths are in `featherlane_contracts.cleanup`:

- `POST /api/v1/runner/attempts/{attemptId}/cleanup`: authenticated current
  runner/project/attempt/lease/fence, an operation ID, bounded stop reason and
  child/group/cleanup flags. Confirmed cancellation before expiry becomes
  CANCELED/NOT_EVALUATED. Other stand-in stops become ERROR/NOT_EVALUATED, never
  COMPLETED/PASS. Unconfirmed cleanup requires NEEDS_CLEANUP.
- After expiry, the same last fencing identity may submit **cleanup diagnostics
  only**; no new events, observations, artifacts, lease or terminal changes are
  granted. Old terminal attempts remain immutable. Exact authenticated operation
  replays return the stored acknowledgment; changed requests conflict. Revoked
  credentials cannot recover receipts.
- `POST /api/v1/runner/recovery`: requires the latest confirmed cleanup receipt for
  the exact highest-fenced terminal attempt, no active attempt and NEEDS_CLEANUP.
  It clears capacity to **DISABLED** and stores an idempotent receipt, without
  changing the old outcome or establishing execution qualification. A newer
  unconfirmed cleanup supersedes an older confirmation for recovery purposes.

`RunnerTransport.attempt_cleanup()` and `recover_execution()` use those canonical
paths/models and the existing pinned-origin, bounded transport. Callers retain
the exact operation ID and request for retries. There is no automatic admitted
execution/cleanup-retry loop added to the idle CLI. Finalization/evaluation,
normal admission qualification, events and evidence transport retain their
assigned phase ownership.

## Cancellation usage observations

The optional canonical cleanup usage field accepts `usage_snapshot()` after stop.
The request, including its observation timestamps, must remain identical under a
retried operation ID. It is stored atomically with the cleanup receipt and returned
in that receipt and the membership-protected run-detail attempt summary. Reports
are append-only; a cumulative counter is never added again on retry or recovery.
Legacy callers may omit usage without changing their existing request fingerprint.

A guardian clock sidecar records generation/session, observed launch, last monotonic
counter and observed exit. The final sample occurs before output sealing. Recovery
never subtracts UTC/server timestamps across a restart: it preserves the last known
lower bound, which can be zero if the guardian dies before its final sample. Missing
clock state means unavailable/null. Only startup/final samples are persisted; no
continuous host/resource meter or automatic network reporting loop is added.

Logical reserved and retained bytes cover only the P14-owned 128-byte output
allowance. Open/unreadable retained bytes stay unknown; explicit original removal
permits zero snapshots. Metadata sidecars remain outside that output allowance.
The summary exposes latest observation and greatest known cumulative elapsed value
with its operation provenance. Actual cost status is UNAVAILABLE, amount/currency
are null. Pricing, monetary budgets, billing and provider reconciliation stay later.
