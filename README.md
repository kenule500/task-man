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

## Live demo

**https://taskman-mauve.vercel.app** — web app and API on one origin (Vercel + MongoDB Atlas).

Try every permission level with the seeded accounts (one per role) in `demo-workspace`:
`demo@taskman.test` (Product Owner), `scrum@taskman.test` (Scrum Master), `dev@taskman.test` (Developer),
`member@taskman.test` (Team Member), `viewer@taskman.test` (Viewer). The shared test password is the
`DEMO_PASSWORD` constant in `server/src/scripts/seed.ts`.

Docs: [Presentation guide](docs/PRESENTATION_GUIDE.md) (demo script, architecture, tests) ·
[Implementation report](docs/IMPLEMENTATION_REPORT.md) (what changed, how, every file) ·
[Design system](docs/DESIGN_SYSTEM.md) (live at [/design-system](https://taskman-mauve.vercel.app/design-system)).

## Features

### Core
- Sign up with email verification, login, password reset, sessions you can revoke (sign out other devices)
- Workspaces with invite codes; members and roles; workspace settings
- Tasks: title, description, status, priority, start/due dates, project, dependencies, labels, assignees, comments, attachments
- Views: List (inline editing), Board (drag and drop), Calendar (drag to reschedule), Timeline (Gantt with dependency arrows)
- Search, status and priority filters, sorting (also available as API query parameters)
- Dashboard overview, Projects, Reports, Team page, searchable Help/FAQ, global search (Ctrl/Cmd + K)

### Scrum / agile
- **Projects** (folders with color, icon and key) → **sprints** → **tasks** → **subtasks**
- Work item types (story, task, bug, spike) and story points
- Product backlog per project; plan, start and complete sprints (unfinished work moves to the backlog or the next sprint)
- Sprint burndown, velocity history, one active sprint per project
- Scrum roles: Product Owner, Scrum Master, Developer, Team Member, Viewer
- Task keys like `WEB-12` (search by key, copy key or link)

### Enterprise
- **Audit log** (Settings → Audit log): who did what, when and from where, for tasks, projects, sprints, members,
  invitations and settings; filters, cursor pagination, CSV export; kept 365 days
- **Task activity** tab: field-by-field history of every task
- **Signed-in devices**: list sessions, sign out one device or all others
- **Permission matrix**: roles × permissions overview with sticky headers
- CSV export of the task list; request ids on every response; health check reports the database
- Security CI: CodeQL, Dependabot, `pnpm audit --prod` gate; SonarQube config (`sonar-project.properties`); see [SECURITY.md](SECURITY.md)

### Role-Based Access Control (RBAC)
- 5 system roles seeded on server startup — cannot be renamed or deleted
- Custom roles per workspace with a permission matrix editor
- 10 atomic permissions grouped by area (projects, tasks, users, reports, settings)
- Route guards, sidebar filtering, and button gating driven by the user's role in the active workspace
- Automatic self-healing — orphaned member entries get a sensible default role on first request

### Progressive Web App
- Installable (Chrome/Edge "Install app", iOS Safari "Add to Home Screen")
- Mobile bottom navigation with a quick "New task" button
- Board on phones: one-tap "Start → / Done ✓", "Move to…" sheet (long-press or ⋯ menu), per-column pagination
- Calendar on phones: week strip or month grid with color-coded status dots and a legend
- Offline app shell via `vite-plugin-pwa` + Workbox
- Update toast when a new version is deployed

## RBAC overview

Every request to a workspace endpoint goes through a permission middleware that:

1. Verifies the user is a member of the workspace
2. Loads the member's role for that workspace
3. Checks whether the role has the required permission
4. Attaches `req.workspace`, `req.role`, and `req.permissions` for downstream handlers

The client fetches `/api/auth/currentuser?workspaceSlug=<slug>` on every workspace navigation. The response drives:
- **Sidebar filtering** — restricted nav items are hidden
- **Route guards** — `<PermissionRoute>` renders a `ForbiddenPage` on 403
- **Button gating** — `can('tasks:write')` controls conditional rendering

### System roles

| Role | Description |
|---|---|
| **Product Owner** | Full control — settings, members, everything |
| **Scrum Master** | Manages projects and tasks; can view members |
| **Developer** | Works on tasks and projects; can view members |
| **Team Member** | Works on assigned tasks |
| **Viewer** | Read-only access |

### Permission catalog

| Permission | Area |
|---|---|
| `projects:read`, `projects:write`, `projects:delete` | Projects |
| `tasks:read`, `tasks:write`, `tasks:delete` | Tasks |
| `users:read`, `users:write` | Members |
| `reports:read` | Analytics |
| `settings:manage` | Workspace settings |

## API

All endpoints are under `/api` and need `Authorization: Bearer <token>` except auth and health.

| Area | Endpoints |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/verify-email/:token` · `POST /api/auth/forgot-password` · `POST /api/auth/reset-password/:token` |
| Tasks (active workspace) | `GET /api/tasks` · `POST /api/tasks` · `PUT/PATCH /api/tasks/:id` · `DELETE /api/tasks/:id` |
| Tasks (any of your workspaces) | same routes under `/api/workspaces/:slug/tasks`, plus `/:id/comments` and `/:id/attachments` |
| Projects and sprints | `GET/POST /api/workspaces/:slug/projects` · `PATCH/DELETE …/projects/:id` · `POST …/projects/:id/sprints` · `PATCH/DELETE …/sprints/:sprintId` · `POST …/sprints/:sprintId/start` · `POST …/sprints/:sprintId/complete` |
| Activity and audit | `GET /api/workspaces/:slug/tasks/:id/activity` · `GET /api/workspaces/:slug/activity?area=&actor=&before=&format=csv` |
| Sessions | `GET /api/profile/sessions` · `DELETE /api/profile/sessions/:id` · `POST /api/profile/sessions/revoke-others` |
| Workspaces, members, roles, invitations, profile | see `server/src/routes/` |

Task list query parameters: `status`, `search` (title or description), `project`, `label`, `assignee=me|<userId>`,
`sort=createdAt|deadline|priority|position`, `from`, `to`. Tasks are shared by the workspace team (RBAC decides who
can read, edit or delete); use `assignee=me` for "my tasks".

## Getting started

Requirements: Node.js 22+, pnpm 10+, MongoDB 7+ (local or Atlas). Check them with:

```bash
node -v && pnpm -v && mongosh --quiet --eval "db.runCommand({ ping: 1 })"
```

```bash
pnpm install
cp server/.env.example server/.env      # then set JWT_SECRET (openssl rand -hex 32)
cp client/.env.example client/.env

cd server
pnpm seed      # local demo workspace and tasks (refuses non-local databases)
pnpm dev       # API on http://localhost:5000

# in another terminal
pnpm --filter client dev                 # web app on http://localhost:5173

## Branching and releases

- `main` is always deployable; production (Vercel) deploys from it.
- Work happens on `feature/<topic>` or `fix/<topic>` branches, merged through pull requests.
- CI (GitHub Actions) must be green before merging: type checks, lint, unit tests, integration tests on MongoDB 7, build.

## Verified on the deployed app

Sign up → create a workspace → create, edit, filter, sort and delete tasks → board drag and drop → calendar and
timeline → projects, sprints and subtasks → invite a teammate with a role → sign out. Checked on
https://taskman-mauve.vercel.app after each release (desktop and a 375 px phone viewport).

## Known limitations

- Email delivery needs `RESEND_API_KEY` (or SMTP) in the host settings; until then sign-ups are auto-verified.
- The session token is kept in `localStorage` (an HttpOnly cookie is planned now that the app is same-origin).
- No real-time updates between teammates yet: reload to see others' changes.
- Offline mode is read-only (the app shell and last data are cached; edits need a connection).
- Deleting a task asks for confirmation and can still be undone for 6 seconds.

