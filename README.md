# FeatherLaneFlight

**Mission testing and evaluation for drone autonomy.**

FeatherLaneFlight is a proposed developer platform from Feather Lane AI for running repeatable drone mission tests, introducing controlled disturbances, and comparing behavior across software releases. It aims to help engineering teams reproduce failures, investigate regressions, and assemble evidence for release decisions and physical flight testing.

**Status:** Product concept with phase implementation underway. The [phase registry](docs/phases/registry.json) records active and accepted work. The capabilities below remain intended scope until their implementation and verification are accepted.

The [engineering specification](docs/EngineeringSpec.md) maps the planned UI, design tokens, API contracts, authentication, runner protocol, and first PX4 integration. It includes architecture diagrams and an implementation sequence. The contract/client and UI foundations are implemented; P03's approved Runs workflow is implemented locally with mock transport and awaits completed-phase review. Live control-plane and simulator execution remain planned.

The proposed stack is React/TypeScript with MUI and TanStack Query, a Python/FastAPI control plane, and a Python runner. The [design system guide](DESIGN.md) defines shared layouts and the manual review sequence; [design-tokens.json](design-tokens.json) supplies exact visual values for the shared MUI theme. UI UX Pro Max is installed locally for design guidance. Canonical Pydantic contracts generate the browser SDK and runtime validators; the API and runner import the same Python models. The specification defines validation, contract drift checks, and version negotiation before implementation.

The [delivery plan](docs/DeliveryPlan.md) breaks the first PX4/SIH workflow into 24 small-to-medium phases, with UI approval gates and checkpoints for the mock demo, fake-runner workflow, real simulation, and private pilot candidate.

The [phase implementation plans](docs/phases/README.md) and [chat registry](docs/phases/registry.json) support one implementation chat per phase, with a master coordinator reviewing handoffs and dispatching the next ready phase. Phase chats use GPT-6.1 Sol with High reasoning; UI approval remains a human gate.

