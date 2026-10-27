---
name: jest-testing
description: How testing works in TaskMan - Jest with @swc/jest, where tests live, unit vs integration, jsdom specifics, the import.meta.env stub, the commands to run and the acceptance-criteria naming rule.
version: 1.0.0
tags: [testing, jest, testing-library, jsdom, quality-gates]
source: custom (derived from AGENTS.md, jest configs and .github/workflows/ci.yml)
license: project-internal
last_updated: 2026-10-16
---

# Testing in TaskMan

## Framework and commands

| Scope | Command | Notes |
|---|---|---|
| Server unit tests | `pnpm --filter server test` | Jest + `@swc/jest`, no database |
| Server integration tests | `pnpm --filter server test:integration` | `jest.integration.config.cjs`, `--runInBand`, needs a real MongoDB |
| Server coverage | `pnpm --filter server test:coverage` | text-summary + lcov |
| Client tests | `pnpm --filter client test` | Jest + Testing Library + jsdom |
| One file | `pnpm --filter client test -- <path-or-name-pattern>` | pass a path fragment or `-t "name"` |
| Full gate | `pnpm --filter server typecheck && pnpm --filter server test`, then `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint` | what CI runs (`.github/workflows/ci.yml`) |

## Where tests live

- `server/src/__tests__/<name>.test.ts` — unit tests (CON-403). Must not need MongoDB or the network (CON-407).
- `server/src/__integration__/<name>.test.ts` — real MongoDB, separate config.
- `client/src/features/<feature>/__tests__/<name>.test.ts|.tsx`, `client/src/components/**/__tests__/`, `client/src/pages/__tests__/` — colocated (CON-406).
- `client/test/` holds shared setup, fixtures and `config.stub.ts`.
- **Do not restructure** the colocated layout into a single top-level test tree; CON-406 preserves it deliberately.

## Environment specifics

- Transpilation is `@swc/jest` — tests run without type-checking, so `pnpm typecheck` (which includes `tsconfig.test.json`) is the type gate for test files.
- The client runs under jsdom. jsdom has no `PointerEvent`, so `client/jest.setup.ts` polyfills it; Base UI primitives depend on it (CON-408). Never remove or narrow that polyfill.
- `import.meta.env` is mapped to `client/test/config.stub.ts`; do not read `import.meta.env` outside `client/src/config.ts`.
- Router-dependent components are rendered inside `MemoryRouter`.
- Integration tests that touch rate limiting mock `express-rate-limit` (see `server/src/__integration__/sso.test.ts` for the pattern).
- Integration runs read their environment from `server/src/__integration__/setupEnv.ts`; CI supplies `MONGO_URI`, `JWT_SECRET` and `NODE_ENV=test`.

## Rules

1. Every acceptance criterion needs at least one test (CON-404).
2. Include the acceptance criteria id in the test name (CON-405), e.g. `it('AC-004 hides the delete action without tasks:delete', ...)`.
3. Unit tests stay hermetic: no MongoDB, no network. Anything else becomes an integration test.
4. Prefer behaviour over implementation: query by role/label text, not by class name or component internals.
5. Tests are part of the change, not a follow-up: a feature is not done until the gates above pass (CON-402, CON-702).

## Pitfalls

- Adding a test that only passes with a running MongoDB into `__tests__/` (use `__integration__/` instead).
- Forgetting `MemoryRouter`, which makes `useNavigate`/`Link` throw.
- Asserting on dates with `new Date('YYYY-MM-DD')`; use the `lib/date.ts` helpers instead.
- Assuming `pnpm test` type-checks: it does not, `pnpm typecheck` does.
