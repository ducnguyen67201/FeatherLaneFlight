# Criteria authoring and suggestion review

This is a child of the [suite-authoring architecture](suite-authoring.md), which
belongs to the [system architecture](../EngineeringSpec.md#3-system-architecture).
It covers the existing three synthetic criteria and browser review of suggested
changes. Evaluation, run outcomes, runner execution and deployment are outside
this subsystem.

[Approved authoring architecture (SVG)](../diagrams/criteria-authoring-architecture.svg)
· [Editable Archify source](criteria-authoring-architecture.json)

## Approval and status

On October 29, 2026, the human reviewed the working React/MUI preview and
architecture in P17.5 chat `01a189a6-a217-7773-88d9-192a6da62919`. After asking
whether criteria remain editable and receiving the supported-field explanation,
the human answered “ok that make sense yea” in turn
`01a189b0-3ba8-7750-b28c-1a6e4662d4a4`, message
`01a189b0-3bd8-7cc2-80f5-8559d7c7b5c9`. This records approval of the shown editor,
manual and reviewable-suggestion flows, and reuse of P11's versioned publication.
It does not approve a live provider, paid verification, publication or deployment.

The approved component code is integrated locally into the P11 editor. Manual
fields use the existing canonical draft and client; the OpenAI adapter and authenticated suggestion endpoints are implemented locally,
with live generation disabled until private credentials and activation are supplied.
Suggestion review was verified with explicitly labeled local fixture callbacks.
Neither fixture responses nor a passing TypeScript/build check constitute a live
model integration or real backend authorization verification.

The approved SVG and source preserve the design as reviewed, including its
proposed/fixture labels. Source evidence describes the pinned P15 base and the
existing extension seams; it does not claim the P17.5 additions existed there.
Regenerable HTML and delivery receipts remain ignored local artifacts. The
accessible SVG is the viewer's full-diagram dual-theme export.

## One draft and publication path

The three supported checks remain mission completion, landing/disarm and elapsed
duration. Users edit titles, outcome descriptions and missing-evidence descriptions.
The duration outcome description follows the explicit duration limit. Check IDs,
kinds, units, versions and evidence requirements remain fixed. P11's current
reference qualifier still requires its exact built-in inventory; text does not
create new measurements or executable rules.

The existing Save draft and Publish flow owns all persistence. Incomplete values
can remain in a draft; generated boundary validation rejects invalid supplied
values. Server-side validation, exact profile binding, qualification, revision
serialization, digest preconditions and immutable publication receipts remain
authoritative. Published suite revisions and run snapshots stay frozen.

## Suggestions are untrusted review input

Suggestions are held outside the draft. Canonical generated validators reject
unknown fields, unsupported kinds, invalid values and duplicate identifiers.
Identity, version, units and required evidence must match the current criterion.
Accept affects only that criterion; edit and reject do not persist a draft.

Every request captures the saved version, local content and a local edit counter.
Acceptance checks all three and repeats the version/counter check at the editor's
change boundary. Any intervening manual edit or reload invalidates old suggestions,
even if the user restores an earlier value. Accepting one reviewed item advances
the batch's expected edit counter so the remaining items can still be reviewed.
Pending save/publication, conflicts and access loss retain the P11 guards.

## OpenAI authoring boundary

[OpenAI boundary (SVG)](../diagrams/criteria-openai-architecture.svg) ·
[Editable Archify source](criteria-openai-architecture.json)

The human selected OpenAI in message
`01a189b1-0d33-7fc2-8f47-e7ae1f5081f2`. In response to the concrete backend
implementation/data-flow approval question, message
`01a189b8-5065-7241-adb4-8083b7f7d1c8` directed: “use 6.1 sol, for this , create
like a config, do not put them in env , so ists fast”. The provider design was
revised and rendered before backend implementation. Approved implementation scope
is the described suggestion-only flow with `gpt-6.1-sol` and project file settings;
this does not authorize agent-run paid verification, credential creation or
deployment. The official [model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
confirms the model identifier, structured outputs and low reasoning support.

The existing FastAPI process makes one synchronous Responses request after
explicit Suggest activation. It sends only the entered description and generic
supported-check instructions/schema. It holds no database transaction during
external I/O, then rechecks access and saved version before returning a validated
review draft. No run outcome or evidence comes from the model.

[Project TOML configuration](../../config/criteria-generation.toml) owns the
provider/model, low reasoning effort, standard service, timeout, output-token limit
and API-process concurrency limit. It is loaded once; changing it requires an API
restart. A private key-file reference keeps credentials outside tracked settings,
environment variables and browser code. Live generation defaults off. File-based
settings simplify configuration; they do not establish model latency or account
availability.

The HTTP adapter requests no tools, no automatic retries and `store: false`.
Canonical Pydantic definitions generate the structured-output schema and validate
the returned draft. The browser consumes generated client/types/validators.
`store: false` is a response-storage request, not a claim of zero retention under
all provider policies. Requests are bounded to 30 seconds, 2,048 output tokens and
64 KiB of response bytes; process-local admission is not a cluster quota or an
account spending cap.

The adapter, real PostgreSQL authorization/version boundary and application client
were manually exercised with local response fixtures. No live model request,
credential file, migration, new worker, store or deployment was created. P17 owns
queued evaluation, finalization and results. P17.5 consumes no P16/P17/P19 source;
the P19 coexistence proposal was reviewed read-only with exact hunk boundaries
reported to master. See the [phase handoff](../phases/handoffs/P17.5.md) for the
current checks and limits.

## A definition exists before execution

A criterion is saved configuration, not an observation or a verdict. For example,
this complete canonical check describes a rule before any run happens:

```json
{
  "id": "duration",
  "version": 1,
  "kind": "METRIC_THRESHOLD",
  "title": "Mission duration",
  "unit": "s",
  "threshold": 8,
  "expected": "Synthetic mission duration is at most 8 seconds.",
  "requiredEvidenceKinds": ["OBSERVATIONS"],
  "inconclusiveWhen": "Duration or clock observation is missing."
}
```

The browser can display that rule immediately. P11 publication additionally runs
its bounded synthetic reference qualification; that is not a test of a customer
flight build. A queued run freezes its selected build identity/digest and suite
revision/checks. Later observations supply measured values and evidence; P17's
evaluator owns the eventual verdict. Illustratively, 7.2 seconds meets the rule,
9 seconds fails it, and missing/invalid required evidence is inconclusive.

A code change changes the build under test; it does not automatically become a
new criterion. A new measurement needs a reviewed producer/adapter and evaluator
support. The current synthetic runner consumes explicitly precomputed synthetic
input data and does not establish real PX4 flight execution. Real PX4 provenance,
telemetry and mission execution remain separate P17/P18/P19 integration work.
