# Shared contracts

This folder owns the canonical contracts and their generated consumers:

| Location                            | Ownership                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `python/src/featherlane_contracts/` | Hand-maintained Pydantic wire models, enums, and versions.                         |
| `schemas/`                          | Generated OpenAPI snapshot and version/digest manifest.                            |
| `typescript/src/generated/`         | Generated TypeScript types, Fetch SDK, Zod validators, and TanStack Query options. |
| `typescript/src/`                   | Thin public SDK, status-aware transport, and shared query policy.                  |

HTTP operation metadata comes from `src/api/src/featherlane_api/schema.py`. `pnpm contracts:generate` exports the canonical models and route metadata, then regenerates the schemas and TypeScript client. `pnpm contracts:check` checks drift without modifying these files.

The API and future runner import `featherlane_contracts`. The web application imports `@featherlane/contracts` and `@featherlane/contracts/validators`. See the [client guide](typescript/README.md) for setup and usage. Deterministic sample JSON and opt-in MSW handlers live with the web application in `src/web/mocks/` and are validated by these generated schemas.
