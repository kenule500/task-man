# AGENTS.md

Guide for anyone (human or AI agent) contributing to **TaskMan**, a MERN task manager.

## Stack

| Part | Tech |
|---|---|
| `services/api/` | Node + Express 5 + Mongoose 9, TypeScript (NodeNext, run with `tsx`), JWT auth with DB sessions |
| `services/document-analyzer/` | Python 3.12 + uv + FastAPI + DocuMind SDK 0.2.2 (document plan generation) |
| `client/` | React 19 + Vite + Tailwind v4 + shadcn (**Base UI** primitives, `base-nova` style), lucide icons, axios |
| Tests | Jest everywhere (`@swc/jest`); Testing Library + jsdom on the client |
| Package manager | pnpm workspace (`pnpm-workspace.yaml`) |

## Commands

```bash
pnpm install                         # once, from the repo root

# API (local MongoDB recommended for development)
cd services/api
MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm seed   # demo account + tasks (local only)
MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm dev    # http://localhost:5000

# Web app
pnpm --filter client dev             # http://localhost:5173

# Document analyzer (optional; the API defaults to its own provider path)
pnpm dev:analyzer                    # http://localhost:8000; uv syncs on first run
# or manually:
cd services/document-analyzer
cp .env.example .env                 # token + DocuMind provider key
uv sync
uv run --env-file .env uvicorn app.main:app --port 8000
# Point the API at it with DOCUMENT_ANALYZER_MODE=documind and DOCUMENT_ANALYZER_URL=http://127.0.0.1:8000

# Quality gates (run before every commit)
pnpm --filter server typecheck && pnpm --filter server test
pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint
pnpm --filter client build
pnpm check:analyzer
```

Environment: copy `services/api/.env.example` to `services/api/.env` and `client/.env.example` to `client/.env`.
Variables already set in the shell win over `.env` (dotenv does not override), which is how the
commands above point the API at a local database.

## Layout

```
services/api/src/
  models/        Mongoose schemas (User, Session, Workspace, Task)
  controllers/   Route handlers + express-validator chains
  middleware/    protect (JWT + session), requirePermission (RBAC), uploads
  routes/        /api/auth, /api/profile, /api/workspaces, /api/workspaces/:slug/tasks
  utils/         Pure helpers (taskQuery, taskGraph...) — unit tested
  scripts/seed.ts
  __tests__/     Jest tests

services/document-analyzer/
  app/           FastAPI surface, Pydantic contract, DocuMind adapter
  pyproject.toml uv project (documind==0.2.2)
  Dockerfile     Multi-stage uv build

packages/contracts/  plan.contract.json + golden fixture, validated by Python and Node

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

- **Backend services live under `services/`:** `services/api` is the Node/Express API and
  `services/document-analyzer` is the Python analyzer. `client/` is the web app; the root `api/`
  folder is only the Vercel serverless adapter (it imports the API, it is not a server).
- **Shared cross-language artifacts live under `packages/`:** `packages/contracts` holds the plan
  JSON Schema and golden fixture validated by both the Node and Python sides.
- **Branches:** never commit to `main`. Work on `feature/<topic>` and open a PR.
- **Commits:** Conventional Commits (`feat(client): …`, `fix(server): …`), imperative, explain the why.
- **Workspace routes are permission scoped:** every route goes through `protect` then
  `requirePermission('<area>:<action>')` (see `services/api/src/config/permissions.ts`), which attaches
  `req.workspace`, `req.role` and `req.permissions`; queries always filter by `req.workspace._id`.
- **Roles:** assign roles only through `utils/roleAccess.ts` (`findAssignableRole`, `canGrantRole`).
- **Dates are calendar days:** send/receive `YYYY-MM-DD`; on the client use `lib/date.ts`
  (`parseDateKey`, `toDateKey`, `dateKeyOf`) — never `new Date('YYYY-MM-DD')` for display.
- **New view?** Implement `TaskViewProps` (`views/types.ts`), read data from `useTasks`, put logic in `lib/` with tests.
- **Pages:** start with `const { user, logout } = useAuthGuard()` and render inside `<Sidebar user={user} onLogout={logout}>`;
  never read `localStorage` directly — use `utils/session.ts`.
- **UI:** follow `DESIGN.md`. Use shadcn primitives from `components/ui`; no new UI libraries without discussion.
- **Pure logic first:** anything non-visual goes in `lib/` or `utils/` with a Jest test.
- **Secrets:** never commit `.env`. Seed credentials are test-only and live in `services/api/src/scripts/seed.ts`.

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
- `documind` 0.2.2 is a **generation** SDK: it has no analysis/OCR API and its internal pipeline may
  make several provider calls. The analyzer feeds it cleaned text and parses one fenced JSON block.
- Document plans default to `DOCUMENT_ANALYZER_MODE=ai` (the v1 provider path). `documind` becomes the
  default only after the cost/latency/provider-call measurement recorded in v2 `RISK-022`.
- The analyzer receives text only; `extract.ts`, upload limits and `finalizePlan` stay in Node.

## Definition of done

Typecheck, lint, tests and build pass; the feature is checked in the browser (empty, loading,
error states; keyboard; narrow screens); the PR describes what changed and how it was verified.
