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
- Notifications: bell with toasts for new items, inbox, @mentions, email preferences, and opt-in Web Push (VAPID) on each device
- Dashboard overview, Projects, Reports, Team page, searchable Help/FAQ, global search (Ctrl/Cmd + K)

### Scrum / agile
- **Projects** (folders with color, icon and key) → **sprints** → **tasks** → **subtasks**
- Work item types (story, task, bug, spike) and story points
- Product backlog per project; plan, start and complete sprints (unfinished work moves to the backlog or the next sprint)
- Sprint burndown, velocity history, one active sprint per project
- Scrum roles: Product Owner, Scrum Master, Developer, Team Member, Viewer
- Task keys like `WEB-12` (search by key, copy key or link); copy a git branch name, commit message or markdown link
- Board: quick filters (my tasks, bugs, due this week, blocked, unassigned), swimlanes by assignee/project/type,
  soft WIP limits per column; bulk edit in the list (status, priority, assignee, sprint, labels, delete)
- **Epic tree** per project: epics → tasks → subtasks, editable in place (add, link existing work, remove from epic)
- **Planning**: Roadmap (epics and sprints on a zoomable timeline that fills the page), Workload (points and tasks
  per person per sprint), Sprint report (committed, added, removed, completed and carried-over work)

- **Flow analytics** (Reports → Flow): cumulative flow diagram, cycle and lead time with p50/p85/p95, throughput
  per week and aging work in progress judged against the team's own 85th percentile
- **Automations** (Settings → Automations): "when … if … then …" rules such as "bugs start as high priority" or
  "assign whoever starts it", with ready-made templates, run counts and every change in the audit log
- Task **checklists**, **watchers** (follow a task to get its notifications), **duplicate** (optionally with subtasks)
  and **recurring tasks** (every N days, weeks or months, from the due date or from completion)

- **Custom workflow** (Settings → Workflow): board columns such as In review, QA or Blocked, each mapped to
  Pending / In progress / Completed so burndown, velocity and flow reports keep working; WIP limit per column;
  Scrum, Kanban and Simple templates
- **Sprint and project boards**: filter any view by project and sprint (`?project=…&sprint=active|backlog|<id>`),
  a scope bar with the sprint goal, dates and days left, "Open board" on every sprint, project shortcuts in the sidebar
- **Linked work**: relates to, duplicates, clones, blocks / is blocked by, shown on both tasks; convert a task into a
  subtask or promote a subtask; breadcrumb (project › epic › parent) in the task dialog
- **Time tracking**: estimates, a start/stop timer (one running per person, shown in the header), manual entries,
  logged vs estimate on cards, and a weekly **Timesheet** with CSV export
- **Releases** (project → Releases tab): versions with progress, a "Release" action that moves unfinished work,
  generated release notes (features, fixes, tasks) and release milestones on the roadmap
- **Custom fields** (Settings → Custom fields): text, number, date, select, multi-select, checkbox, URL and person
  fields per workspace or project, edited in the task dialog, required on create when needed, filterable by API
