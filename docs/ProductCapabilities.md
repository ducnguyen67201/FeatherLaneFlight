# FeatherLaneFlight product capabilities

Status: proposed product requirements, documentation only. Updated October 28, 2026.

This plan translates the five developer cases into user-facing capabilities and acceptance criteria. It complements the [engineering specification](EngineeringSpec.md), which remains the canonical owner of architecture, contracts, execution states, and the first PX4 integration. It does not authorize application scaffolding, new automated tests, or feature implementation.

## Capability

**Help an engineer turn a difficult flight condition into a repeatable regression test, then compare software releases with evidence.**

An engineer should be able to choose a supported system, define the condition and required response, verify that the condition actually occurred, inspect the outcome, and reuse the same test on the next release. A later incident workflow should connect this evidence to the original field problem and subsequent physical validation.

The first useful promise is narrower than recreating arbitrary flights: **see whether a software change handles a defined failure condition differently, and inspect the evidence.**

## Research to feature mapping

| Evidence                                                                                         | Product capability                                                               | Intended customer benefit                                                                      |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Phoenix Wings: an omitted controller-reconnection sequence reached flight trials.                | Failure and recovery scenario builder, reusable cases, and requirement coverage. | Preserve difficult operational sequences as tests that run again on future releases.           |
| Malloy Aeronautics: the simulated aircraft differed from the real aircraft's dynamics.           | Test configuration checks and model qualification evidence.                      | Make the tested configuration and model limitations visible before interpreting a result.      |
| Zipline: a physical test exposed a controls interaction that engineers reproduced and corrected. | Field incident to regression workflow.                                           | Keep the original problem, reproduction, fix, and validation evidence connected.               |
| Skydio: cloud behavior disrupted mission connectivity while onboard autonomy continued working.  | Integrated mission fault testing.                                                | Evaluate the useful mission outcome across application, communication, and service boundaries. |
| Lucid Bots: existing Isaac Sim regression workflows reduce risky field iteration.                | Connect existing simulators and compare releases consistently.                   | Improve evaluation and evidence handling without requiring the team to replace its simulator.  |

These cases establish problems and existing engineering work, not customer endorsement of FeatherLaneFlight or proof that it would have prevented the incidents. See the [research dossier](DroneTestingPainResearch.md) for dates, sources, and evidence limits.

## 1. Failure and recovery scenario builder

**User workflow:** select a supported mission and integration, choose a disturbance and its triggering event, define required recovery and forbidden behavior, then save a versioned test package. Each requirement links to a check and its evidence needs. The package lists which mission phases and configured failure sequences it covers.

**What the user receives:** a readable scenario definition, declared compatibility, expected behavior, timing limits, and a run timeline showing the disturbance request, observed effect, and response. Reusable cases can be added to a release suite without rewriting their rules.

**Acceptance criteria for manual review:**

- A reviewer can identify the trigger, disturbance, expected response, limits, and required observations before a run starts.
- An unsupported disturbance cannot be launched as a supported test. A request being accepted is distinct from confirming its effect.
- A run cannot pass the scenario without the required disturbance evidence. Inconclusive checks and execution failures remain distinguishable from behavioral failures.
- Coverage means coverage of the explicitly defined requirements and scenarios. It does not claim coverage of every possible flight condition.

**First release:** one qualified simulated GNSS-fix-loss scenario plus the nominal scenario, using the existing bounded handlers and immutable suite revisions. The required fallback is selected and qualified before testing, rather than inferred from the candidate's response.

**Later:** controller reconnection, communication recovery, motor faults, and combinations of conditions require their own qualified mechanisms. A Phoenix Wings-inspired scenario is a product requirement, not a claim that the initial integration can execute it.

## 2. Test configuration checks and model qualification

**User workflow:** select the aircraft/simulator profile, inspect what configuration it represents, and review its evidence and limitations. Before execution, the platform checks the observed setup against the selected profile. Before comparison, it explains configuration differences.

**What the user receives:** exact build, simulator, vehicle, sensor, configuration, and evaluation versions; capability evidence; mismatch explanations; and, later, model-versus-flight correlation evidence for a stated operating envelope.

**Acceptance criteria for manual review:**

- An unintended startup configuration change is rejected according to the profile rules rather than silently accepted.
- Changing physics, sensors, or the vehicle model does not receive a default software-regression verdict against an unrelated baseline.
- A verified integration or file digest is presented as evidence of compatibility or integrity, not proof of accurate real-world dynamics.
- Where physical correlation is unavailable, the profile clearly states that limitation. Model approval is scoped to the measured configuration and conditions.

**First release:** use the planned integration profiles, requested/observed manifests, configuration fingerprints, and comparison eligibility rules.

**Later:** add measured flight/bench correlation and model qualification records through an explicit contract amendment. Useful evidence may include response timing and tracking differences under specified maneuvers. Qualification criteria and acceptable error bounds require the customer's aircraft expertise; the product must not invent a universal accuracy score.

