# Minimal contract fixtures

`runs.json` is one deterministic, canonical queued RunSummary wrapped in the bounded list response. Python and generated TypeScript validators can both parse these exact bytes. Imports validate the fixture; no interception starts automatically.

`createFixtureHandlers({ origin, runs, delayMs })` supplies MSW handlers for generated metadata and Runs paths. `runs` is `populated`, `empty`, or `forbidden`; an optional delay exposes loading behavior. The fixture project is `project_demo`. Consumers start MSW in their own development entry point. No service worker, UI, test harness, or production mocking toggle is installed by P01.

The handler validates the contract-version header and bounded query/path fields with generated schemas. It serves one page; subsequent cursors and projects without this fixture return an empty page. This is deterministic mock behavior, not authentication, a database implementation, or production cursor semantics. Additional workflow fixtures belong to their feature phases.

These mocks belong to the `@featherlane/web` workspace package. Its `./mocks` export resolves here; consumers within the web application can import the local `mocks` module. Shared types and runtime validators come from `@featherlane/contracts` in `packages/contracts/typescript/`.
