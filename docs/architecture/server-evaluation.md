# Server evaluation workflow

This subsystem belongs to the [runner execution architecture](runner-execution.md)
and the [system architecture](../EngineeringSpec.md#3-system-architecture).
It covers accepting a completed attempt's sealed inputs, durable server evaluation,
retry policy and terminal result persistence. Simulator execution, cloud hosting,
runner qualification and comparisons have separate ownership. The newly authorized
rubric-authoring follow-up is covered by the linked judge design.

[Approved DBOS evaluation diagram](../diagrams/dbos-evaluation-architecture.svg) ·
[Editable Archify source](dbos-evaluation-architecture.json)

![Approved DBOS evaluation architecture](../diagrams/dbos-evaluation-architecture.svg)

## Current implementation status

The approved DBOS workflow, LLM judge, rubric authoring and Results/Timeline UI
are implemented locally in `codex/phase-17`, on merged P17.5
`8009ec18b03a0f01682ceb714f55b56ab66a6153`. They are not published or deployed.
Live model calls remain disabled in `config/llm-judge.toml`.

The human clarified on October 29, 2026: “our evals should be an llm judge not a
logical check”, then authorized the combined rubric/judge follow-up in this branch.
After reviewing the working editor, results table, direct timeline action and
from/to highlight, the human approved: “when thats done impelment for me, looks
good, i approved the plan”. This approves the shown application integration;
publication and deployment remain separate. See the
[approved judge design and implementation](proposals/llm-judge.md).

New rubric-aware publications select `llm-judge-v1`. Historical accepted v1 jobs
retain the old deterministic workflow and exact receipt semantics. The additive
rubric companion preserves existing concrete suite/check serialization and digests.
The current runner remains NON_EXECUTING / DISABLED / DECLARED; neither a live
model nor a normally admitted PX4 execution has been established by this work.

## Approval and implementation status

The human approved the queued backend design on **October 29, 2026**, in P17 chat
`01a18387-4715-7020-8ef1-3d2269654cd2`, turn
`01a1899e-2c03-7012-8b3f-a41114c4220c`, message
`01a1899e-2c3f-7cd0-bc50-fd7dee8623a1`:
“yea this good, when job finish run there kwill be a trigger evals ,d and what workflow are we usign ?”

Approved scope: durable PostgreSQL evaluation jobs; a bounded processing role in
the existing Python control-plane worker; authenticated sealed-input acceptance
and recoverable 202 acknowledgment; bounded retries/crash recovery; versioned
validation/evaluation; fenced atomic job/result/terminal-receipt persistence;
and the required confirmed-cleanup handoff from runner execution authority to a
server processing deadline. This supersedes the earlier synchronous P17 proposal.
The approved diagram retains its proposal-time labels; local implementation status
is recorded below.

Approval is for this backend design, not completed implementation, deployment,
publication, merge, execution qualification or the separately reviewed Results UI.
The backend and subsequently approved Results UI are implemented locally. The
current runner remains NON_EXECUTING / DISABLED / DECLARED.

## Trigger and workflow implementation

The trigger is a runner finalization submission after scenario execution,
acknowledged event delivery, evidence publication and confirmed owned-process
cleanup. Process exit alone does not enqueue a trusted passing evaluation, and
the browser does not trigger it.

Use **DBOS 3.4.0** in the existing Python control-plane worker, with system tables
in the same logical PostgreSQL database as application state. Backend orchestration
lives in `src/api/src/featherlane_api/workflows/`; domain evaluation and evidence
validation remain in their owning modules. No separate broker or orchestration
server is needed.

1. Authenticate current runner/project identity and validate the live lease/fence,
   frozen trial matrix/manifest, acknowledged final sequence and cleanup proof.
2. Seal inputs, create the application receipt and transactionally enqueue one
   DBOS workflow in the same SQL transaction. Return 202. Close runner writes;
   retain FINALIZING / NOT_EVALUATED until the server reaches a terminal decision.
3. DBOS schedules bounded worker execution and checkpoints step outcomes. Workflow
   payloads contain identifiers only. Application records hold immutable inputs.
4. Validate full bounded evidence bytes/digest/shape outside long database locks,
   then prepare immutable per-trial packets and invoke the frozen LLM rubric.
   Validate complete verdict coverage and supporting citations. Retries reuse
   the sealed inputs and any already accepted response.
5. A short transaction rechecks current cancellation, deadline, evidence bindings
   and terminal state before atomically committing results and a terminal receipt.
   Repeated delivery cannot replace a terminal result.

The human approved this DBOS approach and backend implementation on **October 29,
2026**, in chat `01a18387-4715-7020-8ef1-3d2269654cd2`, turn
`01a189aa-be93-7903-9ada-78df406ee0e3`, message
`01a189aa-bec2-71a2-aa12-23c864dd6d51`: “ok this is good, criteria createdion,
etc is creatred in other branch 17.5 but we're good to impelment, i agree with this
approach also in be we should have like /workflow folder under be or sth...”
This selects DBOS over the earlier custom queue proposal. Implementation is present locally; approval does not imply deployment. Original criteria authoring was merged from P17.5; the human subsequently assigned
the rubric/judge follow-up to this active P17 branch.

## Retry and deadline policy

Only explicitly transient processing failures retry. DBOS owns retry scheduling
and checkpoints; application state owns the overall processing deadline and safe
terminal diagnostics. Configure bounded step attempts and exponential backoff. A worker crash leaves recoverable durable work. A
failed criterion is a successful evaluation with outcome FAIL, and is not retried.
Missing/corrupt/invalid evidence remains inconclusive or a defined error; retrying
does not rerun a scenario or relax evidence requirements. Exhausted infrastructure
failures remain visible and never become PASS.

P17 adds an immutable `finalization_accepted_at` marker and receipt binding to the
merged lease code. Accepted, cleaned-up attempts use a 300-second server deadline,
and current runner mutation checks reject them. Never renew a runner execution
lease merely to keep background evaluation alive or exempt unconfirmed cleanup
from expiry. Preserve existing terminal immutability, cancellation ordering and
cleanup/capacity semantics. Maintenance expiry deadlines must continue while
bounded evaluation work runs, with separate session ownership.

DBOS steps permit four attempts with 1/2/4-second backoff for classified transient
database or provider failures; recovery is capped at five workflow attempts.
The new `judge-attempt-v1` workflow checkpoints prepare, invoke/validate and commit
steps using IDs only. Application tables hold immutable packets and accepted
responses. Historical `evaluate-attempt-v1` retains its original single step.
Commit revalidates full evidence bytes and current lifecycle authority. Exhaustion commits ERROR /
NOT_EVALUATED. Independent maintenance enforces the processing deadline even if
workflow recovery cannot finish.

## Artifact provenance and maintenance

The diagrams were generated with Archify from pinned merged P15 source and explicit
proposed-work references. Validate, deliver, strict check and browser-check passed;
the review rendering was inspected before approval. After approval the browser
export controls became unavailable. The maintained SVGs were extracted from their
validated rendered artifacts with embedded styles/fonts, then checked as
script-free XML with all nine semantic nodes retained. No new browser-export or
post-extraction perceptual verification is claimed. The JSON preserves the approved diagram content with repository formatting.

Keep this SVG, editable JSON and approval record together. Regenerable HTML,
delivery receipts and temporary review captures stay ignored locally. Remove
owned temporary review resources after the approved implementation is verified.
See [suite authoring](suite-authoring.md) for versioned criteria and
[events and live updates](events-live-updates.md) for the existing event transport.

## Engine references and operational limits

- [DBOS architecture](https://docs.dbos.dev/architecture)
- [Python steps and retry configuration](https://docs.dbos.dev/python/reference/decorators)
- [Transactional enqueue](https://docs.dbos.dev/python/reference/client)

The pinned SDK exposes `DBOSClient.enqueue_in_transaction`; async SQLAlchemy
bridges through `AsyncConnection.run_sync` on the caller's connection. Both schemas
must be in the same logical database. A single stable executor recovers pending
work on restart. Automatic distributed failover is not configured; it needs an
explicit coordination/deployment design. No paid service, cloud deployment or
simulation re-execution is authorized by this design.

## Local implementation and verification — October 29, 2026

P17 now builds on actual merged P16 `b50c20f99f2b2ac1d36bf82c413bdef5dbaeade5`.
The reviewed historical P16 overlay is no longer part of the P17 diff. Migration
`0017_finalization` follows actual `0016_private_evidence`; it stores sealed
inputs, immutable acceptance and terminal receipts and the cleanup handoff marker.
DBOS manages its own schema in the same database. No custom queue poller is added.

- `POST /api/v1/runner/attempts/{attemptId}/finalization` returns immutable 202
  acceptance. `GET` returns acceptance plus eventual terminal result. Both retain
  current machine authentication; replay grants no lease or evidence-write rights.
- Backend orchestration: `featherlane_api/workflows/`. Domain sealing and result
  persistence: `modules/finalization/`. Versioned rules and full evidence checks:
  `modules/evaluation/`. Authorized run detail reads project saved server results.
- Runner helpers persist operation/digest intent before submission, validate receipt
  identity, and recover status. They require actual local cleanup and canonical
  evidence; the current nonexecuting stand-in supplies no successful producer.
- Evidence observations bind all semantic fields exactly. Their enclosing artifact
  ID is assigned after content hashing, so finalization may add authorized artifact
  provenance links without requiring impossible self-references in uploaded bytes.
  Required diagnostic logs include a successful process exit. Unsupported PX4
  semantic evidence, missing data or corrupt bytes cannot pass.

Disposable seeded protocol checks exercised authenticated event ingestion and real
private artifact uploads, queued acceptance with the worker stopped, worker startup,
PASS, threshold FAIL and missing/tampered evidence INCONCLUSIVE. Replays preserve
acceptance and terminal state; invalid matrices, sequence/manifests, stale fences,
cleanup and artifact bindings reject; revoked credentials cannot replay receipts.
Cancellation ordering and sealed authority were exercised. A real PostgreSQL
serialization error (`40001`) was injected once in a disposable process: DBOS
retried the same attempt, then committed PASS once. This was a manual fault check,
not a new automated test. Migration upgrade/downgrade/no-drift, Ruff, generated
contracts, TypeScript and production build passed. Dependency audits reported no
known vulnerabilities in auditable packages; three local workspace packages have
no PyPI advisory identity. Build emits upstream MUI module-directive warnings.

Enqueue-failure rollback was checked: no receipt, handoff marker or workflow was
left behind. Lease expiry during validation rechecks the database clock and
rejects the handoff without queuing work. Framework-boundary exceptions are
sanitized outside exception handlers so checkpoints retain neither SQL parameters
nor chained private errors; the real serialization fault still retried twice
through this boundary.

These are synthetic/seeded protocol results. Mid-step process-kill recovery,
distributed failover, normal admitted positive runner execution and hosted
operation are not established. No automated tests were authored. These historical checks cover the original deterministic protocol baseline. The
new judge and UI verification is recorded below. No deployment, publication or
merge is claimed.

## Running the worker

Apply reviewed Alembic migrations, then start `flf-worker` with the same supported
process-scoped `FLF_API_*` database and artifact-root configuration as `flf-api`.
The worker initializes DBOS system tables before the API accepts new work. The
private artifact directory must be shared with the API under P16's ownership rules.
The API fails closed when required database state is unavailable.

```sh
uv run --no-env-file --frozen --package featherlane-control-plane flf-worker
uv run --no-env-file --frozen --package featherlane-control-plane flf-api
```

Run one worker per database: a PostgreSQL advisory lock protects the stable executor
identity. It listens only to `attempt-evaluation-v1`, with concurrency two; expiry
maintenance uses independent sessions every five seconds. `flf-worker --once`
runs maintenance only. The old `python -m featherlane_api.modules.leases.worker`
entry remains a compatibility alias. Restart the same executor/version to recover
its pending work. Changing workflow semantics requires a deliberate version and
in-flight migration decision, rather than silently reinterpreting frozen inputs.

## P19 nominal interface review — October 29, 2026

P19's proposed distinct PX4 suite/qualification family can preserve the existing
synthetic family by selecting on the existing `synthetic` boolean. This is a
compatibility review, not approval or implementation of that proposal. Preserve
old synthetic serialized bytes, suite/manifest digests, evaluator1 decisions and
receipt replay. Existing strict clients need an explicit contract/protocol
compatibility decision before receiving a new family.
Keep the existing concrete synthetic classes unchanged: P17.5 uses
`PublishedSuiteDefinition.model_fields`. A future catalog/read union is a separate
named consumer seam, not permission to turn that concrete class into a union.

The historical v1 P17 path cannot evaluate PX4: admission snapshots resolve
`SuiteRevisionView`, finalization accepts evaluator1, rules require SYNTHETIC and
MONOTONIC/count1 observations, and evidence validation deliberately rejects ULog
semantic support. The three check kinds can remain; removing these guards is not
a reviewed PX4 implementation.

Required decisions before dependent binding:

- Freeze the exact completion predicate in the qualified suite/handler/check and
  evaluator versions. For a short takeoff/land sequence, MISSION_COMPLETION must
  mean observed airborne progress followed by postflight landing and disarm. It
  cannot mean an uploaded mission completed when no mission was uploaded. Command
  acknowledgment or an initially unarmed ground state proves neither predicate.
  A final boolean needs the ordered supporting samples/windows in bound evidence;
  state their relationship to the current SINGLE_SAMPLE/count1 representation
  explicitly rather than silently changing evaluator1's sample semantics.
- Keep monotonic execution/watchdog deadlines distinct from simulation behavior
  durations. Evaluator1 currently accepts seconds from MONOTONIC only. Simulation
  intervals require a reviewed versioned interpretation, measured topic/sample
  boundaries and reset handling; a configured 1x factor is not clock proof.
- Bind each relevant observation and ULog to the same admitted trial/attempt,
  supervisor generation, expected and observed MAVLink identity, demonstrated
  PX4 session and simulation interval. P18 must demonstrate the actual identity
  and correlation method and its limits. Hash matching alone establishes content
  identity, not these semantics.
- Observed session identity is discovered during execution. Do not inject it into
  requested execution configuration or relax the exact requested/observed manifest
  comparison to accommodate it. Its reviewed evidence representation must be
  bound into sealed finalization inputs before acceptance, not added afterward.
- Generic observations and uploaded OBSERVATIONS are currently strict variants
  and a bare observation array. P19 must supply the exact typed representation
  for review across runner content reading, API content validation and P17 semantic
  evaluation. Do not slip optional fields or a dictionary envelope into that
  existing array, invent a fourth artifact kind, or require an observation file
  to contain its own server-assigned artifact ID. ULog bytes/topics/time/session
  validation remains an explicit missing implementation.
- Missing or untrustworthy session/evidence cannot become PASS. A trustworthy
  evaluated predicate being false can yield FAIL; command/process failure,
  cancellation and unexecuted work retain their separate lifecycle semantics.

The shared submission/receipt machinery remains applicable: exact payload intent,
authenticated immutable 202/status/terminal recovery, sealed runner authority,
database-owned deadline, current cancellation/fence/revocation guards and fresh
bounded integrity validation on repeated processing. Migration0017 follows actual
0016 and owns finalization receipts/handoff only; it adds no PX4 qualification
storage. Resolve P19's qualification migration from the actual merged head rather
than modifying or guessing a replacement0017.

A six-file hashed current-protocol checkpoint is recorded in the P17 handoff for
the concrete P19 preparation request. It is scoped to current contracts, runner
intent/recovery and migration reference. It is not a PX4 evaluator handoff, a
whole-phase freeze or a merged/deployed release. The original P17.5 authoring is merged; its rubric follow-up is now local in P17.

Subsequent source findings relayed by P18 through the master have not been
independently runtime-qualified by P17: pinned `sys_uuid` is the constant
`SIMULATIONID0000`; ULog HRT/optional UTC correlation is not an independent boot
nonce; lockstep HRT and Python monotonic are different clocks; the pinned MAVSDK
Position callbacks lack sample timestamps. Callback arrival alone therefore
cannot supply a simulation timestamp or boot identity. No demonstrated boot nonce
exists in the handoff. Keep P19's session schema pending an exact, measured
process-generation/clock/log provenance claim with explicit limits; do not fill a
strong-identity field with a random UUID, constant or inferred timestamp. This
review does not waive any admission/evidence requirement. P19 also owns mapping
the generated private logger path into the existing bounded closed-output policy;
fixed artifact names do not establish original-byte ownership or closure.

## Judge and UI verification

The additive `0017_llm_judge` migration follows `0017_finalization`. Immutable
published rubric companions bind exact check versions to the original definition
digest. `trial_judgments` holds frozen packet/prompt/model/config identities and
once-accepted structured responses. Rubric-aware editor, validation, publication
and suggestion routes are additive; old concrete wire models remain unchanged.
`GET /api/v1/runs/{runId}/judgments` returns authorized committed findings and
citations, without private packets or provider configuration.

Production instructions are in
[`judge_prompt.py`](../../src/api/src/featherlane_api/modules/evaluation/judge_prompt.py).
The request contains normalized validated observations, ordered bounded events,
artifact IDs/hashes and explicit gaps. Raw ULog/process logs, credentials and local
paths are not sent. The server checks evidence availability and citation integrity;
it does not replace an LLM verdict with a threshold score. Provider failure yields
an infrastructure error, not a failed criterion. Accepted verdicts are reused;
unknown provider completion after a timeout can still cause duplicate billing.

A disposable PostgreSQL17 database exercised migration upgrade/downgrade/re-upgrade
and no-drift checks, rubric validation/CAS/publication/replay, real authenticated
HTTP reads, sealed finalization and transactional DBOS enqueue. Three injected
structured responses produced saved PASS/FAIL/PASS trial outcomes. Re-invocation
skipped accepted responses; repeated processing preserved terminal bytes. Missing
required evidence could only be INCONCLUSIVE; duplicate criteria, invented event
IDs and out-of-trial references rejected. A real DBOS worker registered and ran the
new workflow against an already completed attempt without replacing its terminal
result. A fresh end-to-end provider invocation through DBOS was not exercised.

The actual application was exercised against this disposable backend: required
rubric feedback, explicit publication/read-only/next-draft, saved result table,
direct row-to-Timeline navigation, repetition selection, and saved failure-window
boundaries. The UI does not derive failure onset. Citation events outside the
currently loaded bounded event page show an explicit unavailable state. Isolated
preview suggestion/error states were manually reviewed; a live model suggestion
was not generated. No automated tests were authored.

Ruff lint/format, generated contract checks, TypeScript and production build pass.
Dependency audits and cleanup are summarized in the [phase handoff](../phases/handoffs/P17.md).
These are seeded synthetic protocol/UI checks with injected responses. Live model
quality, PX4 evidence semantics, process-kill recovery and distributed failover are
not established. Live activation requires an explicitly configured provider/model,
credentials and outbound evidence policy; the checked-in judge remains disabled.
