---
name: client-feature-module
description: How to structure and extend a TaskMan client feature module - folder layout, public entry, data access, date and session helpers, design-system usage and colocated tests.
version: 1.0.0
tags: [client, react, feature-module, typescript, tailwind]
source: custom (derived from AGENTS.md and client/src)
license: project-internal
last_updated: 2026-10-16
---

# Building a client feature module

Use this when a change adds or extends a module under `client/src/features/<feature>/`.

## Layout

```
client/src/features/<feature>/
  api.ts          # axios calls through '@/utils/api'
  types.ts        # feature types and constants (e.g. MAX_*)
  lib/            # PURE logic - no React, no axios; one Jest test per module
  hooks/          # data + state hooks (e.g. useTasks)
  components/     # presentational pieces for this feature
  views/          # only for task views - see the task-view skill
  __tests__/      # colocated tests: <name>.test.ts | <name>.test.tsx
  index.ts        # the ONLY public surface; others import '@/features/<feature>'
```

## Rules

- **Import the feature, not its internals.** Consumers use `import { useTasks, tasksApi } from '@/features/tasks'`. Add new exports to `index.ts` deliberately (constitution CON-110).
- **Everything non-visual belongs in `lib/`** and gets a test there (CON-202). Examples to imitate: `features/tasks/lib/{date,filters,schedule,dependencies,taskKey}.ts`.
- **HTTP goes through `client/src/utils/api.ts`** (`api` axios instance, `getApiErrorMessage(error, fallback)`, `NETWORK_ERROR_MESSAGE`, `RATE_LIMIT_MESSAGE`). A 401 already redirects to login; do not re-implement that (CON-207).
- **Session state** is read/written only through `client/src/utils/session.ts` (`getToken`, `getStoredUser`, `saveSession`, `updateStoredUser`, `clearSession`). Never touch `localStorage` directly (CON-204).
- **Dates are calendar days**: use `lib/date.ts` (`parseDateKey`, `toDateKey`, `dateKeyOf`); never `new Date('YYYY-MM-DD')` for display (CON-203).
- **`import.meta.env` only in `client/src/config.ts`** (CON-205); jest maps it to `client/test/config.stub.ts`.
- **UI comes from `client/src/components/ui/` (shadcn Base UI) and `client/src/components/ds/`** (`Surface`, `EmptyState`, `SkeletonList`, `Alert`, `Field`, toast). No new UI libraries (CON-302). Theme changes go to the `@theme` tokens in `client/src/index.css`; `client/src/App.css` is never imported (CON-303).
- **Pages** start with `const { user, logout } = useAuthGuard()` and render inside `<Sidebar user={user} onLogout={logout}>` (CON-304).
- **States are part of done:** empty, loading and error states must render; check keyboard access and narrow screens (CON-703).

## Tests

- Colocated in `__tests__/`, Testing Library + jsdom; the setup file already polyfills `PointerEvent` for Base UI (CON-408, see the `jest-testing` skill).
- Render with `MemoryRouter` when the component uses router hooks or `Link`.
- Prefer testing `lib/` functions and behaviour over implementation details.
- Run `pnpm --filter client test`, then `pnpm --filter client typecheck` and `pnpm --filter client lint`.

## Pitfalls

- Deep-importing from another feature (`@/features/tasks/components/...`) instead of its `index.ts`.
- Putting fetch logic in a component instead of `api.ts` + a hook, which breaks optimistic updates and cache invalidation.
- Using `client/src/components/ui/*` per-usage class overrides instead of tokens.
- Formatting dates with `toLocaleDateString()` on a raw `Date` parsed from a `YYYY-MM-DD` string (timezone drift).
