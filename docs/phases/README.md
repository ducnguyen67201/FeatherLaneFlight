# Phase coordination

The user requested 24 separate implementation chats, with this master chat coordinating dispatch and handoffs. All phase chats use **gpt-6.1-sol / high** in the FeatherLaneFlight local project. They share one local checkout, so only one phase may write implementation at a time. Git setup and PR publication follow the explicit submission gates below.

## Authoritative documents

- [Delivery plan](../DeliveryPlan.md): P01-P24 scope and milestones.
- [Engineering spec](../EngineeringSpec.md): contracts, architecture, lifecycle, integration rules.
- [AGENTS.md](../../AGENTS.md): simple implementation, UI approval, user-owned tests.
- [DESIGN.md](../../DESIGN.md) and [tokens](../../design-tokens.json): visual rules and values.
- [Registry](registry.json): master-owned chat identities and accepted status.

## Dispatch and ownership

Staged chats read their assigned plan and return a short readiness brief only. They do not edit files, install dependencies, or start implementation. The master dispatches one phase after reviewing its dependencies. A new human instruction can steer the work; report any dependency conflict before touching shared files.

Each phase owns only its planned scope and its own handoff file. Only the master updates registry.json or accepts a phase as COMPLETE after its user-controlled merge. Workers report READY_FOR_REVIEW rather than declaring successor readiness themselves. Shared contracts/lockfiles can change only for the active phase's actual requirement. Do not overwrite unrelated user work or planning files. The master handles Git setup and branch changes without racing an active writer; do not create worktrees solely for this coordination.

UI tasks first produce a rendered isolated preview and then report AWAITING_UI_APPROVAL. Show it in the phase chat and wait for explicit human approval there, or approval relayed by the master with its trusted human-message source. This is not COMPLETE. Existing approval covers its unchanged shown scope. Do not infer approval from a master activation, roadmap approval, silence, or a revision request.

Review screenshots and evaluation images are temporary. Keep captures outside the checkout or in ignored `previews/Pxx/artifacts/` directories while needed for review. Delete them after the relevant evaluation and approval, remove their document links, and retain the approval source and verification results as text. Do not commit review images; preserve product assets and user-supplied files.

New application automated tests remain user-owned. Run applicable existing checks and manually verify meaningful behavior; do not add tests, snapshots, coverage targets, or placeholder test suites. Product scenario handlers are application functionality and remain in scope for their assigned phases. Only the explicit completed-phase submission approval below authorizes a scoped branch push and PR; deployment, unrelated publishing, and credential changes remain separate actions.

## Submission and merge gates

