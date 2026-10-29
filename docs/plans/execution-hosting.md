# Execution hosting: cloud by default, customer machines optional

Status: product direction and shown architecture design approved; revised shown application UI approved October 29, 2026. Deployment execution and new cross-phase increments remain separately gated. Updated October 29, 2026.

## Human decision and precedence

In P08 chat `01a18386-c91e-73a1-884d-1813348a238b`, turn `01a18572-acc6-7383-9585-0512677b3c39`, human message `01a18573-0d7e-7a31-869c-3d665d5ed5f1` requests: “support both. Cloud workers on our side by default, and users can connect their own machine if they want” and asks for design, implementation and deployment plans before building.

This replaces the original customer-execution-only product boundary. That initial request authorized the plan and isolated preview. The subsequent architecture and shown-UI approvals below permit the dispatched P08 identity/enrollment/health implementation, now prepared locally for phase review. They do not authorize publishing, paid cloud resources, credential configuration changes or external deployment. The master owns registry updates and dispatch; proposed follow-ups below are not dispatched by this document.

## Architecture approval

Human approval in P08 chat `01a18386-c91e-73a1-884d-1813348a238b`, October 29, 2026: “ok i approve to architecture design approve”.

Approved design: cloud execution by default, optional customer execution, trusted controller outside the disposable simulation guest, common evidence/evaluation path, existing DDD-oriented modular monolith, and the yellow-marked P08 identity/enrollment/health boundary shown in the architecture diagram. This records architecture design approval only. The revised shown UI was separately approved October 29, 2026 (“ok good , i approve the UI”); only dispatched P08 scope proceeds; later cloud increments require master dispatch, and publication/paid resources/deployment require their own scoped approvals. Do not ask again for approval of this unchanged architecture.

## Product behavior

|                        | FeatherLane cloud — default                                                                           | Your machine — optional                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Customer setup         | Browser plus a supported runnable build uploaded privately                                            | Install the supported simulator/runtime and runner locally, approve local build/profile, enroll with one-use project grant |
| Who supplies compute   | FeatherLaneFlight                                                                                     | Customer, on a workstation or their own server/VM                                                                          |
| Who installs simulator | We bake and qualify a pinned execution image                                                          | Customer follows our exercised setup guide and runs local doctor checks                                                    |
| Build location         | Immutable private artifact, staged into an isolated execution guest                                   | Executable stays on the selected machine; server stores bounded declarations/digests                                       |
| Data sent to service   | Supported executable bundle, bounded metadata and allowed evidence                                    | Metadata and policy-permitted evidence; local execution is not an offline-only product                                     |
| Selection              | Choose compatible managed profile/pool; no individual cloud worker enrollment                         | Choose an explicitly connected, compatible machine                                                                         |
| Charges                | Internal metering and hard allowances first; paid pricing/checkout is a separate reviewed deliverable | No FeatherLane cloud-compute charge; any platform subscription remains a business decision                                 |

Both modes use one run lifecycle, manifest/evaluation model and results UI. Mode is chosen explicitly per run, defaulting to managed. Never silently switch a cloud job onto a customer machine, upload its local build, or switch a local job to paid compute. Mode changes reset incompatible selections and require a new review. The first release supports only qualified PX4/SIH quadrotor builds; ordinary aircraft firmware binaries, arbitrary Docker images, scripts, source archives, GPU/vision workloads and real aircraft are outside this plan.

## Domain boundaries and maintainable code

Retain the existing DDD-oriented modular monolith and inward dependency direction in EngineeringSpec §§4–5. Domain rules remain independent of HTTP, SQLAlchemy, cloud-provider APIs and MAVSDK. Application services own use cases and transactions; concrete adapters handle persistence, cloud lifecycle and simulator control. Add interfaces where a real adapter boundary needs them; do not introduce a generic repository framework, empty future modules, or a microservice for each domain.

The API and maintenance entry points reuse the same domain/application operations. The maintenance loop schedules bounded, retryable work; it does not duplicate authorization or run-state policy. Runner identity/health, run lifecycle, evaluation and retention stay with their owning modules. Cloud provisioning and PX4 control remain behind their respective adapters.

