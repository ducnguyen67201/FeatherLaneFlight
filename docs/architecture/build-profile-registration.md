# Build and profile registration architecture

This subsystem belongs to the [system architecture](../EngineeringSpec.md#3-system-architecture). It covers immutable registration metadata and the exact profile lookup consumed by suite import. It does not describe the whole execution platform or a hosting/deployment change.

[Open the rendered architecture (SVG)](../diagrams/build-profile-registration-architecture.svg) · [Editable Archify source](build-profile-registration-architecture.json)

The durable assets are this page, the SVG and editable JSON. The SVG is the viewer's canonical full-diagram export; its title, description, nodes and yellow scope markers are preserved. Regenerate the interactive HTML and delivery receipts locally with Archify from the JSON; those files are ignored and are not part of the submission scope.

## Approved scope and status

The human approved the diagram on October 29, 2026 in P09 chat `01a18387-04a2-7891-bbbc-f7b46a012442`, after asking for yellow dots identifying what this branch ships. Approval source (human message `01a187dd-3a1b-7c40-95f9-4ba81121e92e`): “soudns good, basiacalyy we're finished 9mplement jsut waiting for phase 08 right”. The approved scope is the marked profile catalog, exact lookup and immutable registered profiles, with P10 suite import and synthetic qualification shown as separate proposed work. Design approval does not assert implementation, merge or deployment.

P09's catalog, authenticated writes and local inventory binding are implemented and verified locally against P08's reviewed frozen identity/runtime checkpoints. Fresh Google-authenticated browser/project-switch verification passed in the isolated P09 runtime. P08 PR14 is merged at `06be44125210a3edc509648f5ca03be294602633`; its actual source and migration chain have been reconciled. The human approved P09 branch/PR publication on October29,2026; P09 remains unmerged and undeployed. P10's suite/provenance components are proposals in this diagram. The existing authorization citations are pinned to the stated merged repository revision, not evidence that local P09/P10 code was deployed.

## Responsibilities and boundaries

The API rechecks the browser session and current project membership. Registration stores bounded immutable metadata and fingerprints; executable/source files, local launch paths and credentials remain with the runner. P09 uses P08's canonical runner declarations within a caller-owned transaction and checks declaration freshness before creating runner-backed metadata. Exact retries can recover a committed receipt after current user authorization.

The exact lookup resolves a project-scoped profile ID, revision and digest without opening or committing the caller's transaction. Registration stays `DECLARED`. P10 separately owns immutable synthetic qualification evidence; synthetic evidence cannot qualify a PX4 profile. A runner publishing measured inputs remains disabled for execution until later execution/qualification phases provide that behavior.

The proposed synthetic verifier consumes bounded fixtures and produces evidence bound to exact profile and handler/check versions. It sends no PX4 mission commands. PX4 host qualification and nominal mission execution belong to P18 and P19.

Related subsystem: [runner execution architecture and deployment](runner-execution.md), which owns the broader managed/customer execution design. This registration detail does not implement those proposed hosting components.

Related scope: [P09 plan](../phases/P09.md), [P09 current handoff](../phases/handoffs/P09.md), [P10 plan](../phases/P10.md), and [runner registration](../../src/runner/REGISTRATION.md). There are no child deployment diagrams because this approved logical view changes no hosting.