## 3. Field incident to regression workflow

**User workflow:** record the observed problem and link permitted evidence, mark the event of interest, state a reproduction hypothesis, and author a scenario with supported controls. Run that scenario, inspect whether the relevant behavior was reproduced, compare a proposed fix, and link subsequent physical validation.

**What the user receives:** a traceable chain from original incident to scenario revision, reproduction evidence, candidate comparison, and validation references. An engineer can retain the scenario in a release suite after resolving the incident.

**Acceptance criteria for manual review:**

- The original observations and the engineer's reproduction hypothesis remain distinguishable.
- Attaching a log does not mark a failure reproduced. Reproduction requires the configured checks and supporting observations.
- The user can distinguish replaying recorded observations from a closed-loop simulation in which the candidate's actions change subsequent observations.
- Missing simulator capabilities or insufficient evidence remain visible; the workflow does not fabricate an equivalent scenario.

**First release:** an engineer may manually create a supported scenario from an incident using existing suite authoring. Dedicated incident records, external-log import, event annotation, and physical-validation links are later capabilities with new contract requirements.

**Boundary:** no promise of automatic reconstruction or exact deterministic replay from arbitrary flight logs. Physical validation is recorded as evidence supplied by the customer; FeatherLaneFlight does not control the physical aircraft.

## 4. Evidence-backed release comparison

**User workflow:** choose a compatible baseline and candidate, run the same suite, inspect changed requirements and timelines, and assemble an engineering evidence report.

**What the user receives:** check outcomes, mission completion, interventions, fallback behavior, task-output quality where supported, constraint violations, trial counts, configuration differences, and links to the underlying observations. These measures remain separate rather than being collapsed into an unexplained readiness score.

**Acceptance criteria for manual review:**

- A changed requirement outcome is visible with its observations, units, limits, and relevant timing.
- An infrastructure error, absent disturbance, or missing evidence is never summarized as successful drone behavior.
- Incompatible or incomplete runs can be inspected, but do not receive the default regression verdict.
- The report shows the tested conditions and sample counts. Repeated fixed-seed runs do not imply independent Monte Carlo evidence or broad reliability.
- Expired or unavailable artifacts are visible. Historical summaries do not imply that supporting evidence is still accessible.

**First release:** the planned run-detail and comparison screens, canonical check outcomes, and evidence views provide the core. A downloadable report is a follow-on surface over those same records, not a separate evaluator.

**Boundary:** engineers own release and field-test decisions. Passing these checks establishes the stated requirements in the tested conditions, not certification or general deployment safety.

## 5. Integrated mission fault testing

**User workflow:** extend a qualified mission integration with supported network, application, or service faults. Place the disturbance on the mission timeline, define useful mission output and recovery requirements, and inspect both aircraft behavior and service behavior.

**What the user receives:** aligned evidence showing whether a communication/service degradation occurred, whether the vehicle followed its expected fallback, and whether the overall task remained useful. For a suitably instrumented system, a video or service requirement can fail while flight-control checks pass.

**Acceptance criteria for manual review:**

- Each fault identifies its owner, application boundary, observed effect, reset behavior, and clock.
- Time-based checks use identified clocks and session/boot boundaries; cloud uptime and simulated flight time are not treated as interchangeable.
- Side effects remain within approved customer execution profiles and qualified components.
- Missing service telemetry or an unsupported fault mechanism cannot be hidden by a passing flight-control check.

**Later scope:** separate qualified integrations are needed for network interruption, latency, cloud/service state, application delays, and radio behavior. A cloud timer-overflow case requires controlled instrumentation or a test implementation of that component; accelerating a flight simulator is not an equivalent test.

**Boundary:** neither SIH nor the generic runner automatically models radio interference, long-lived cloud software, or every sensor failure. The control plane does not send arbitrary shell commands or gain general access to customer services.

## 6. Connect existing simulators and development workflows

**User workflow:** register a supported local integration, declare its capabilities, connect the customer's application and simulator through approved profiles, then run suites and compare results with the common evaluation engine. Later, a scoped CI identity could request evaluations during the team's release process.

**What the user receives:** one evaluation workflow around tools they already use, with visible compatibility, evidence, and supported condition variations. A future rendered integration could add image/sensor evaluation without changing the meaning of unrelated mission checks.

**Acceptance criteria for manual review:**

- Observations and actions have documented units, coordinate frames, timestamps, command ownership, and reset semantics.
- A connector exposes only capabilities that have been qualified in that specific environment.
- Reusing a metric across adapters requires documented equivalent meaning. Different environments do not automatically become eligible release comparisons.
- Existing customer source and model weights remain within the chosen execution environment and its artifact policy.

