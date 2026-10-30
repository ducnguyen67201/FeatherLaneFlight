# LLM judge evaluation — revised proposal

Status: approved and implemented locally in the P17 branch; live provider disabled,
not published or deployed. On October 29, 2026 the human authorized the combined
rubric/judge work: “ok then we should fix that, then in this branch we’re gonna
fix17.5 as well and will have pr in similar branch”. After the working UI revisions,
the human approved: “when thats done impelment for me, looks good, i approved the
plan”. Approval covers the shown rubric editor, results table, independent reason
expansion, direct Timeline action and saved from/to highlight. It does not authorize
publication or live paid calls. Historical evaluator1 records and the six-file
protocol checkpoint remain unchanged.

## Criterion authoring in P17.5

Each published criterion needs a frozen rubric: stable ID/version, title,
requirement, PASS condition, FAIL condition, INCONCLUSIVE condition and required
evidence. Include the relevant scenario/repetition scope, units, clock and any
explicit threshold/time window. The authoring AI suggests all fields; a person
reviews and explicitly publishes them. It does not judge the run or publish its
own suggestions. Initial supported criterion kinds remain the existing three.

The additive canonical rubric companion supplies passWhen/failWhen through
generated clients, the manual editor and structured suggestion output. It binds
to the existing published definition digest without changing old concrete check
serialization. The companion has its own digest and engine identity. Old synthetic classes, old byte serialization and replay stay valid.
P17.5 PR24 is merged at actual main `8009ec18b03a0f01682ceb714f55b56ab66a6153`,
and has been safely integrated into this branch. Its owner is retired. The direct
human instruction assigns this combined rubric/judge follow-up to the active P17
branch; it does not reopen the retired chat or authorize a live model call.

## Inputs and prompt

The server prepares a bounded immutable judge packet after existing authorization,
manifest/trial/sequence and full evidence integrity checks. It contains mission
requirements, frozen published rubric, ordered events, normalized observations,
valid artifact IDs/digests, and explicit evidence gaps or
omissions. Store packet digest, prompt version/hash, rubric versions, provider,
model and packet normalization version before invoking the judge. Credentials, local
paths and unrelated artifacts never enter the prompt.

The production instructions are in
[`judge_prompt.py`](../../../src/api/src/featherlane_api/modules/evaluation/judge_prompt.py);
[the original prompt review](llm-judge-system-prompt.md) remains historical context.
A single request may judge all supported criteria for one trial; it must return
exactly one structured result per expected criterion, with PASS/FAIL/INCONCLUSIVE,
a short finding, and supplied event/artifact/time references. There is no request
for hidden reasoning or a chain of thought. Raw ULog bytes are not text evidence:
unsupported decoding/session/clock semantics remain explicit gaps, not model
inferences or aircraft qualification.

## Workflow and authority

Retain authenticated acceptance, immutable operation/input identity and atomic DBOS
enqueue. The implemented `judge-attempt-v1` workflow has three durable steps:
prepare-judge-packets-v1 (including evidence validation), invoke-validate-judge-v1,
and commit-judge-results-v1. The existing v1 workflow sequence remains unchanged.

The LLM supplies the criterion verdict. Server code validates schema, complete
criterion/version coverage, locator membership, and required evidence availability;
it does not recompute the criterion using the old logical threshold check. An
invalid reference, missing evidence, model refusal or insufficient context cannot
become PASS. Model unavailability is an infrastructure error, never a failed
criterion. Existing cancellation/deadline/fence/revocation guards still own the
terminal lifecycle decision. Run outcome folds the stored criterion verdicts;
it does not ask another model to reinterpret them.

Use an idempotent stored judge response before final commit. Completed response
recovery uses the same packet, prompt and model identity. Transient network/rate
limit/provider errors may retry with bounded backoff; FAIL and INCONCLUSIVE do not
trigger a retry for a more favorable verdict. A timeout/crash after a provider
accepted the request may cause another billed invocation unless the chosen
provider proves request idempotency; product result commit remains idempotent.
Set call/token/cost and overall deadline limits. No remote calls or paid checks
are authorized by preparation of this proposal.

Keep DBOS checkpoint payloads to IDs/digests; application records hold packet and
validated judge response. Cache hits never bypass current commit guards. Even
with pinned versions/model settings, LLM verdict reproducibility is not guaranteed;
persist the actual accepted response and never overwrite it on receipt replay.

## Provider and deployment boundary

Reuse merged P17.5's provider/config conventions, with a separate
judge configuration and versioned prompt. Provider/model choice, credentials,
retention, allowed outbound evidence and live activation remain explicit setup
items. No additional orchestrator is needed. The worker has a disabled outbound
model-service connection; the deployment review shows it as unconfigured. A different provider would require an explicit adapter/configuration change;
no provider is implied deployed.

## Required coordinated work after review

The active P17 branch owns judge invocation, response validation, domain
storage/versioning, DBOS integration and the newly authorized rubric editor and
suggestion changes. The original P17.5 implementation remains the merged baseline.
P19 supplies measured PX4 evidence/session semantics; an LLM cannot fill unknown
boot/clock/ULog facts. The approved Results table renders stored findings and references, with direct
Timeline navigation and saved failure-window highlighting. New schema migrations follow actual merged head;
no phase number or unmerged snapshot is treated as an automatic dependency gate.

## Minimal compatibility structure for implementation

Keep existing concrete published suite/check/draft models and their legacy wire
serialization unchanged. The editor reuses existing title, expected (shown as
Requirement), inconclusiveWhen and requiredEvidenceKinds. The additional passWhen
and failWhen conditions form a separately versioned rubric companion, bound to
check ID/version and the frozen published definition digest. Scope, units, limits
and clocks come from the admitted scenario/check/manifest rather than duplicate
unbound fields. New LLM runs seal both definition and rubric identities; historical
v1 runs retain their original decision engine. New rubric-aware save/publish
operations must atomically freeze the companion with the existing explicit
publication path and preserve draft compare-and-swap and reauthorization. The additive canonical types live in `featherlane_contracts/judging.py`. New
operations use `/draft/judge`, `/draft/judge/validate`, `/judge-revisions` and
`/draft/judge/criteria-suggestions`; legacy routes retain their previous models.
Publication freezes the companion atomically with the original definition.

[Approved direction: workflow diagram](../../diagrams/llm-judge-architecture.svg) ·
[Deployment boundary](../../diagrams/llm-judge-deployment.svg)

Editable sources: [workflow](../llm-judge-architecture.json) and
[deployment](../llm-judge-deployment.json). The approved conceptual diagrams describe
the intended boundary, not deployed software. Their automated Archify gates passed;
no post-export perceptual claim is made.

## Review refinement: time ranges in findings

The human requested Results-to-Timeline navigation with from/to highlighting.
A judge citation may describe a bounded interval or a single event. Persist the
actual accepted citation, including attempt/trial, clock and explicit start/end
offsets when supplied. Validate ordering, trial/evidence bounds and referenced
source membership server-side. Distinguish a failure interval from a broader
evidence window. The UI only renders saved validated citations; it must not
calculate failure onset from thresholds, widen a point into an interval or infer
clock mappings. If a trustworthy interval is unavailable, retain the point or
explicit unavailable state. The implemented UI renders saved server citations. Manual verification used
injected judge responses with labelled synthetic evidence; no live model accuracy
is claimed. See [workflow status and verification](../server-evaluation.md).
