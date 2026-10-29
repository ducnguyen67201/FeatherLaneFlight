# Suite authoring architecture

This subsystem belongs to the [system architecture](../EngineeringSpec.md#3-system-architecture).
It covers suite drafts, edit concurrency and browser publication through the existing
API/database. It is a logical authoring view, not the whole execution platform or a
hosting/deployment design.

[Rendered architecture (SVG)](../diagrams/suite-authoring-architecture.svg) ·
[Editable Archify source](suite-authoring-architecture.json)

## Approval and implementation status

The human approved the simpler editor and architecture on **October 29, 2026** in
P11 chat `01a18387-0948-7c01-a103-904097102093`, turn
`01a1887e-259c-7ed2-b3f2-3483939cc773`, message
`01a1887e-260d-7263-901a-5b2e46aa7aaf`: “Ok makes sense, approve the simpler editor
and architecture and hơ í the versioning being handled”.

Approved scope: incomplete bounded suite drafts; Save draft and Publish actions;
automatic publication feedback and short confirmation; saved-version concurrency;
separate immutable published revisions; reuse of P10 canonical validation, exact
profile binding, synthetic reference qualification, immutable storage and audit.
No standalone Validate draft action is exposed. Later artifact wording identifies
approved P11 scope and local implementation without changing the approved topology.

The backend and editor are implemented locally against merged P10
`32de9efcaf2708aeac252434afc347968ce7772e`. Genuine Google/browser verification
exercised creation, incomplete saves, automatic feedback, publication/history,
stale-editor recovery, project switching and sign-out. Final publication review
preconditions were also checked through the real ASGI API with isolated database
sessions. This records local verification, not deployment, PR submission or merge
approval. Existing source citations are pinned to the stated merged base; they do
not assert that the uncommitted P11 implementation was already in that commit.

The final SVG is the viewer's canonical full-diagram export with an accessible
title/description and adaptive theme. Its editable JSON and this Markdown are
maintained assets. Regenerate the interactive HTML and validation/delivery sidecars
locally from the JSON; they remain ignored and are not shipped.

## Responsibilities and trust boundary

The existing browser session/CSRF boundary authenticates requests. P11 rechecks the
live identity and both memberships inside its transaction. Project-scoped suite
identities are never authorization credentials. Draft writes serialize through the
same project lock order as operator publication, then check the saved draft version.
The operator importer retains its real identity lookup and transaction ownership.

P11's shared publication policy resolves the exact immutable registered profile,
uses P10's canonical definition validator/digest and bounded reference qualifier,
and appends the revision, fresh digest-bound qualification and audit using P10's
existing store. Browser orchestration commits its draft publication receipt in that
same transaction. No duplicate suite store or arbitrary script engine is added.

There is no new worker responsibility or hosting change. Reference qualification
uses bounded synthetic observations; it does not start runner/PX4 processes or
qualify real flight behavior. Execution belongs to the
[runner execution subsystem](runner-execution.md).

## Two version counters

**Draft version** is an edit precondition. A new draft begins at 1. Saving advances
it, including saves with incomplete fields. A PATCH must name the expected saved
version; a competing stale edit receives 409 and preserves its local input. Loading
the latest draft is an explicit action that replaces local edits.

**Published revision** identifies an immutable suite definition. Publication copies
a valid saved draft into the next revision; the draft itself remains editable.
The browser's automatic review binds its saved draft version and exact proposed
definition digest, including the proposed revision/profile. A changed draft or an
interleaved operator publication requires another review rather than silently
publishing different inputs. Publishing does not increment the draft edit counter.

Each saved draft version has at most one publication receipt. A retry recovers that
exact revision, including after later edits. Changed review inputs conflict. The
editor shows Published until further edits, and published history remains readable.
New revisions run qualification bound to their own digest; they never inherit an
older revision's verification.

Related contracts and API behavior: [suite module](../../src/api/src/featherlane_api/modules/suites/README.md).
Related dependency: [build/profile registration](build-profile-registration.md).
Related delivery scope: [P11 plan](../phases/P11.md) and
[P11 handoff](../phases/handoffs/P11.md).
