# TaskMan — Presentation Guide

A walkthrough of what the team built, how it works and how to demo it — prepared for Ghayth's review.

| | |
|---|---|
| **Live app** | https://taskman-mauve.vercel.app |
| **Design system (live)** | https://taskman-mauve.vercel.app/design-system |
| **Run locally** | API http://127.0.0.1:5000 · Web http://127.0.0.1:5173 (see §7) |
| **Repository** | https://github.com/kenule500/task-man (`main`) |
| **Detailed technical report** | [`docs/IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md) |
| **Design system docs** | [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) |

---

## 1. What TaskMan is

A MERN task manager for software teams: sign up, create or join a workspace, invite teammates with Scrum roles, organise
work as **projects → sprints → tasks → subtasks** (story points, burndown, velocity), and plan it in
**four synchronized views** — List, Board (Kanban), Calendar and Timeline (Gantt) — with comments, file attachments,
labels, assignees and dependencies. It is installable as a **PWA** and works on phones.

**Stack:** React 19 + Vite + TypeScript + Tailwind v4 + shadcn (Base UI) · Node.js + Express 5 + Mongoose 9 · MongoDB Atlas ·
Jest · GitHub Actions · Vercel.

## 2. Who did what

| Contributor | Contribution |
|---|---|
| **kenule** | Project scaffold, authentication (signup, email verification, JWT sessions, password reset), workspaces, **role-based access control** (5 system roles, custom roles, permission matrix, invitations, member management) |
| **raed** | Parallel task-management prototype with comments, uploads, labels, assignees, detail dialog and undo — merged and ported into the shared task module |
| **Mohamed Reda** | The four task views and task API; design system, style guide and PWA; mobile layouts; dashboard, projects, reports, team, settings and help pages; security review and fixes; integration of everyone's work; test suites (unit, real-database integration, browser end-to-end); CI; production deployment; documentation |

## 3. Demo script (≈10 minutes)

Seeded accounts in `demo-workspace` — one per role. The shared test password is `DEMO_PASSWORD` in
`server/src/scripts/seed.ts`.

| Role | Email | What it shows |
|---|---|---|
| Product Owner | `demo@taskman.test` | Everything, including settings and roles |
| Scrum Master | `scrum@taskman.test` | Manages tasks, can't change settings |
| Developer | `dev@taskman.test` | Creates and edits tasks, can't delete them |
| Team Member | `member@taskman.test` | Works on tasks |
| Viewer | `viewer@taskman.test` | Read-only |

1. **Landing → Sign in as Product Owner.** Dashboard: stats, *Due this week*, *Overdue*, quick links to the views.
2. **Tasks → List.** Inline edit a title, status, priority or due date; filter by status pills, label, priority,
   "Assigned to me"; search.
3. **Open a task's details** (panel icon): labels, assignees, dependencies, **upload a file** (thumbnail + toast),
   **add a comment** (Ctrl/Cmd + Enter).
4. **Board.** Drag a card between Pending → In Progress → Completed (or use the card menu "Move to…" — keyboard friendly).
5. **Calendar.** Drag a task to another day; click a day to create a task due that day.
6. **Timeline (Gantt).** Bars from start to due date, **dependency arrows**, red dashed arrows for scheduling conflicts;
   drag or use arrow keys to move, Shift + arrows to resize.
7. **Delete a task** → confirm → **Undo** in the toast: the task comes back (nothing was deleted on the server).
8. **Projects → Website v1.** Folder cards; open the project: active sprint with burndown, planned and completed
   sprints, the backlog (move a story into a sprint), subtasks checklist in a story's details. Complete a sprint to see
   unfinished work move to the backlog. **Ctrl/Cmd + K** finds any page, task, project, sprint or help answer.
9. **Team Members / Settings.** Roles, invitations, custom roles with a permission matrix, regenerate the invite code.
10. **Sign out → sign in as Viewer.** Same board, **read-only**: no "Add Task", no drag, Team and Settings hidden;
   direct API writes return **403**.
11. **Phone.** Resize to 375 px (or open on a phone): bottom navigation with a New task button, week-strip calendar,
    status tabs on the board, installable as an app (PWA).
12. **Design system.** `/design-system`: foundations, 34 documented components, patterns, content and accessibility rules.

## 4. Architecture

```
Browser (React SPA, PWA)
   │  same origin
   ▼
Vercel ── static web app (client/dist)
   └── /api/*  → Vercel function → Express app (server/src/app.ts)
                                    ├── protect (JWT + hashed DB sessions)
                                    ├── requirePermission('tasks:write' …)  ← RBAC on every workspace route
                                    └── MongoDB Atlas (data + GridFS for attachments)
```

- **Client:** `features/tasks` (shared hook `useTasks` with optimistic updates, pure `lib/` logic, four views on one
  `TaskViewProps` contract), `components/ds` (design system), `components/AppShell` (guarded page frame).
- **Server:** controllers + express-validator, `requirePermission` middleware, `utils/roleAccess.ts` (role scoping and
  privilege ceiling), GridFS attachments, memoized readiness so the same app runs as a server or a serverless function.

## 5. Security highlights

- Passwords hashed (bcrypt); **session, verification, reset and invitation tokens stored as SHA-256 hashes**.
- **RBAC enforced on the API**, not just hidden in the UI; privilege ceiling — nobody grants more access than they have;
  only the owner grants Product Owner.
- Invitations bound to the invited email, claimed atomically; invite codes always join as Viewer.
- Input validation against NoSQL operator injection; rate limits on login/reset/join/invitations.
- Attachments: type allow-list (no SVG/HTML), size limit, members-only downloads with `Content-Disposition: attachment`.
- Production headers: strict CSP, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`.
- `pnpm audit --prod`: **0 vulnerabilities**. Details: [`IMPLEMENTATION_REPORT.md` §5](IMPLEMENTATION_REPORT.md#5-security-review-and-fixes).

## 6. Testing (Jest everywhere)

| Suite | Command | Tests |
|---|---|---|
| Server unit tests | `pnpm --filter server test` | 128 |
| Server **integration** tests on a real MongoDB | `pnpm --filter server test:integration` | 202 |
| Client unit/component tests | `pnpm --filter client test` | 413 |
| Coverage reports | `pnpm --filter server test:coverage` · `pnpm --filter client test:coverage` | — |
| Type checks / lint / build | `pnpm --filter client typecheck && pnpm --filter client lint && pnpm --filter client build` | — |

All of them run in **GitHub Actions** on every pull request (the integration suite against a MongoDB 7 service container).
The integration suite found 12 real bugs before release; browser end-to-end testing found 3 more — all fixed.

## 7. Run it locally

```bash
pnpm install
# API (local MongoDB) — auto-verifies signups so no email is needed
cd server
MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm seed            # demo workspace + role accounts
DEV_AUTO_VERIFY=true MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm dev
# Web app (another terminal, from the repo root)
pnpm --filter client dev                                         # http://localhost:5173
```

Add demo tasks to any existing workspace: `pnpm --filter server seed:workspace -- --slug <slug>`.

## 8. Email

Sign-ups are auto-verified for now (`DEV_AUTO_VERIFY=true`), so testers can sign up without email. Real emails
(verification, password reset, invitations) are sent through **Resend** as soon as `RESEND_API_KEY` is set in Vercel;
SMTP is supported too. With Resend's test sender, emails only reach the Resend account owner until a domain is verified.

## 9. What's next

Rotate the database password (old one is in git history), verify a sending domain in Resend, move the JWT to an
HttpOnly cookie (simple now that the app is same-origin), and add real-time updates between teammates.
