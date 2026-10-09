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
- Tasks: title, description, status, priority, start/due dates, project, dependencies
- Views: List (inline editing), Board (drag and drop), Calendar (drag to reschedule), Timeline (Gantt with dependency arrows)
- Search, status and priority filters, sorting (also available as API query parameters)
- Dashboard overview, Projects progress, Reports, Team page

### Role-Based Access Control (RBAC)
- 5 system roles seeded on server startup — cannot be renamed or deleted
- Custom roles per workspace with a permission matrix editor
- 10 atomic permissions grouped by area (projects, tasks, users, reports, settings)
- Route guards, sidebar filtering, and button gating driven by the user's role in the active workspace
- Automatic self-healing — orphaned member entries get a sensible default role on first request

### Progressive Web App
- Installable (Chrome/Edge "Install app", iOS Safari "Add to Home Screen")
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