Maintenance is a responsibility, not a new business domain. Keep one small control-plane maintenance process when lease expiry, retryable finalization and retention require work without incoming requests. P08 health is derived from the last accepted heartbeat and its age; grant and credential expiry are enforced at the request boundary, so P08 needs no new periodic worker just to mark a machine offline. The later cloud reaper must still recover orphaned VMs when an attempt controller fails; its lifecycle and permissions must preserve that recovery property.

## Architecture and trust boundaries

The maintained [runner execution subsystem page](../architecture/runner-execution.md) records approval, scope, responsibilities and implementation status, with links back to the parent system architecture.

[View the architecture diagram](../diagrams/runner-execution-architecture.svg). Cloud execution is the default branch; customer execution is explicitly optional. Yellow markers and P08 sublabels identify this phase’s partial scope: enrollment/health UI, identity/health API, runner/grant records, and runner credentials/idle heartbeats. Simulator installation/execution, cloud provisioning and the local installer belong to later work. This is proposed design, not a map of deployed infrastructure.

![Approved architecture: cloud workers by default, customer machines optional](../diagrams/runner-execution-architecture.svg)

The editable Archify source is [Architecture source](../architecture/runner-execution-architecture.json). The vector export is a documentation artifact, not a temporary review capture.

Three background responsibilities have different jobs: the planned control-plane maintenance worker expires leases/finalizes records; the runner/controller performs a test; an infrastructure reconciler provisions and reaps disposable cloud machines. Keep these responsibilities explicit and initially in the existing Python modular monolith/process boundaries. PostgreSQL remains the queue; do not introduce Kubernetes, another broker, or a general remote command service for this first delivery.

The trusted cloud controller runs outside the guest containing customer code. It owns the durable project-bound runner identity, claim/lease and infrastructure lifecycle. A managed pool is shared capacity policy, not a global runner credential with access to every project. Each assignment resolves to an authorized project-bound execution identity and one attempt. The guest cannot list queues, mint grants, receive database credentials, access other tenants' artifacts, or call provisioning APIs.

The disposable guest contains our fixed scenario adapter, the pinned runtime and the customer's validated PX4 SITL build. It receives immutable attempt inputs and an expiring channel limited to that attempt's evidence. Treat guest data as untrusted even if a VM is isolated: verify sizes, digests, event sequence, expected evidence, lease and fencing server-side. Compromise of a guest must not yield a reusable runner identity. Uploaded flight software can fabricate observations; managed hosting is not proof of honest physics, safety certification or independent attestation.

Use a fresh VM and scratch volume for each attempt initially. Do not execute customer code inside the web/API/maintenance process or merely place multiple tenants in sibling processes on a shared app host. No customer-code guest gets an instance role or reusable cloud secret; restrict network routes and metadata access before executing it. The external controller can terminate the VM when the guest is wedged or disconnected. A separate reconciler reaps resources after controller failure. Do not mark cleanup complete until process/VM termination and scratch cleanup are confirmed. Unknown termination remains unavailable/cleanup-required, never a freed slot by assumption.

Simulator control is identical in both modes: a fixed approved launch profile starts the PX4 process, MAVSDK issues supported mission/control operations over a local MAVLink endpoint, and scenario handlers collect observations. SIH physics lives inside PX4; MAVSDK controls the simulated vehicle, not SIH's internal physics bus. Networked MAVLink endpoints and real hardware remain excluded. Exact SDK/PX4 versions stay pinned by qualification; documentation examples do not authorize upgrading dependencies.

## Managed run sequence