- **Import** (Settings → Import): Trello JSON, Jira CSV or any CSV, with a mapping step for statuses, people and types
- **Two-factor sign-in**: authenticator apps (TOTP) with one-time recovery codes; workspaces can require it
- **Single sign-on**: "Continue with Google / Microsoft" (OpenID Connect with PKCE), off until configured
- **Wiki** (sidebar → Wiki, or the project's Wiki tab): nested Markdown pages per workspace or project, live preview,
  task keys become links, version history with restore, edit conflicts detected
- **Live updates**: changes by teammates appear without reloading (a light change feed, no websockets needed), with an
  "Also viewing" indicator on tasks
- **List columns and filters**: choose list columns (including custom fields), filter by custom fields and releases,
  and save those filters in views

### Developer workflow
- **API tokens** (Settings → Developers): personal `tm_…` tokens limited to one workspace and to chosen scopes,
  never beyond the owner's role; only a hash is stored
- **Outbound webhooks**: HMAC-SHA256 signed events with a delivery log, test ping, redelivery and SSRF protection
  (see [SECURITY.md](SECURITY.md))
- **GitHub integration**: branches, pushes and pull requests that mention a task key (`WEB-12`) show up on the task;
  opening a PR starts the task, merging it completes it. Signed webhook, per workspace
- **Keyboard shortcuts** (`?` lists them): `c` new task, `/` search, `g` then a letter to jump between pages, and more
- **Saved views**: filters, sort and view live in the URL; save them per workspace, shareable by link
- **My work**: everything assigned to you, grouped by overdue, today, this week and later

### Enterprise
- **Audit log** (Settings → Audit log): who did what, when and from where, for tasks, projects, sprints, members,
  invitations and settings; filters, cursor pagination, CSV export; kept 365 days
- **Task activity** tab: field-by-field history of every task
- **Signed-in devices**: list sessions (7-day sign-in), sign out one device or all others; leave a workspace
- **Permission matrix**: roles × permissions overview with sticky headers
- CSV export of the task list; request ids on every response; health check reports the database
- Fast: route-level code splitting (sign-in loads ~174 kB gzip), cached data shown instantly and refreshed in the
  background, offline read cache in the PWA, HTTP revalidation with ETags
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
- Board on phones: one column at a time with a sticky status switcher and swipe; one-tap "Start → / Done ✓",
  "Move to…" sheet (long-press or ⋯ menu), per-column pagination
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
| Tasks (any of your workspaces) | same routes under `/api/workspaces/:slug/tasks`, plus `/:id/comments`, `/:id/attachments`, `PATCH /bulk`, `POST /bulk-delete` |
| Board settings | `GET/PUT /api/workspaces/:slug/board-settings` (WIP limits) · `DELETE /api/workspaces/:slug/members/me` (leave) |
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
```

### Optional: Web Push (device notifications)

Push is off until the API has a VAPID key pair. Generate one and add it to `server/.env` (or the host settings):

```bash
npx web-push generate-vapid-keys
```

| Variable | Meaning |
|---|---|
| `VAPID_PUBLIC_KEY` | Public key, shared with browsers |
| `VAPID_PRIVATE_KEY` | Private key. Keep it secret, never commit it |
| `VAPID_SUBJECT` | Contact for the push services: `mailto:you@example.com` or your https site URL |

People then turn push on per device under Settings > Notifications. On iPhone and iPad it works once the app is
added to the Home Screen. Changing the key pair later means everyone turns push on again.

### Optional: GitHub integration

An owner or admin turns it on in the GitHub card of Workspace settings, which shows the webhook URL
(`/api/integrations/github/<workspace-slug>`) and a generated secret. In the GitHub repository go to
Settings > Webhooks > Add webhook, paste both, choose `application/json`, and select the **Pull requests**,
**Pushes** and **Branch or tag creation** events. Deliveries without a valid `X-Hub-Signature-256` are rejected.
Mention task keys in branch names, PR titles or commit messages (`feature/WEB-12-login`, `Fix WEB-12`).

### Optional: Sign in with Google and Microsoft

Single sign-on uses OpenID Connect (authorization code with PKCE). Each provider is off until its client id **and** secret are
set; the sign-in and sign-up pages then show a `Continue with ...` button for it. Nothing else changes for people who use a password.

| Variable | Meaning |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client of Google |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | App registration of Microsoft (Entra ID) |
| `MICROSOFT_TENANT` | `common` (default: work, school and personal accounts), `organizations`, `consumers`, or one tenant id or domain |
| `API_PUBLIC_URL` | Only when the API is not served at `<CLIENT_URL>/api` (development: `http://localhost:5000/api`) |

The **callback (redirect) URL** to register is `https://<host>/api/auth/sso/<provider>/callback`, with `google` or `microsoft` as
the provider (locally `http://localhost:5000/api/auth/sso/google/callback`).

**Google.** In the Google Cloud console open APIs & Services > Credentials > Create credentials > OAuth client ID, type
*Web application*. Add the callback URL under *Authorised redirect URIs*, then copy the client id and secret. On the OAuth
consent screen the default scopes (`openid`, `email`, `profile`) are enough.

**Microsoft.** In the Entra admin center open App registrations > New registration. Pick the account types that match
`MICROSOFT_TENANT`, choose the platform *Web* and add the callback URL as the redirect URI. Under Certificates & secrets create a client
secret and copy its **value** (not the secret id). Under Token configuration add the optional claim `xms_edov` to the **ID token** if
people from several organizations should sign in (see the email rule below).

**Which email addresses are trusted.** A first sign-in matches or creates the account by email, so the provider must vouch for it.
Google: `email_verified` must be true. Microsoft: `email` (else `preferred_username` when it is an address) is used for personal Microsoft
accounts, when `MICROSOFT_TENANT` names a single organization, or when the `xms_edov` claim says the domain owner verified it. Otherwise
the sign-in is refused, because Entra lets a tenant set any address on its own users. After the first sign-in the stable provider id
identifies the person, and a method can be removed under Settings > Security.

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
- The session token is kept in `localStorage` (an HttpOnly cookie is planned now that the app is same-origin);
  sign-ins last 7 days and can be revoked per device.
- No real-time updates between teammates yet: reload to see others' changes.
- Offline mode is read-only (the app shell and last data are cached; edits need a connection).
- Deleting a task asks for confirmation and can still be undone for 6 seconds.

