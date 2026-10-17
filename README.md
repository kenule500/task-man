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
- **AI code review**: an agent checks whether a ticket's linked GitHub pull request implements its acceptance criteria
  (Match, Partial or Mismatch, with evidence per criterion and code issues). Opt-in per workspace; see
  [AI code review](#ai-code-review-alibaba-cloud-model-studio--dashscope)
- **Project from a document (AI)**: upload a requirements document (PDF, DOCX, TXT or Markdown) and the AI drafts the whole
  project: sprints, tasks, subtasks and acceptance criteria. You review and edit the plan, then create everything in one step.
  Same provider and opt-in as the code review; see
  [Create a project from a document](#create-a-project-from-a-document-ai)
- **Team chat**: real-time channels (#general, team and project channels, private channels), direct messages, @mentions
  that notify, unread badges, online status and typing indicators; works in English, French and Arabic (right to left).
  See [Team chat and realtime](#team-chat-and-realtime)
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

## AI code review (Alibaba Cloud Model Studio / DashScope)

The AI code review agent checks whether a ticket's GitHub pull request really implements the ticket. The flow is: a ticket with
**acceptance criteria**, a linked GitHub pull request, a review, and a result of **Match**, **Partial** or **Mismatch** with evidence
(file paths) for every criterion, the list of criteria that are missing, and code issues grouped by severity (security, bug, quality,
tests, performance). It uses the OpenAI-compatible endpoint of Alibaba Cloud Model Studio (DashScope) through the official `openai`
package, behind `server/src/utils/ai/provider.ts` so the provider can be swapped.

**Setup**

1. Create an API key in the Alibaba Cloud Model Studio console and add it to `server/.env` or the host settings. The feature stays off
   (`503 AI_DISABLED`) until `DASHSCOPE_API_KEY` is set.
2. Pick the endpoint that matches your account region. International accounts use the default; mainland China accounts use
   `https://dashscope.aliyuncs.com/compatible-mode/v1`.
3. Turn the feature on for a workspace: **Settings > Workspace > AI code review** (needs `settings:manage`). Nothing is sent to Alibaba
   Cloud until a workspace owner or admin does this, because the diff of the pull request and the ticket text leave TaskMan for a
   third-party processor.
4. Optional: save a read-only GitHub token (*Pull requests: read*) in the same card to review private repositories. It is stored
   encrypted, never returned by the API, and only used for repositories that the workspace's tasks already link to.
5. Optional: switch on **Review new commits automatically**. With the GitHub integration enabled, opening, updating or marking a linked
   pull request ready for review queues a review (drafts are skipped, and each commit is reviewed once).

| Variable | Default | Meaning |
|---|---|---|
| `DASHSCOPE_API_KEY` | none | Required to enable the feature. Keep it secret, never commit it |
| `DASHSCOPE_BASE_URL` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | Mainland China accounts: `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `DASHSCOPE_MODEL` | `qwen-plus` | Any chat model that supports JSON mode; `qwen-max` or `qwen3-coder-plus` are options for code-heavy reviews |
| `AI_REVIEW_DAILY_LIMIT` | `50` | Reviews a workspace may start per UTC day (`429 AI_DAILY_LIMIT` afterwards) |
| `AI_REVIEW_MAX_DIFF_CHARS` | `120000` | Characters of diff sent to the model per review. Lower it for models with a small context window (for example `qwen-max`: about `60000`) |

**Using it.** In a task, add acceptance criteria (Details tab), then use **Run AI review** in the AI code review panel under
Development. The API answers `202` at once and the review continues on the server (`waitUntil` from `@vercel/functions` on Vercel,
`maxDuration` 300 s); the panel polls until it is done. One review runs per task at a time. The result keeps the model name, token
usage and a history of the last 10 runs. Without explicit criteria the checklist and description are used, and the summary says so.

**Large pull requests.** About 120,000 characters of diff are sent. Source files come first, then tests, docs and configuration,
then lockfiles, generated and vendored files; binary files are skipped. Anything left out is listed in the result and the review is
labelled **Partial review** (it can never be a Match). Up to 300 changed files are read from GitHub.

**API**

| Route | Permission | Purpose |
|---|---|---|
| `POST /api/workspaces/:slug/tasks/:id/ai-review` `{ prUrl? }` | `tasks:write` | Queue a review (`202`); `prUrl` must be `https://github.com/<owner>/<repo>/pull/<n>` |
| `GET /api/workspaces/:slug/tasks/:id/ai-reviews` | `tasks:read` | Latest 10 reviews without the long parts |
| `GET /api/workspaces/:slug/tasks/:id/ai-reviews/:reviewId` | `tasks:read` | One review with criteria and issues |
| `GET /api/workspaces/:slug/ai` | `tasks:read` | `{ available, enabled, autoReview, model, dailyLimit, usedToday, githubTokenSet, plan: { dailyLimit, usedToday, maxChars, maxBytes } }` |
| `PATCH /api/workspaces/:slug/ai` `{ enabled?, autoReview?, githubToken? }` | `settings:manage`, never an API token | Change settings; `githubToken: null` removes the token |

**Costs.** Alibaba Cloud bills the key owner per input and output token of the chosen model; see the Model Studio price list for the
current rates. A review sends the ticket, the pull request text and up to `AI_REVIEW_MAX_DIFF_CHARS` of diff (roughly 10,000 to
40,000 input tokens for a large one) and receives about 1,000 to 3,000 tokens back. Every review records its token usage. Use
`AI_REVIEW_DAILY_LIMIT`, `AI_REVIEW_MAX_DIFF_CHARS` and a smaller model to cap spend. Security notes are in [SECURITY.md](SECURITY.md#ai-code-review).

## Create a project from a document (AI)

Upload a requirements document and let the AI build the project: details, sprints sized to your team, epics, tasks with story
points and priorities, subtasks for the bigger ones, and 2 to 6 testable acceptance criteria per task (Given/When/Then or checklist
style), plus the assumptions it made and the risks it sees. You read the plan, edit what you want, and create everything in one step.
It reuses the provider, key, model and workspace opt-in of the [AI code review](#ai-code-review-alibaba-cloud-model-studio--dashscope).

**Using it.** *Projects > Create with AI* (or the command palette, Ctrl/Cmd+K, "Create project with AI"), needs `projects:write` and
`tasks:write`.

1. **Upload.** Drop a PDF, DOCX, TXT or Markdown file (up to 4 MB). Optional: project name and key, sprint length (1 to 4 weeks),
   the day the first sprint starts (next Monday by default), team size, the language of the plan (English, French or Arabic; your
   interface language by default) and up to 500 characters of extra instructions. The page says plainly that the document text is sent
   to Alibaba Cloud Model Studio and links to the setting that turns AI on.
2. **Analyze.** The API answers `202` and the generation continues on the server (`waitUntil` on Vercel, `maxDuration` 300 s). The
   page polls, shows the phases and lets you cancel. The plan id is kept in the address (`?plan=`), so a reload or the back button
   picks the plan up again, and *Continue where you left off* lists your recent plans.
3. **Review.** A header card (name, key, description, Ready), then four tabs: **Sprints** (collapsible sections with dates, goal, week
   range and their tasks), **Tasks** (all of them, with a sprint selector to move a task), **Subtasks** and **Acceptance criteria**.
   Click a title, points or priority to change it, move tasks between sprints and the backlog, add or delete tasks (delete has Undo), edit
   subtasks and criteria, or **Regenerate** (the document stays in the browser tab only for this). A banner says when the document was
   too long and only the beginning and the section headings were analysed. Assumptions and risks are listed under the plan.
4. **Create.** One all-or-nothing operation: the project, its sprints (planned, with the computed dates), epics, tasks with workspace
   numbers (`KEY-n`), subtasks linked to their parents, criteria and estimates. If anything fails, everything written is taken back. A
   project name or key that is already used answers `409` with a free suggestion. The audit log gets `project.created`,
   `sprint.created` for each sprint and one `ai.plan_created` summary for the tasks.

| Variable | Default | Meaning |
|---|---|---|
| `AI_PLAN_DAILY_LIMIT` | `20` | Plan generations a workspace may start per UTC day (`429 AI_DAILY_LIMIT`). Separate from `AI_REVIEW_DAILY_LIMIT`; failures before the model is reached do not count, cancelled ones do |
| `AI_PLAN_MAX_CHARS` | `60000` | Characters of the document sent to the model. A longer document keeps its beginning (about 70%) and the section headings of the rest, and the plan is marked partial |
| `AI_PLAN_MAX_MB` | `4` | Largest upload. Vercel refuses request bodies above 4.5 MB before the API sees them, so keep it at 4 or below there |
| `AI_PLAN_MAX_OUTPUT_TOKENS` | `8192` | Size of the model's answer. Raise it for models that allow more (more items fit); a plan holds at most 120 tasks |
| `AI_PLAN_TIMEOUT_SECONDS` | `200` | Time the provider gets to answer (the function limit is 300 s, so a retry only happens when it still fits) |

**API** (all under `/api/workspaces/:slug/ai/plans`)

| Route | Permission | Purpose |
|---|---|---|
| `POST /` multipart: `file` and optional `projectName`, `projectKey`, `sprintLengthWeeks`, `startDate`, `teamSize`, `extraInstructions`, `language` | `projects:write` + `tasks:write` | Upload and queue (`202`). Errors: `503 AI_DISABLED` (no key, or AI off for the workspace), `413`, `415` (type checked by extension and first bytes), `422` (empty or unreadable), `429 AI_DAILY_LIMIT`, `409 PLAN_IN_PROGRESS` (one generation per person at a time) |
| `GET /` | `projects:read` | Your latest 10 plans, without their content |
| `GET /:id` | `projects:read`; the owner, or `settings:manage` | Status and, once `ready`, the plan (this is what the page polls) |
| `PATCH /:id` `{ plan }` | owner; `projects:write` + `tasks:write` | Save your edits, validated with the same schema (`400 PLAN_INVALID`) |
| `POST /:id/create` | owner; `projects:write` + `tasks:write` | Create the project (`201 { project, counts }`; `409` when it was already created or the name or key is taken) |
| `DELETE /:id` | owner | Delete the plan; one still generating is cancelled (`204`) |

**Limits.** At most 8 sprints, 12 epics, 120 tasks, 8 subtasks per task (300 in total), 6 criteria per task, 5 labels per task;
estimates are Fibonacci values up to 13. The model proposes and the server decides: unknown types and priorities are corrected,
estimates snapped to the scale, references checked, sprint dates computed from your start date and sprint length, and anything over
a limit is dropped. A plan is deleted automatically after 30 days.

**Reading files.** PDF text is read with `unpdf` (PDF.js without native code, so it runs in the Vercel function), DOCX text from
`word/document.xml` with `jszip` and a small linear reader, TXT and Markdown as UTF-8. Scanned PDFs have no text and are refused
with a hint to run OCR first; images inside documents are not read. Security notes are in [SECURITY.md](SECURITY.md#ai-project-from-a-document).

## Team chat and realtime

Open **Chat** in the sidebar (`/<workspace>/chat`). A `#general` channel exists for every workspace; anyone who can edit
tasks can create team channels (optionally private) and "Project chat" on a project page opens that project's channel.
Everyone can read and write messages and start direct messages (viewers included); only the author edits or deletes a message.
Typing `@` suggests members; a tagged member gets a bell notification (and a device push when enabled).

**How realtime works.** The web app opens one Socket.IO connection per signed-in session (`path: /api/socket`, no trailing slash,
`transports: ['websocket']`) and sends the session token in `auth.token`. Messages are written through the REST API
(`/api/workspaces/:slug/chat`) and then pushed to the other people in the channel. Events: `chat:message`,
`chat:message_updated`, `chat:message_deleted`, `chat:activity` (unread badges), `chat:channel`, `chat:typing` and
`presence:update`.

- **Locally** the Socket.IO server is attached to the API's HTTP server (`server/src/server.ts`), nothing else to run.
- **On Vercel** a second function, `api/socket.ts`, exports an `http.Server` running Socket.IO (Vercel Functions accept
  WebSocket upgrades, but not long polling, hence websocket-only). `vercel.json` routes `/api/socket/*` to it before the
  `/api/*` catch-all, gives it `maxDuration: 300` and lets the Content Security Policy open `wss:` connections.
- **Several instances.** A connection is pinned to one function instance and ends when the function's maximum duration is
  reached, and the REST function that saves a message is usually not the instance holding the recipient's socket. Events are
  therefore shared through MongoDB: socket instances use `@socket.io/mongo-adapter` on the capped collection
  `socket_io_events`, and the REST API publishes with `@socket.io/mongo-emitter` into the same collection. The adapter relies
  on change streams, so this needs a replica set (MongoDB Atlas always is one); on a standalone database such as a local
  `mongod` the server runs as a single instance, which is all local development needs.
- **Polling fallback.** The socket is only a speed-up. The client reconnects on its own (new token on every attempt) and,
  whenever it is not connected, the open channel polls `GET .../channels/:id/messages?after=<cursor>&changedSince=<time>`
  every 4 seconds (new messages plus edits and deletions) and the channel list refreshes every 20 seconds. After a reconnect
  it catches up once. Messages are de-duplicated by id, so a message that arrives by socket, poll and as the sender's own
  response is shown once. The channel header shows "Live" or "Refreshing" so people know which mode they are in.
- **Online status** is stored in the `chatpresences` collection (one row per person, workspace and server instance) with a
  TTL index, so rows of a stopped instance vanish by themselves.

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
- Task changes by teammates arrive by short polling (a few seconds); only chat uses WebSockets. On a database that is not a
  replica set, chat runs as a single server instance.
- Offline mode is read-only (the app shell and last data are cached; edits need a connection).
- Deleting a task asks for confirmation and can still be undone for 6 seconds.