1. Upload a specifically supported Linux SITL bundle through a new bounded input-ingest API. Stream to private quarantine, enforce byte/project limits, validate full digest and bundle contents, reject traversal/symlinks/unexpected executable roles and unsupported platform/runtime. A malware scan is not a sandbox and must never execute the upload on the API host. Publish immutable verified metadata only after validation.
2. Resolve the build and qualified managed profile; admission checks membership, capability evidence, quota and cloud allowance. Freeze hosting mode, pool/profile revision, build digest and maximum runtime. UI review explains that this mode uploads the build. Unsupported builds remain rejected; no arbitrary download URL or shell argument is accepted.
3. Allocate one project-bound assignment with the existing atomic claim/lease/fencing semantics. Cloud capacity is reserved before starting a VM. Bind the immutable assignment to exactly one attempt and instance; retries recover that assignment rather than launching a duplicate.
4. Provision from the approved image; deliver the single attempt's inputs through the narrow channel. The guest rechecks the build/profile digests, reports observed manifest and starts only after the startup gate. STARTING includes provisioning; no new parallel run-state vocabulary is required just to represent VM startup.
5. The scenario adapter commands the simulated aircraft and produces events/telemetry/ULog. Server evaluation uses verified required evidence. Cancellation sets intent; the controller stops the guest, and the API waits for confirmed cleanup. Missing evidence yields infrastructure error/inconclusive per existing rules, never an invented pass.
6. Finalize immutable evidence and outcome, close the usage interval idempotently, confirm instance/volume cleanup and release capacity. Keep terminal receipts recoverable after lost responses without reopening writes.

## Customer-hosted sequence

Install the qualified local runtime and runner; configure local allowlists; run doctor; create the ten-minute one-use project grant in the website; paste it into an interactive private prompt. The runner persists its generated credential and enrollment request ID before exchange, uses owner-only secure storage, and recovers a lost response by retry or `/runner/me`. No credential in shell arguments, URLs or diagnostics.

The enrolled runner sends outbound HTTPS heartbeats and P09 declarations. Project members select it explicitly. The runner resolves already approved local inputs, claims its eligible work, controls its local PX4 simulator, and uploads only evidence allowed by local policy. It must reject a suite requiring blocked evidence. Availability never implies verified scenario capability. Customer setup must say which OS/architecture is actually qualified; no promise that every laptop is supported.

## Contract and ownership seams

These are design requirements, not new DTOs or promised helper signatures. Add them to canonical Python models at their assigned implementation checkpoint, then regenerate browser SDK/validators/query options. No duplicate handwritten wire models.

- Preserve the producer's frozen `registration.py` models (`BuildDeclaration`, `LocalProfileDeclaration`, and the registered integration profile unions). Current checkpoint: P09 `p09-registration-v2`, verified SHA256 `3476292abe8a6852803d18b88d9a331ec47cb7c175c0d40d0a2cdf0f153462fb`; historical `cc1156c080bfa83c998067e9a59a044c59e93aba4cac6eae0f2501a70193d1a4` is superseded and preserved as earlier evidence. PX4 profiles explicitly require `runtimeFamily=PX4`; separate synthetic profiles require `SYNTHETIC`/`FAKE` without PX4/MAVSDK/vehicle claims. Validate the discriminated `RegisteredIntegrationProfileSpec/View` unions with Pydantic `TypeAdapter`. `runtimeFamily` contributes to canonical identity/digest. Build metadata remains PX4-only; local declarations retain exact profile ID/digest binding. Registration remains DECLARED; synthetic metadata does not establish qualification, execution or worker availability. No schema was copied into P08 by this plan. Once the P08 design/implementation gate is met, consume the reviewed frozen canonical contract packet without waiting for the whole P09 merge: exact `registration.py`, only required canonical dependencies, and required export wiring. Preserve newer unrelated exports when integrating with actual main. P09 remains the canonical producer; its registration application/persistence/lookups/migrations stay out of P08 unless separately needed and authorized. P08 may include these required shared contracts in its reviewed submission. Publication order remains P08 → P09 → P10, each with individual human approval and no stacked PRs; P09 integrates the actual merged P08 transport/source.
- P09's existing `ExecutionTarget` means OS/architecture, not hosting mode. Reuse it for platform compatibility. Introduce separately named hosting selection only when implementing it; do not overload or redefine that type.
- P08 owns project-bound identity, revocation, versions, heartbeat transport and declaration references. Reads must compose in the caller's transaction. Existing `AccessStore.require_project` remains the human enrollment/revocation boundary; P07.5's people-administration policy is not a new runner role.
- P09 owns detailed immutable registration/digest/local-resolution semantics. Its current `RegisterBuildRequest` requires a local runner declaration. Keep that path intact; a managed input artifact needs a separate bounded ingest/registration extension, not a fake runner declaration, speculative local path, or temporary auth bypass.
- New managed selection must distinguish a pool policy from an enrolled machine. Preserve requested pool/mode in the requested manifest, and actual runner/image/instance provenance in the observed manifest. Authorization remains project-scoped even when infrastructure capacity is shared.
- P12/P13 own admission/assignment. Guest evidence capabilities are attempt-scoped and cannot replace durable runner auth. P14 owns stop/recovery; the cloud adapter must have an external hard-stop/reaper proof. P16's evidence transport does not automatically authorize executable input ingestion.
- P18/P19 own actual host/scenario qualification. A managed image, local declaration or successful upload cannot set VERIFIED. Cross-mode comparisons require compatible observed fingerprints and clock/simulator/configuration provenance; matching labels alone is insufficient.

