# TaskMan

A MERN task manager for teams: users sign up, create or join workspaces, and plan their work in a
**list**, **Kanban board**, **calendar** or **timeline (Gantt)**, with projects, reports and team management.

| Layer | Stack |
|---|---|
| Web (`client/`) | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn (Base UI), axios |
| API (`server/`) | Node.js, Express 5, TypeScript, Mongoose 9 (MongoDB), JWT + DB sessions |
| Tests | Jest (`@swc/jest`), Testing Library |
| Tooling | pnpm workspace, ESLint, GitHub Actions CI |

Design references: [Renza tasks screen](https://dribbble.com/shots/27514201-Task-Management-Dashboard-Tasks-Screen-UI-Design) ·
[Planora](https://dribbble.com/shots/25991082-Planora-Minimal-Task-Management-Dashboard-UI). UI rules live in [DESIGN.md](DESIGN.md);
contributor conventions in [AGENTS.md](AGENTS.md).

## Features

- Sign up with email verification, login, password reset, sessions you can revoke (sign out other devices)
- Workspaces with invite codes; members and roles; workspace settings
- Tasks: title, description, status, priority, start/due dates, project, dependencies
- Views: List (inline editing), Board (drag and drop), Calendar (drag to reschedule), Timeline (Gantt with dependency arrows)
- Search, status and priority filters, sorting (also available as API query parameters)
- Dashboard overview, Projects progress, Reports, Team page

## Getting started

Requirements: Node.js 22+, pnpm 10+, MongoDB 7+ (local or Atlas).

```bash
pnpm install
cp server/.env.example server/.env      # then set JWT_SECRET (openssl rand -hex 32)
cp client/.env.example client/.env

cd server
pnpm seed      # local demo workspace and tasks (refuses non-local databases)
pnpm dev       # API on http://localhost:5000

# in another terminal
pnpm --filter client dev                 # web app on http://localhost:5173
```

The demo login is defined in `server/src/scripts/seed.ts`. Without `EMAIL_HOST`, development prints
verification and reset emails (with their links) to the API console, so no SMTP account is needed.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `MONGO_URI` | server | MongoDB connection string (required) |
| `JWT_SECRET` | server | ≥ 32 random characters (required; weak values are refused in production) |
| `CLIENT_URL` | server | Public web URL used in email links (required in production) |
| `CORS_ORIGIN` | server | Comma-separated allowed origins (defaults to `CLIENT_URL`) |
| `RATE_LIMIT_MAX` | server | Requests / 15 min / IP for the app API (auth stays at 100) |
| `TRUST_PROXY` | server | Number of proxies in front of the API (e.g. `1` on Render) |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | server | SMTP for real emails |
| `VITE_API_URL` | client | API base URL, e.g. `https://api.example.com/api` |

## Scripts

| Command | What it does |
|---|---|
| `pnpm --filter server dev` / `build` / `start` | API in watch mode / compile / run compiled |
| `pnpm --filter server test` / `typecheck` | Jest / TypeScript |
| `pnpm --filter client dev` / `build` / `preview` | Web app |
| `pnpm --filter client test` / `typecheck` / `lint` | Jest / TypeScript / ESLint |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and builds for both packages on every pull request.

## API overview

All routes are under `/api`. Task routes require `Authorization: Bearer <token>` and workspace membership.

| Method | Route | Notes |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/auth/signup`, `/auth/login`, `/auth/logout` | Accounts and sessions |
| GET/POST | `/auth/verify-email/:token`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password/:token` | Email flows |
| GET/PUT | `/profile`, `/profile/notifications`, `/profile/password` | Profile |
| GET/POST | `/workspaces`, `/workspaces/join`, `/workspaces/:slug`, `/workspaces/:slug/members` | Workspaces |
| PUT/POST | `/workspaces/:slug`, `/workspaces/:slug/invite-code` | Workspace settings (owner/admin) |
| GET/POST | `/workspaces/:slug/tasks?status=&search=&sort=&from=&to=&project=` | List and create tasks |
| PUT/PATCH/DELETE | `/workspaces/:slug/tasks/:id` | Partial update, delete |

## Branch strategy

- `main` is always deployable; nobody commits to it directly.
- Work happens on `feature/<topic>` or `fix/<topic>` branches and lands through a pull request with green CI and one review.
- Contributors without write access push to their fork and open the PR against `main`.
- Commit messages follow Conventional Commits (`feat(client): …`, `fix(server): …`).

## Deployment

1. **Database:** create a MongoDB Atlas cluster and a database user; allow the API host's IPs.
2. **API (Render, Railway or a VPS):** build `pnpm install && pnpm --filter server build`, start `node server/dist/server.js`.
   Set `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `CORS_ORIGIN`, `TRUST_PROXY=1` and SMTP variables.
   `render.yaml` describes this setup for Render.
3. **Web (Vercel or Netlify):** root `client/`, build `pnpm build`, output `dist`, env `VITE_API_URL=https://<api-host>/api`.
   `client/vercel.json` rewrites all routes to `index.html` for client-side routing.
4. Verify the full flow on the deployed app: signup → verify email → login → create, update, filter and delete tasks.

## Known limitations

- The JWT is kept in `localStorage`. HttpOnly cookies would protect it from XSS, but need a SameSite/CSRF
  strategy that depends on the final hosting domains, so the switch is deferred until deployment is decided.
- Secrets that were committed before `server/.env` was untracked remain in git history. They must be rotated
  (MongoDB user password, JWT secret, SMTP credentials).
- No real-time updates: other members' changes appear after a reload.
- Not deployed yet: no live URL.
