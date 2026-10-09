# AGENTS.md

Guide for anyone (human or AI agent) contributing to **TaskMan**, a MERN task manager.

## Stack

| Part | Tech |
|---|---|
| `server/` | Node + Express 5 + Mongoose 9, TypeScript (NodeNext, run with `tsx`), JWT auth with DB sessions |
| `client/` | React 19 + Vite + Tailwind v4 + shadcn (**Base UI** primitives, `base-nova` style), lucide icons, axios |
| Tests | Jest everywhere (`@swc/jest`); Testing Library + jsdom on the client |
| Package manager | pnpm workspace (`pnpm-workspace.yaml`) |

## Commands

```bash
pnpm install                         # once, from the repo root

# API (local MongoDB recommended for development)
cd server
MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm seed   # demo account + tasks (local only)
MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm dev    # http://localhost:5000

# Web app
pnpm --filter client dev             # http://localhost:5173

# Quality gates (run before every commit)
pnpm --filter server typecheck && pnpm --filter server test
pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint
pnpm --filter client build
```

Environment: copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`.
Variables already set in the shell win over `.env` (dotenv does not override), which is how the
commands above point the API at a local database.

## Layout

```
server/src/
  models/        Mongoose schemas (User, Session, Workspace, Task)
  controllers/   Route handlers + express-validator chains
  middleware/    protect (JWT + session), requirePermission (RBAC), uploads
  routes/        /api/auth, /api/profile, /api/workspaces, /api/workspaces/:slug/tasks
  utils/         Pure helpers (taskQuery, taskGraph...) — unit tested
  scripts/seed.ts
  __tests__/     Jest tests

client/src/
  components/ui/ shadcn Base UI primitives (generated; adjust via tokens, not per call)
  components/    App shell (Sidebar, SettingsLayout, StatCard...)
  features/tasks/ Reusable tasks module — import from '@/features/tasks'
    lib/         Pure logic (dates, filters, schedule, dependencies, form rules)
    hooks/       useTasks (single source of truth, optimistic updates)
    components/  Badges, selects, inline edit, dialogs, toolbar, filter pills...
    views/       ListView, BoardView, CalendarView, TimelineView (share TaskViewProps)
    __tests__/
  features/workspace/ Workspace members/settings API + helpers
  hooks/         useAuthGuard (page guard + logout), use-mobile
  utils/         api (axios, 401 → login), session (token/user storage)
  config.ts      Vite env (VITE_API_URL); stubbed in Jest
  pages/         Route screens
```

## Conventions

- **Branches:** never commit to `main`. Work on `feature/<topic>` and open a PR.
- **Commits:** Conventional Commits (`feat(client): …`, `fix(server): …`), imperative, explain the why.
- **Workspace routes are permission scoped:** every route goes through `protect` then
  `requirePermission('<area>:<action>')` (see `server/src/config/permissions.ts`), which attaches
  `req.workspace`, `req.role` and `req.permissions`; queries always filter by `req.workspace._id`.
- **Roles:** assign roles only through `utils/roleAccess.ts` (`findAssignableRole`, `canGrantRole`).
- **Dates are calendar days:** send/receive `YYYY-MM-DD`; on the client use `lib/date.ts`
  (`parseDateKey`, `toDateKey`, `dateKeyOf`) — never `new Date('YYYY-MM-DD')` for display.
- **New view?** Implement `TaskViewProps` (`views/types.ts`), read data from `useTasks`, put logic in `lib/` with tests.
- **Pages:** start with `const { user, logout } = useAuthGuard()` and render inside `<Sidebar user={user} onLogout={logout}>`;
  never read `localStorage` directly — use `utils/session.ts`.
- **UI:** follow `DESIGN.md`. Use shadcn primitives from `components/ui`; no new UI libraries without discussion.
- **Pure logic first:** anything non-visual goes in `lib/` or `utils/` with a Jest test.
- **Secrets:** never commit `.env`. Seed credentials are test-only and live in `server/src/scripts/seed.ts`.

## Working rules for contributors and coding agents

- Work on a feature branch, never on `main`; open a PR against `kenule500/task-man:main`.
- Commit author is the human contributor; no tool or AI attribution lines in commits or PRs.
- Run against a **local** MongoDB (`MONGO_URI=mongodb://127.0.0.1:27017/task-man`); `pnpm seed` refuses non-local URIs.
- After changes run the quality gates above and check the affected view in the browser
  (`http://localhost:5173/demo-workspace/tasks?view=list|board|calendar|timeline`).

## Gotchas

- `client/src/App.css` is not imported; theme tokens live in `client/src/index.css` (`@theme`).
- `import.meta.env` is only read in `client/src/config.ts` (Jest maps it to `client/test/config.stub.ts`).
- jsdom lacks `PointerEvent`; `client/jest.setup.ts` polyfills it for Base UI.
- `tsc -b` uses the root `client/tsconfig.json`; tests are type-checked by `tsconfig.test.json`.
- Native HTML5 drag and drop is used for board/calendar; the Gantt uses pointer events
  (keyboard: arrows move, Shift+arrows resize).

## Definition of done

Typecheck, lint, tests and build pass; the feature is checked in the browser (empty, loading,
error states; keyboard; narrow screens); the PR describes what changed and how it was verified.