**First release:** one customer-operated PX4/SIH profile. It has no rendered camera scene and does not establish perception, realistic collision, or weather performance.

**Later:** qualify one richer integration with a customer, potentially an existing Isaac Sim environment. Its GPU/runtime, sensor models, application inputs/outputs, and lifecycle require separate validation. ArduPilot, manufacturer SDKs, CI identities, parallel execution, and managed hosting are distinct extensions, not implied compatibility.

## Best first deliverable

**Run a verified failure scenario and compare two releases with evidence.**

1. Select the qualified PX4/SIH profile, approved build, and versioned GNSS-loss scenario.
2. Review the predefined fallback requirement, timing limits, and required evidence.
3. Run the baseline and candidate under compatible conditions on the customer's runner.
4. Confirm simulated GNSS fix loss from the required coherent observations, then inspect the configured response.
5. Review changed checks, evidence, trial counts, and configuration eligibility side by side.

For example, a candidate that misses the predefined fallback requirement produces a failed check with its timeline, while an execution or evidence problem is reported separately. This first deliverable exercises scenario definition, configuration checks, fault confirmation, and release comparison without promising all five research cases at once.

The qualification sequence in the engineering specification remains authoritative: establish nominal behavior, verify the disturbance unarmed, then admit an airborne simulation only after its response and cleanup are qualified. The initial profile remains single-runner, sequential, 1x, and fixed-seed.

## Shared implementation contract

- **Actors:** customer engineer authors and inspects; project owner manages project access; the customer execution-machine owner locally approves execution profiles; the runner executes within that local policy; the API evaluates validated observations. Later reviewers assess marketplace assets independently.
- **Surfaces:** extend the planned Test suites, New run, Run detail, and Compare surfaces. Dedicated incident and physical-correlation views are later additions.
- **Records and views:** reuse `IntegrationProfile`, `SuiteRevision`, `Run`, `Trial`, `CheckResult`, `Artifact`, and `ComparisonView` as planned. Incident links, external imports, model-correlation evidence, service components, and marketplace records require explicit canonical contract updates.
- **States:** retain the engineering specification's execution and evaluation vocabulary. Do not create a second set of statuses in a feature-specific UI. Unsupported admission, runtime capability errors, inconclusive checks, and behavioral failures have different meanings.
- **Trust and ownership:** customer observations support engineering decisions; byte verification does not establish independent physical truth. Existing tenant, credential, lease, privacy, retention, and artifact boundaries continue to apply.
- **Operations:** explain admission failures, configuration drift, missing fault evidence, cleanup failures, and unavailable artifacts. Capture the relevant event timeline without exposing secrets or unrelated customer material.

## Marketplace extension

After useful private testing exists, an author could prepare a versioned test package or selected dataset for sale through the separate workflow in the [product vision](../README.md#product-vision). Compatibility, provenance, quality, and selling permissions are reviewed before listing. Drone-performance evaluation and dataset/listing eligibility remain separate assessments. Publishing does not modify original run evidence or make a private incident public automatically.

## Decisions and handoff

**Fixed for the first release:** customer-operated simulation, one qualified PX4/SIH integration, one verified disturbance, immutable evidence and suite revisions, canonical outcome semantics, and compatible release comparisons.

**Open before later integrations:** which customer's incident or rendered simulator to support first; exact control/observation access; model-correlation criteria; permitted imported formats and retention; service-fault boundaries; and whether a customer has paid demand for the broader workflow. Pricing and marketplace revenue shares remain unvalidated.

The first deliverable is ready for product/UI design against the existing engineering specification, with technical qualification still required before implementation claims. Incident import, physical model qualification, cloud/network faults, rendered simulators, managed execution, and marketplace features need scoped contract and integration review before implementation.

## Source references

- [Phoenix Wings AAIB report, October 2025](https://assets.publishing.service.gov.uk/media/68e39d938c1db6022d0ca11c/UAS_PW_Orca_reg_n_a_10-25.pdf) — omitted controller-reconnection scenario.
- [Malloy Aeronautics AAIB report, February 2025](https://assets.publishing.service.gov.uk/media/67a0a96ee04de3153316a3ca/Malloy_Aeronautics_T005_UAS_reg_n-a_02-25.pdf) — model/dynamics mismatch and configuration management.
- [Zipline engineering account, October 2025](https://www.zipline.com/newsroom/inside-how-zipline-tests-and-improves-safety-systems) — physical-test finding, reproduction, and layered validation.
- [Skydio postmortem, May 2026](https://www.skydio.com/blog/post-incident-review-for-degraded-connectivity-may-2026) — cloud timing and end-to-end mission effects.
- [Lucid Bots publication, August 2025](https://www.lucidbots.com/blog/lucid-bots-and-nvidia-riding-the-next-industrial-revolution) — existing simulation and regression workflow.

The features above are product proposals inferred from these sources, not capabilities endorsed by the named developers.
