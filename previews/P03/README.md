# P03 approved Runs preview

Status: **APPROVED — IMPLEMENTED FOR REVIEW**. The isolated source remains as design provenance. The application is now at <http://127.0.0.1:4200/runs>; see `src/web/README.md` and `docs/phases/handoffs/P03.md` for implementation and actual checks.

## Original preview

With the existing workspace dependencies/generated contracts available, run from the repository root:

```sh
# Only if the ignored preview-local dependency link is absent:
ln -s ../../src/web/node_modules previews/P03/node_modules
pnpm --dir src/web exec vite ../../previews/P03 --host 127.0.0.1 --port 4203 --strictPort
```

The isolated preview at <http://127.0.0.1:4203/> reuses the P02 theme, AppShell, PageLayout and canonical status map. It has local design samples rather than the application's validated transport. It adds no workspace package or dependencies.

The approved scope covers the Runs list/search/execution/outcome filters, loading/empty/error states, and runner → available build/profile → eligible published suite → repetitions → review in an inset right-side modal. The modal is about 95% viewport height with a backdrop, persistent header/footer, internal scrolling, narrow adaptation, keyboard containment/dismissal, pending-close protection and opener restoration/fallback. Details actions are disabled with a nearby availability explanation. Historical results are synthetic; new accepted submissions stay Queued / Not evaluated.

## Approval and revision provenance

- Initial full-page form was revised after the human request relayed from master turn `01a1843a-508f-7f11-b9e0-baa86edfb4ff`, message `01a1843a-50b8-7c63-8a47-700c13ce0171` asking for a right-side panel around 95% height and explaining the Open action. That message was a revision request, not approval.
- The revised modal preview was explicitly approved in master turn `01a18443-d783-70b1-be98-d48fb54746ca`, message `01a18443-d7a6-78d0-b5b2-45b1ecdd9be9`: “yea looks good, go ahead and implement phase 3”. Master verified the direct human message and recorded the shown scope in `registry.uiApproval`.
- Preview typecheck/build/format and manual validation/rejection/queued acknowledgment checks passed. Desktop and 375 × 812 narrow images were inspected from disk. Focus wrapping, Escape/backdrop/close restoration and the disappearing empty-opener fallback were exercised. Full-page narrow capture was unreliable, so normal viewport captures were used.
- All 11 superseded captures and six revised approval captures were deleted after evaluation/approval. Historical hashes and approval sources remain as text in the registry. No review images are committed.

The master evaluated and deleted the original implementation captures. Correction desktop/narrow recovery captures were also inspected and deleted after evaluation. No temporary review images remain; verification outcomes are retained as text in the handoff. The source preview remains runnable. No publication/submission approval is implied.