After explicit approval of each completed phase for submission, the master pushes its phase branch and opens a PR in [ducnguyen67201/FeatherLaneFlight](https://github.com/ducnguyen67201/FeatherLaneFlight). The user retains the merge decision; dependent phases normally wait for the preceding PR to merge.

## Repository layout

Application code lives in `src/api/`, `src/web/`, and the planned `src/runner/`. Shared contracts are grouped in [packages/contracts](packages/contracts/README.md): Python is the canonical source, `schemas/` holds generated OpenAPI/version metadata, and `typescript/` holds the browser client and runtime validators. The generated schema and client directories are ignored build artifacts; canonical sources, generator configuration, handwritten client policy, fixtures, and lockfiles are tracked. Web fixtures and MSW handlers live in `src/web/mocks/`.

From the workspace root, run `pnpm install --frozen-lockfile`, then `pnpm setup:workspace` to install frozen Python dependencies and generate contracts. Run `pnpm contracts:check`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` afterward. Typecheck and build explicitly regenerate contracts before consuming them, so they work when generated directories are absent. `contracts:check` requires local output from setup/generation and compares it with a fresh temporary generation without rewriting it. Builds and future deployment builds generate from the pinned local sources; no running API is required. Future development commands must generate before loading contract imports. See the [client guide](packages/contracts/typescript/README.md) for generation and usage. The approved P02 theme and dashboard shell are implemented in `src/web/`. Run `pnpm dev` and open <http://127.0.0.1:4200/> to inspect the mock Runs workflow. The web build is emitted to `src/web/dist/`; development/build commands regenerate the ignored MSW worker. The current web entry starts local mocks before rendering; no live jobs or PX4 processes run. See the [web guide](src/web/README.md).

## The problem

A drone can pass component tests while its complete mission still fails. Perception, navigation, flight control, communications, configuration, and the environment interact in ways that isolated checks may miss. A release may improve typical performance while making a particular lighting condition, aircraft configuration, or recovery path worse.

Existing autopilot test suites and simulators provide substantial foundations. The opportunity to validate is whether teams need a better way to connect those tools, reproduce field incidents, score mission outcomes, and compare the evidence between releases.

## Intended users

The initial audience is engineering teams developing autonomous inspection drones, particularly teams that control their own autonomy application and its integration with a flight stack such as PX4. Potential users include drone manufacturers, autonomy developers, and sensor or payload integrators.

The first integration should follow a real customer's testing workflow. Supporting a flight stack establishes technical compatibility; customer demand and distribution still need validation.

## Product vision

FeatherLaneFlight's vision is a private testing and evaluation workspace where drone engineering teams **turn difficult flight conditions and observed failures into reusable regression tests, then compare releases with evidence**. Teams should be able to define failure and recovery scenarios, inspect the tested configuration and model limitations, connect incidents to repeatable tests, evaluate the integrated mission, and use supported simulation tools they already have.

The longer-term vision adds managed evaluation and an optional marketplace where creators can license selected test packages or datasets to other teams. The same evaluation workflow should support customer-operated and later managed runs, with separate review of anything prepared for sale.

| Offering                                   | Intended purpose                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reusable test packages                     | Versioned missions, environments, disturbances, evaluation criteria, and evidence requirements that customers can run against their own systems. Packages declare supported flight stacks, simulators, vehicle and sensor configurations, and reproduction requirements. |
| Evaluation platform and managed evaluation | A shared engine scores mission performance, records evidence, and compares releases. Customers initially execute through their own runner; a later managed service could run supported workloads on their behalf using the same evaluation rules.                        |
| Optional marketplace                       | Creators can offer reusable test packages and separately packaged datasets. Buyers license an eligible dataset or run a compatible test package against their own system. Marketplace publishing is separate from private testing.                                       |

The intended product loop is: identify a difficult condition or field incident, choose or create a test package, verify the supported test configuration, run the evaluation, inspect evidence and compare releases, retain the scenario for future regression checks, and optionally prepare selected assets for sale. A generated dataset and the test package that produced it are separate products; offering one does not automatically offer the other.

Runs and artifacts are private by default. After reviewing results, an authorized creator could choose **Prepare data for sale**, select the material to include, document its source and intended use, confirm the rights to sell the included material, and submit a listing for review. Test-package authors could separately prepare their packages for sale. Only an explicitly approved publication would become available to marketplace buyers. Private source code, model weights, customer locations, and unrelated run evidence are not automatically included. Publishing would create a versioned listing rather than change the original run record or override its artifact policy.

Two assessments serve different purposes:

- **System evaluation** measures the tested drone's mission performance, interventions, fallback behavior, output quality, and constraint violations.
- **Marketplace review** assesses an asset's completeness, provenance, documentation, labels, supported configurations, reproduction evidence where applicable, and selling permissions. Simulated and physical recordings must be identified accurately. A failed mission can produce useful data; a passing mission does not by itself establish dataset usefulness or listing eligibility. Marketplace approval is not certification of a drone or a guarantee of real-world performance.

Proposed revenue streams are platform subscriptions, managed evaluation or execution fees, and marketplace commissions with a share of sales paid to creators. Prices, revenue shares, licensing options, and demand remain to be validated. Creator-supplied assets could reduce upfront collection spending, while compatibility checks, quality review, storage, compute, and support still have costs.

The first implementation remains the customer-operated testing workflow described below and in the engineering specification. Managed execution, sale preparation, marketplace review, payments, and public listings are later scope. Begin marketplace validation with a small curated set of assets requested by actual buyers; expand contributor access after demonstrating useful reuse and repeat purchasing. Existing run artifacts are not presumed suitable for training or sale, and richer sensor datasets require separately supported capture and export paths.

### Capabilities behind the vision

Six capabilities support this vision. The [product capability plan](docs/ProductCapabilities.md) maps the developer research to user workflows, acceptance criteria, and integration boundaries.

| Capability                                            | User value                                                                                        | Delivery boundary                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Failure and recovery scenario builder                 | Define a triggering condition, disturbance, expected response, and reusable checks.               | Start with verified GNSS fix loss; additional fault and recovery sequences need qualified support.       |
| Test configuration checks and model qualification     | See exactly what aircraft/simulator configuration was tested and what evidence supports it.       | Configuration checks first; measured model-versus-flight qualification later.                            |
| Field incident to regression workflow                 | Connect an observed problem to a reproduction scenario, fix, and validation evidence.             | Manual scenario authoring first; incident records and external-log import later.                         |
| Evidence-backed release comparison                    | Inspect changed requirements, timelines, trial counts, and compatible baseline/candidate results. | Core run-detail and comparison workflow; downloadable reports follow the same evidence model.            |
| Integrated mission fault testing                      | Evaluate useful mission outcomes across application, communication, and service boundaries.       | Later qualified integrations for each fault mechanism and component.                                     |
| Connect existing simulators and development workflows | Use a common evaluation workflow around the customer's supported tools.                           | One PX4/SIH profile first; rendered simulators, other stacks, and CI identities are separate extensions. |

The first deliverable is a verified GNSS-loss baseline-versus-candidate comparison on the customer's runner. It establishes the shared workflow without claiming to reproduce every researched incident or replace physical validation.

## Proposed workflow

1. **Connect the system under test.** Identify the autonomy application, autopilot build, dependencies, settings, vehicle model, sensors, and simulator.
2. **Define the mission and requirements.** Specify starting conditions, completion criteria, output quality, operating limits, and expected fallback behavior.
3. **Select test scenarios.** Include nominal conditions and supported disturbances, such as positioning loss, communication delay, changed lighting, or delayed inference.
4. **Run repeated trials.** Execute the candidate and baseline against comparable scenarios while recording versions, configurations, timing, and random seeds where applicable.
5. **Verify and collect evidence.** Confirm that requested disturbances actually occurred, then capture synchronized telemetry, application events, simulator state, and available recordings.
6. **Evaluate and compare.** Report failed requirements, affected conditions, and differences between releases, with evidence that developers can use to investigate.

Example: during an inspection mission, the operator connection becomes unavailable. The test checks whether the configured fallback occurs, whether the aircraft stays within the defined constraints, and whether the inspection finishes. A correct abort and a completed inspection are separate outcomes.

## Shared engine and supported adapters

The proposed design separates reusable evaluation work from system-specific integrations.

| Layer                    | Responsibility                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Shared evaluation engine | Scenario execution, trial scheduling, evidence collection, scoring, release comparisons, and reports.                                |
| Integration adapters     | Starting and resetting supported systems, issuing commands, reading observations and telemetry, and applying supported disturbances. |
| Mission rules            | Customer-defined completion criteria, output-quality checks, intervention metrics, fallback expectations, and constraints.           |

Adapters would connect the customer's application runtime, flight stack, simulator, and relevant disturbance mechanisms. Each integration must declare and verify its capabilities. A common interface does not make every aircraft, command, or failure mode interchangeable.

Faults belong at different boundaries: environmental changes in the simulator, communication problems in the network, application delays in the runtime, and supported sensor or system faults in the simulator or autopilot. Sending an injection command successfully is insufficient evidence that the intended fault took effect.

## Initial product direction

- A customer-operated runner that executes tests in the customer's development or CI environment, keeping proprietary applications and model weights within that environment.
- One supported PX4 software-in-the-loop integration, one simulator, and one representative vehicle configuration, selected with an initial customer.
- Explicit onboarding for a runnable autonomy application and its inputs, outputs, timing, dependencies, and configuration.
- A small set of verified scenarios, configurable mission checks, recorded artifacts, and baseline-versus-candidate comparisons.

PX4 is a proposed starting integration, not a universal drone protocol. ArduPilot and manufacturer SDK integrations could be evaluated later against customer demand and available interfaces. Software-in-the-loop tests require an appropriate simulator build; firmware compiled for a physical controller needs a corresponding simulation build or a hardware-based test path.

## Evaluation principles

- Measure mission completion, usable task output, human interventions, fallback behavior, and constraint violations separately.
- Preserve sample counts and uncertainty when comparing repeated trials. A single successful flight does not establish reliability.
- Distinguish a failed requirement from an unsupported scenario, invalid configuration, interrupted run, or infrastructure error. Missing evidence must not become a passing result.
- Record the tested software and environment precisely enough to support investigation and repeat trials. Exact deterministic replay is not assumed.
- Test changed navigation decisions in a closed loop: actions must affect the simulated world and subsequent observations. Recorded logs alone cannot establish that behavior.
- Treat simulation as evidence within its modeled conditions. Connect results to representative physical trials as the product develops; simulation alone does not establish real-world safety or deployment readiness.

## Value to validate

FeatherLaneFlight would build on existing simulation and autopilot testing tools. Its proposed value is the connected workflow from a mission failure to a repeatable test, an investigated regression, and a verified improvement.

Early customer work should measure whether it reduces test setup effort, failure-investigation time, and repeated field failures. Willingness to pay, supported integrations, and commercial outcomes remain unvalidated.

## Background reading

- [Skydio: Connect SL incident review](https://www.skydio.com/blog/post-incident-review-on-connect-sl-recent-performance-regressions) — a documented release regression and the resulting testing and monitoring changes.
- [Zipline: The testing program behind every flight](https://www.zipline.com/newsroom/testing-program-zipline-flight) — layered simulation, physical validation, and operational feedback.
- [PX4: Integration testing with MAVSDK](https://docs.px4.io/main/en/test_and_ci/integration_testing_mavsdk) — an existing automated mission-testing framework.
- [PX4: System failure injection](https://docs.px4.io/main/en/debug/failure_injection) — supported fault mechanisms and environment-specific limitations.
- [ArduPilot: AutoTest framework](https://ardupilot.org/dev/docs/the-ardupilot-autotest-framework.html) — repeatable simulation tests and regression prevention.
- [PX4 Simulation Integration Survey](https://www.mcguirerobotics.com/px4_sim_research_report/) — developer needs and integration difficulties.

These references establish existing tools and practices. The proposed product design and business opportunity above are a synthesis, not a claim that those capabilities are absent from every existing vendor.