## UI design to review before implementation

The revised isolated preview at `http://127.0.0.1:4280/` contains customer experience, architecture and deployment views. All runtime statuses are explicitly samples.

- Keep the current shared theme, shell and navigation. Runners page presents a managed cloud section first, with an explanation that the simulator is provided, plus optional connected machines below. Cloud customers never see a grant as a required setup step.
- New Run starts with **FeatherLane cloud** selected; **Your machine** is an explicit alternative. Show only compatible builds/profiles/suites. Changing location resets dependent selections.
- Cloud review identifies the private uploaded build, selected runtime, runtime limit and project allowance. Self-hosted review identifies the chosen machine and evidence policy. Shared Start/queued/detail/cancel behavior follows existing approvals only where unchanged; materially revised New Run scope gets its own shown preview approval.
- Cloud full: leave selected mode unchanged and explain queue/capacity or quota. Never automatically select a customer laptop. Missing cloud build: link to the managed build-registration workflow. Offline machine, unsupported platform, loading/error and uncertain submission have explicit blocked/recovery states.
- Connect machine remains an optional dialog with clear installation prerequisites, grant copy-once and recovery states. Local paths and credentials stay hidden from health views.
- Product pages show customer-relevant usage/availability, not cloud credentials, VM consoles or provisioning controls. Operator fleet controls are separate from tenant UI.

## Small delivery increments and impact on existing phases

Retain completed phases and existing review evidence. Master assigns final IDs/dependencies; suffixes here are proposed scope labels, not automatically created chats. Do not absorb managed provisioning, uploads, billing and release into P08.

| Increment        | Scope                                                                                                                                | Evidence required before successor                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| P08 revised      | Common runner identity/health, optional customer enrollment, management-owned identity policy; approved revised Runners presentation | Grant/recovery/revocation/version/heartbeat checks; UI approval; no job execution                                                          |
| P08.5 proposed   | Hosting selection/pool catalog and approved execution-choice UI; hide unavailable managed execution until ready                      | Default managed selection, explicit local choice, no silent fallback, protected project scoping                                            |
| P09 existing     | Local immutable build/profile registrations and frozen canonical types                                                               | Existing local digest/declaration acceptance; retain producer ownership                                                                    |
| P09.5 proposed   | Private managed build ingestion and immutable registration linked to qualified target; approved upload UI                            | Truncated/corrupt/oversized/unsupported input rejected; immutable private artifact; no upload execution                                    |
| P10–P17 adjusted | Existing suite, queue, claim, supervision, events, evidence and evaluation gates exercised with both adapters/fake environments      | No tenant leakage, duplicate assignment or incompatible-mode admission; failure/cleanup evidence                                           |
| P18 adjusted     | Qualify one pinned Linux CPU PX4/SIH target for managed use; qualify any advertised self-hosted target independently                 | Measured host/runtime compatibility; nominal capabilities still await P19                                                                  |
| P18.5 proposed   | Reproducible execution image and disposable-guest isolation/lifecycle adapter                                                        | External hard-stop, denied metadata/control-plane access, resource isolation and volume cleanup; real provisioning needs separate approval |
| P18.6 proposed   | Trusted pool allocator/controller and reaper connected to canonical leases and guest channel                                         | Provisioning timeout, controller crash, stale guest, idempotent launch and orphan cleanup demonstrated                                     |
| P19–P22 adjusted | Nominal/fault scenarios and comparisons through qualified managed and advertised local paths                                         | Actual scenario evidence per mode; no blanket cross-platform qualification                                                                 |
| P23.5 proposed   | Usage ledger, per-project runtime/concurrency/storage allowances and operator cost limits                                            | Idempotent accounting, cutoff on limit, queue time distinguished from execution, reconciled orphan cost                                    |
| P24 adjusted     | Dual-mode private-pilot candidate, rehearsed deployment/rollback packet and onboarding                                               | Both documented user paths exercised; dependency/security checks and user-owned release checks listed accurately                           |