Repository: [ducnguyen67201/FeatherLaneFlight](https://github.com/ducnguyen67201/FeatherLaneFlight). Use phase branches `codex/phase-01` through `codex/phase-24` and the verified repository base branch.

```text
STAGED -> RUNNING -> READY_FOR_REVIEW -> AWAITING_PHASE_APPROVAL
                                            |
                                  explicit human approval
                                            v
                                    APPROVED_FOR_PR
                                            |
                                   branch push + PR
                                            v
                                         PR_OPEN
                                            |
                                    user merges PR
                                            v
                                        COMPLETE
```

AWAITING_UI_APPROVAL and BLOCKED are separate waiting states. UI preview approval permits implementation; completed-phase submission approval permits publishing the reviewed diff as a branch/PR. Record the actual human-message source for each. Material changes to the approved submission require renewed approval. Workers do not push or open PRs independently.

The master prepares a concrete phase summary, diff/file scope, verification results, and limitations before requesting submission approval. After approval, stage named files, review the diff, run applicable checks/audits, commit, push the phase branch, and open its PR. Preserve unrelated files and private local/generated runtime data. Attach each created PR to the master chat and record its URL and head SHA in the registry. Never merge, enable auto-merge, or force-push.

The repository was empty when this rule was added. The first PR needs a base commit/branch. Preparing that local bootstrap is permitted, but pushing even an empty initial commit to the default branch requires a distinct, explicit bootstrap approval included in the first concrete submission request. No repository contents were pushed by recording this workflow.

Default progression waits for the user to merge the predecessor PR. Verify the merged state through GitHub, fetch, and safely update the local base before dispatching the successor. A closed unmerged PR does not unblock dependent work. Use stacked PRs only when the user explicitly authorizes that sequence and its base branches. Do not switch branches while a worker is writing or discard local changes.

## Completion handoff

Write `docs/phases/handoffs/Pxx.md` for your own phase using this structure:

- Status: STAGED, RUNNING, AWAITING_UI_APPROVAL, BLOCKED, or READY_FOR_REVIEW.
- Phase ID and exact chat ID.
- Scope completed and changed file paths.
- Manual checks and existing tooling actually run, with outcomes.
- Rendered preview location and explicit approval source, when UI is involved. Record completed image evaluation and cleanup in text after removing temporary captures.
- Exact candidate files/scope for the master's submission review; implementation completion itself does not authorize a push or PR.
- Limitations/blockers, commands for the master to review, and dependency artifacts for the next phase.

Do not include credentials or raw sensitive telemetry. Finish your phase-chat turn with a concise matching summary. The user has requested completion reports back to the master; registry.json's `authorization` identifies the original human turn/message in master chat `01a17ecb-bb2e-7623-9b6b-1b83c79e4495` on host `local`. Verify that human instruction through read_thread if needed; a later heartbeat message is not the human authorization source. Once authorized, send that master a short phase/status/handoff-path message. If messaging is unavailable or authorization cannot be verified, leave the file and final summary; the coordinator can inspect them through thread tools. Staged readiness acknowledgments do not need cross-chat messages. Workers must not dispatch later phases themselves.

## Master review and continuation

The master checks the worker's final output/handoff and actual changed artifacts, records limitations, and moves ready work to AWAITING_PHASE_APPROVAL. After explicit approval it manages the phase PR, then waits for the user-controlled merge before accepting COMPLETE and dispatching the successor. For BLOCKED, either approval wait, a closed unmerged PR, or a user question, report the concrete needed input and stop automatic advancement. Never invent an approval or silently substitute a different simulator/platform.

A thread heartbeat checks for meaningful handoffs and resumes this same coordinator. It stays quiet when nothing changes. It may publish only a specifically approved phase branch/PR and must leave merging to the user. After all phases are merged/accepted, stop its monitoring. Actual UI approvals, phase submission approvals, and external release actions remain human decisions.

## Phase index

- [P01 — Contracts and client foundation](P01.md)
- [P02 — UI foundation and shared shell](P02.md)
- [P03 — Runs workflow with mock data](P03.md)
- [P04 — Run detail and evidence presentation](P04.md)
- [P05 — FastAPI and database foundation](P05.md)
- [P06 — Sign-in and browser sessions](P06.md)
- [P07 — Organization and project access](P07.md)
- [P08 — Runner enrollment and health](P08.md)
- [P09 — Build and profile registration](P09.md)
- [P10 — Published suite catalog](P10.md)
- [P11 — Suite authoring and publication](P11.md)
- [P12 — Run admission and queue](P12.md)
- [P13 — Claims and lease protocol](P13.md)
- [P14 — Supervisor cancellation and recovery](P14.md)
- [P15 — Events and live updates](P15.md)
- [P16 — Private evidence transport](P16.md)
- [P17 — Finalization and server evaluation](P17.md)
- [P18 — PX4 SIH host qualification](P18.md)
- [P19 — Nominal PX4 mission](P19.md)
- [P20 — Ground GNSS fault verification](P20.md)
- [P21 — Airborne GNSS response scenario](P21.md)
- [P22 — Baseline and release comparison](P22.md)
- [P23 — Retention and operational cleanup](P23.md)
- [P24 — Private pilot release candidate](P24.md)