Paid subscriptions, rates, checkout, invoicing/tax and automatic overage are a separate product scope. Initial pilot admission uses an operator-approved capped allowance; there is no automatic charge. User-requested new automated tests remain user-owned. Each increment manually verifies behavior and runs relevant existing checks; test requirements do not authorize agent-written suites.

## Deployment proposal

[View the deployment diagram](../diagrams/runner-execution-deployment.svg). Trusted application services, the disposable execution guest, private data services and customer-owned compute have separate boundaries. The rollout below describes the local → approved staging → capped pilot sequence and rollback gate.

![Proposed deployment: trusted cloud services and isolated execution guests](../diagrams/runner-execution-deployment.svg)

Editable source: [Deployment source](../architecture/runner-execution-deployment.json).

Proposed initial provider: **AWS in one chosen region**, pending region/account/budget and deployment approval. Use one provider initially to keep identity, private networking and teardown auditable. This is a recommendation, not a claim of provisioned resources or a price estimate. An existing provider may replace it only after proving equivalent guest isolation, lifecycle control and supported host compatibility.

| Component                         | Proposed first deployment                                                                                                                 | Release property                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Web + API                         | Existing Vite build and FastAPI behind a single HTTPS ingress; static web served from the web container, `/api` and `/auth` routed to API | Exact canonical origin, real Google callback, CSRF/session settings; generated client matches schema digest                         |
| API / maintenance                 | Separate app containers, initially on a small trusted EC2 application host                                                                | Simulator/customer binaries never execute here; least-privilege service roles; health checks and bounded DB pools                   |
| Database                          | Private managed PostgreSQL (RDS), backed up, restricted to trusted services                                                               | Reviewed Alembic migrations, restore rehearsal, no public database                                                                  |
| Private storage                   | Separate private S3 namespaces for input quarantine, verified builds and evidence                                                         | API authorizes opaque IDs; bounded uploads; full hash verification and immutable publication; no public build URLs                  |
| Trusted cloud controller + reaper | Trusted process/service with narrow instance lifecycle permissions and project-bound runner access                                        | Provider permissions never reach customer guest; durable assignment and cleanup ledger                                              |
| Execution                         | Pinned Linux CPU AMI; a fresh sandbox VM per attempt; no inbound MAVLink/SSH                                                              | Preinstalled runtime; no instance role/reusable credentials; restricted egress; bounded time/disk/processes; delete scratch storage |
| Configuration                     | Existing secret-injection approach for trusted services; no committed secrets                                                             | Separate dev/staging/pilot settings; guest receives only single-attempt capability, no Google/DB/cloud keys                         |

S3 is storage behind an application transport boundary. Do not expose presigned URLs by default or treat them as one-use; if selected later, preserve final verification, expiry and immutable-key policy. Existing P16 API-mediated evidence behavior remains the baseline.

### Deployment sequence after approved design and implementation

1. **Local development:** fake cloud provisioner and fake runner exercise both selection paths without cloud spend. Qualify the pinned Linux simulator environment separately. Produces interface/lifecycle evidence, not cloud-readiness claims.
2. **Reproducible artifacts:** frozen pnpm/uv setup, regenerated contracts, web/API/maintenance/controller packages, reviewed migrations and an image recipe pinned by digest. Build the executable environment and prove expected telemetry/ULog/cleanup with a reference build. Snapshot the release inputs.
3. **Staging infrastructure proposal:** present exact account/region, resources, network/IAM, deployment actions, cost estimate from current selected SKUs, spend ceiling, retention and teardown plan. Obtain human approval before creating paid resources or changing callback/credentials. Prices and provider choices are verified again at this gate.
4. **Approved staging deployment:** create private database/storage/network and ingress; back up then migrate; deploy API/maintenance, register the HTTPS origin/callback with separately authorized identity changes, provision one bounded execution slot. Run end-to-end reference nominal/cancel/timeout/network-loss/orphan-cleanup paths and optional self-hosted connection. Confirm no secrets or tenant artifacts leak into guests/logs.
5. **Private pilot:** only after real capability/evidence qualification and complete release gates. One region, approved customer group, explicit build limits, low concurrency and hard runtime/storage/spend allowances. Start on-demand guest capacity at zero; bounded provisioning cold-start is visible as STARTING. A warm pool/automatic scale-out is later, not assumed free or ready.
6. **Observe and roll back:** monitor queue age, provisioning failures, lease expiry, cancellation-to-exit latency, orphan count, artifact failures and usage discrepancies. To roll back, disable new managed admission, drain/cancel attempts with confirmed teardown, keep evidence readable and deploy the previous compatible app/image. Never change protocol under an active attempt or reverse a destructive migration blindly. Decommission leftover guests/volumes after confirmed stop.

## Usage, costs and open release decisions

Record attempt IDs, provision/start/stop/termination timestamps, allocated resources and cleanup status idempotently. Keep provider resource cost, any future customer-billable interval, storage and transfer as separate quantities. Queue time is shown separately. Infrastructure failures and cleanup overruns need an explicit billing policy; never infer one from the provider invoice. Hard concurrency/runtime limits apply at admission and infrastructure reconciliation, not merely a budget alert.

Before staging approval, select: provider account/region and data residency; measured vCPU/RAM/disk footprint and supported build bundle; spend ceiling and allowances; retention/backups; alert owner and incident access. Before paid public use, separately agree on rates, quote/consent UI, failure/refund policy and billing implementation. These decisions do not block the present local design review.

## Design acceptance and limits

Review the rendered customer experience, architecture and deployment sequence together. Approval of this design authorizes only its named next increment; other expanded UI and external actions keep their own gates. P08 implements runner enrollment and health only. Managed upload, simulation execution and cloud provisioning remain later work; this plan does not purchase or configure a provider.

Local UI samples cannot establish simulator qualification, resource cost, production isolation or reliability. Final release requires actual dual-path evidence, reviewed infrastructure isolation and the specified user-owned automated release checks.

## Primary references checked October 28, 2026

- [PX4 SIH documentation](https://docs.px4.io/main/en/sim_sih/): architectural rationale for a headless SIH runtime; actual version/vehicle qualification remains required.
- [MAVSDK Python guide](https://mavsdk.mavlink.io/main/en/python/quickstart.html): local simulated-vehicle command/telemetry boundary; use our qualified pinned API rather than copying current-main examples.
- [EC2 AMIs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AMIs.html): image/region/architecture constraints behind the proposed baked execution environment.
- [EC2 security practices](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-best-practices.html) and [metadata options](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-options.html): provider capabilities supporting the proposed least-privilege/metadata boundary; our sandbox policy must be implemented and verified.
- [S3 presigned access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html): reusable-until-expiry/overwrite behavior; supports retaining explicit immutable publication and API authorization rather than assuming signed URLs are one-use grants.
