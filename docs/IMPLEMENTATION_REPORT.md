# TaskMan — Integration, Security Hardening, UI/UX Upgrade & Deployment

**Author:** Mohamed Reda · **Branch:** `feature/integrate-and-harden` · **Date:** October 2026
**Live app:** https://taskman-mauve.vercel.app

This report describes the work done to bring the latest TaskMan code together, close the remaining gaps,
secure it, test it end to end and deploy it, so the app can be tested and scored as one coherent product.

---

## 1. Summary

| Area | Result |
|---|---|
| Team integration | kenule's RBAC work (already on `main`) and raed's task branch (`origin/task`) merged into one task system; raed's unique features ported and credited |
| Broken `main` | CI on `main` was red after the RBAC commit (1 lint error, 5 stale tests) — fixed |
| Security | 3 critical, 4 high and 8 medium/low issues fixed; task routes now enforce RBAC; `pnpm audit --prod` → 0 vulnerabilities |
| New features | Task details dialog, comments, file attachments (GridFS), labels, assignees, undo-on-delete, toasts, permission-aware UI |
| UI/UX | RBAC pages on the design system, honest landing page, better auth forms, dashboard checklist, mobile layouts, accessibility fixes |
| Tests | 120 server unit + **184 API integration tests on a real MongoDB** + 192 client tests; browser end-to-end pass |
| Bugs found & fixed | 12 product bugs found by the integration suite + 3 UI bugs found in browser testing |
| Deployment | Vercel, single origin (web app + API function), MongoDB Atlas, security headers, demo accounts per role |

---

## 2. Starting point (what was on GitHub)

- **`main`** contained the four task views (List, Board, Calendar, Timeline), the design system and PWA (PRs #1–#5),
  plus **kenule's RBAC work** (roles, permissions, invitations, member management) added in two commits titled "readme".
  CI on `main` was **failing** since that commit.
- **`origin/task`** — **raed's branch** — a parallel implementation of task management on the old base, with extra
  features: comments, file uploads, labels, assignees, a task detail dialog and an undo toast.
- Task routes still used a membership-only check, so **any member, including Viewers, could create, edit and delete tasks**.

---

## 3. How the work was done

1. Created `feature/integrate-and-harden` from the latest `origin/main`.
2. Merged `origin/task` with a real merge commit (history and authorship preserved), resolved the 13 conflicts in favour of
   the tested implementation on `main`, removed the duplicate views, then **ported raed's unique features** into the shared
   task module in follow-up commits marked `Co-authored-by: raed boum`.
3. Fixed the red CI, then ran a dedicated **security review** of the new RBAC/invitation code and fixed every finding.
4. Built the new task features (server + client) and upgraded the UI/UX of every page.
5. Wrote an **API integration suite against a real MongoDB**, which found 12 product bugs → fixed.
6. Tested the production build **in a real browser** (Playwright) as different roles, on desktop and a 375px phone → fixed
   the UI bugs found.
7. Prepared and performed the **Vercel deployment**, verified it live, then merged into `main`.

Every change went through the quality gates: TypeScript (app + tests), ESLint, Jest, production build.

---

## 4. Integration of raed's branch

**Technique:** `git merge --no-ff origin/task`, conflicts resolved with `--ours` for files where `main` already had the
tested implementation (`taskModel`, `taskController`, `taskRoutes`, `TaskPage`, `features/tasks/*`, `server.ts`, …).
Duplicate client files from the branch (`TaskBoardView`, `TaskListView`, `KanbanCard`, `useTasks`, …) were removed so there is
**one** task system. Dependencies that became unused (`@dnd-kit/*`, `date-fns`) were dropped; `multer` was kept for uploads.
raed's DNS override for `mongodb+srv` lookups became opt-in (`MONGO_DNS_SERVERS`) instead of applying to every deployment.

**Ported features (server):**
- `labels` (max 10 × 40 chars, de-duplicated), `assignees` (validated as workspace members), `comments`, `attachments` on the Task model.
- Attachments are stored in **MongoDB GridFS** (`utils/gridfs.ts`) instead of the local disk: they survive serverless hosting
  and are **never served publicly** (raed's version exposed `/uploads` statically). Upload via `multer.memoryStorage`, MIME
  allow-list without SVG/HTML (stored XSS), sanitised names, UTF-8 names, 4 MB default (`ATTACHMENT_MAX_MB`), 20 files per task.
  Downloads stream from GridFS with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- New endpoints (all behind `protect` + `requirePermission`):

| Method & path (under `/api/workspaces/:slug/tasks`) | Permission |
|---|---|
| `GET /` · `GET /:id/attachments/:attachmentId` | `tasks:read` |
| `POST /` · `PUT/PATCH /:id` · `POST /:id/comments` · `POST /:id/attachments` | `tasks:write` |
| `DELETE /:id/comments/:commentId` | author, or `settings:manage` |
| `DELETE /:id/attachments/:attachmentId` | uploader, or `tasks:delete` |
| `DELETE /:id` | `tasks:delete` |

**Ported features (client)** — in `client/src/features/tasks`:
- `TaskDetailDialog` with `TaskAttachments` (upload progress, drag & drop, image previews, authenticated download) and
  `TaskComments` (Ctrl/Cmd+Enter to send).
- `LabelInput` (chips with suggestions), `AssigneePicker`, `TaskChips` (deterministic label colours, avatar stacks).
- **Undo on delete:** `useTasks` hides the task immediately and sends the DELETE only after 6 s (flushed on `pagehide`).
- Toast system added to the design system (`components/ds/Toaster.tsx`, `toastStore.ts`).
- Permission gating with kenule's `usePermissions`: without `tasks:write` the views become read-only (no "Add Task",
  no inline edits, no drag); without `tasks:delete` the delete action is hidden.

---

## 5. Security review and fixes

A focused review of the RBAC and invitation code, then fixes with unit and integration tests.

| Severity | Issue (before) | Fix | Files |
|---|---|---|---|
| Critical | `POST /workspaces/join` accepted a `roleId` from the client → anyone with an invite code could join as **Product Owner** | Invite codes always grant **Viewer**; code format validated | `workspaceController.ts` |
| Critical | `requireUserId` returned an ObjectId, so "you can't change your own role" never matched → **self-promotion** | Returns a string | `utils/controllerHelpers.ts` |
| Critical | Role ids not scoped → roles from **another workspace** (or any role via `{"$ne": null}`) could be assigned | `findAssignableRole()` only accepts system roles or the workspace's own roles, string ObjectIds only | `utils/roleAccess.ts`, `memberController.ts`, `invitationController.ts` |
| High | Task routes only checked membership → **Viewers could write/delete tasks** | `requirePermission('tasks:read/write/delete')` on every task route | `routes/taskRoutes.ts` |
| High | No privilege ceiling → a `users:write` holder could grant Product Owner or roles above their own | `canGrantRole()`: only the owner grants Product Owner; others only within their own permissions (also for custom role create/edit) | `utils/roleAccess.ts`, `memberController.ts`, `roleController.ts` |
| High | Invitations not bound to the invited email; race on accept | Accept/decline require the invited account; atomic claim with `findOneAndUpdate`; role re-validated | `invitationController.ts` |
| High | Invitation tokens stored in plain text, returned by the list endpoint and logged | SHA-256 hashed like all other tokens; excluded from responses and logs | `invitationController.ts`, `utils/invitationHelpers.ts` |
| Medium | Public invitation preview exposed the invitee's and inviter's emails | Email masked, inviter email removed; `Referrer-Policy: no-referrer` | `invitationController.ts`, `vercel.json` |
| Medium | HTML injection in invitation emails (workspace/user names) | Values HTML-escaped | `utils/emailTemplates.ts` |
| Medium | Brute-force targets only had a generic rate limit | 20 req / 15 min on login, password reset, resend, join, invitations, password change | `app.ts` |
| Medium | Password change revoked **all** sessions (a local "hash" helper never matched hashed sessions); 6-char policy; unvalidated profile fields (`javascript:` avatar URLs, objects → 500) | Shared token helpers, 8-char policy, string/length checks, http(s)-only avatars | `profileController.ts` |
| Medium | Custom role "in use" check only looked at one workspace | Checked across all workspaces | `roleController.ts` |
| Low | 403 responses revealed role names and permission keys; `__proto__`/`constructor` accepted as permissions | Generic 403; own-property permission check | `permissionMiddleware.ts`, `utils/roleHelpers.ts` |
| Deps | 4 advisories (3 high) | `shadcn` CLI moved to devDependencies; overrides for `source-map-js`, `@modelcontextprotocol/sdk`; `pnpm audit --prod` = **0**. `braces`/`sprintf-js` have no patched release and are dev-only | `client/package.json`, `pnpm-workspace.yaml` |

**HTTP security headers** (production, `vercel.json`): strict **Content-Security-Policy** (`default-src 'self'`,
`connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), **HSTS**, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
The API also keeps `helmet` and a CORS allow-list.

---

## 6. UI/UX upgrade

- **Design-system adoption:** kenule's RBAC pages and modals (Team members, Workspace settings & roles, Invite member,
  Accept invite, Forbidden) rebuilt with `PageHeader`, `Surface`, `Alert`, `Field`, `Tag`, `UserAvatar`, `SkeletonCards`.
  New shared `FormDialog` (full-screen on phones) and `ConfirmActionDialog` replace `window.confirm`/`alert`.
- **Layout:** `WorkspaceLayout` guards routes with loading/error states; fixed a **nested double sidebar**
  (`components/shellContext.ts`); keyboard-friendly menus; skip link.
- **Auth pages:** validation on blur and submit, password visibility toggle and strength hint, autocomplete attributes,
  clear errors; fixed onboarding's dead redirect and double requests in StrictMode.
- **Dashboard:** "Get started" checklist driven by real data (create a task, invite a teammate, try the board).
- **Landing page:** removed made-up claims, fake logos, stats and pricing; real feature and roles sections; mobile menu.
- **Task views:** dedicated, aligned Assignees column; two-row toolbar; label/assignee filters; details from every view.
- **Accessibility:** AA contrast for meta text, global `prefers-reduced-motion` rule, labelled icon buttons, focus states,
  40 px touch targets on phones.
- **Help page:** keyboard shortcuts (N, /, 1–4) and a roles & permissions guide.

---

## 7. Testing

| Suite | Scope | Result |
|---|---|---|
| Server unit (Jest) | controllers, middleware, RBAC rules, query builders, uploads | **120 / 120** |
| Server integration (Jest + supertest, real MongoDB) | 13 files: auth, password reset, profile, workspaces, join, RBAC, invitations, tasks, comments, GridFS attachments, headers/CORS | **184 / 184** |
| Client (Jest + Testing Library) | design system, task libs, views, detail dialog, permissions, toasts, auth validation, checklist | **192 / 192** |
| Browser end-to-end (Playwright, production build) | Product Owner and Viewer flows, desktop and 375 px | passed, 3 UI bugs fixed |

**Integration suite technique:** each test file boots the real Express app against its own throwaway database
(`taskman_it_<random>`), mocks only the email sender to capture verification/reset/invitation links, and drops the database
afterwards. CI runs it against a MongoDB 7 service container (`.github/workflows/ci.yml`, `pnpm test:integration`).

**Bugs found by the integration suite and fixed:**
1. Two logins in the same second produced the **same JWT**, so logging out one session left the other valid → unique `jti`.
2. A non-owner with `settings:manage` could **raise their own custom role** → privilege ceiling on custom roles.
3. Malformed role ids → **500** (CastError) → 404.
4. Attachment names with accents/CJK were **mangled** (latin1) → UTF-8 decoding.
5. Names were HTML-escaped at storage (`O'Brien` → `O&#x27;Brien`) → stored as typed, escaped where rendered.
6. Several inputs returned **500 instead of 400** (long names, non-string workspace names, unknown theme,
   non-boolean notification switches — which also reset the switches not sent).

**Browser test flow:** login → dashboard → list → task details → add comment → upload PNG (thumbnail + toast) →
download (correct bytes; `Content-Disposition` + `nosniff`) → SVG upload rejected → delete + **Undo** (task restored, never
deleted server-side) → logout → **Viewer**: read-only board, no "Add Task", no drag, Team/Settings hidden, direct API writes
→ 403 → phone layout (375 px, no horizontal scroll).
**UI bugs found and fixed:** misaligned assignee avatars, avatar initials overflowing their circles (the avatar primitive
hard-coded `text-sm`), and a toolbar wrapping a single pill.

---

## 8. Deployment

**Architecture:** one Vercel project, **same origin** for the web app and the API.

```
https://taskman-mauve.vercel.app
├── /            → client/dist (Vite build, PWA, SPA rewrite to index.html)
└── /api/*       → api/index.ts  (Vercel function re-exporting the Express app)
                     └── MongoDB Atlas (database: taskman_prod, GridFS for attachments)
```

- `server/src/app.ts` builds the Express app with a **memoized readiness step** (connect → seed system roles → repair
  member roles) on the first request, so the same app runs as a long-lived server (`server.ts`) and as a serverless function.
  The DB connection is reused across warm starts and never calls `process.exit`.
- Same origin means **no CORS in production** and a strict `connect-src 'self'` CSP.
- `CLIENT_URL` defaults to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`.
- Environment variables (Vercel, marked sensitive): `MONGO_URI`, `JWT_SECRET` (new, 96 hex chars), `NODE_ENV=production`,
  `TRUST_PROXY=1`, `ATTACHMENT_MAX_MB=4`, `RATE_LIMIT_MAX`, `VITE_API_URL=/api`, `DEV_AUTO_VERIFY=true` (until an SMTP
  provider is configured, so testers can sign up).
- **Demo data:** `pnpm --filter server seed -- --force` creates `demo-workspace` with **one account per role** and a
  scheduled project with labels, assignees, comments and dependencies:

| Role | Email |
|---|---|
| Product Owner | `demo@taskman.test` |
| Scrum Master | `scrum@taskman.test` |
| Developer | `dev@taskman.test` |
| Team Member | `member@taskman.test` |
| Viewer | `viewer@taskman.test` |

The shared demo password is the `DEMO_PASSWORD` constant in `server/src/scripts/seed.ts` (test-only data).

---

## 9. Files modified (154 files vs `main`)

**Root / config:** `.github/workflows/ci.yml` (MongoDB service + integration step), `.gitignore`, `AGENTS.md` (working rules,
RBAC conventions), `DESIGN.md` (undo/toasts), `api/index.ts` (new, Vercel entry), `package.json` (new, workspace scripts),
`vercel.json` (new, build/rewrites/headers), `pnpm-workspace.yaml` (security overrides), `pnpm-lock.yaml`,
`perfect-ui-rules.md` (from raed's branch), `docs/IMPLEMENTATION_REPORT.md` (this file). Removed: tool-specific notes file,
`client/vercel.json`.

**Server — core:** `src/app.ts` (new), `src/server.ts`, `src/config/db.ts`, `src/config/env.ts`,
`src/middleware/permissionMiddleware.ts`, `src/middleware/uploadMiddleware.ts` (new), removed `src/middleware/workspaceMiddleware.ts`.

**Server — controllers & routes:** `authController.ts`, `invitationController.ts`, `memberController.ts`,
`profileController.ts`, `roleController.ts`, `taskController.ts`, `taskExtrasController.ts` (new), `workspaceController.ts`,
`routes/taskRoutes.ts`, `routes/workspaceRoutes.ts`.

**Server — models & utils:** `models/taskModel.ts`, `utils/roleAccess.ts` (new), `utils/gridfs.ts` (new),
`utils/controllerHelpers.ts`, `utils/emailTemplates.ts`, `utils/invitationHelpers.ts`, `utils/roleHelpers.ts`,
`utils/taskQuery.ts`, `scripts/seed.ts`.

**Server — tests:** `jest.integration.config.cjs` (new), `src/__integration__/*` (13 suites + harness, new),
`src/__tests__/{permissionMiddleware,rbacSecurity,taskExtras,taskRoutes}.test.ts` (new),
`src/__tests__/{security,taskController,taskQuery,workspaceSettings}.test.ts` (updated), `package.json`, `tsconfig.json`.

**Client — task feature (`src/features/tasks`):** new `components/{TaskDetailDialog,TaskAttachments,TaskComments,
TaskChips,LabelInput,AssigneePicker}.tsx`, `hooks/useWorkspaceMembers.ts`, `lib/{files,labels}.ts`; updated `api.ts`,
`types.ts`, `index.ts`, `hooks/useTasks.ts`, `lib/{date,filters,taskForm}.ts`, `components/{InlineEdit,TaskActionsMenu,
TaskFormDialog,TaskToolbar}.tsx`, all four `views/*`; removed `components/ConfirmDeleteDialog.tsx`; tests
`TaskDetailDialog`, `labels`, `permissions` (new), `filters`, `useTasks` (updated).

**Client — design system & shell:** `components/ds/{Toaster.tsx,toastStore.ts}` (new), `ds/primitives.tsx`, `ds/index.ts`,
`AppShell.tsx`, `WorkspaceLayout.tsx`, `Sidebar.tsx`, `SettingsLayout.tsx`, `shellContext.ts` (new),
`FormDialog.tsx`, `ConfirmActionDialog.tsx` (new), `CreateWorkspaceModal.tsx`, `InviteMemberModal.tsx`, `RoleEditorModal.tsx`,
`components/auth/*` and `components/dashboard/*` (new), `index.css`, `App.tsx`, `jest.setup.ts`, `package.json`.

**Client — pages:** `AcceptInvitePage`, `AuthPage`, `DashboardPage`, `ForbiddenPage`, `ForgotPasswordPage`, `HelpPage`,
`JoinWorkspacePage`, `LandingPage`, `NotificationsPage`, `OnboardingPage`, `ProfilePage`, `ResetPasswordPage`, `SecurityPage`,
`TaskPage`, `TeamMembersPage`, `VerifyEmailPage`, `WorkspaceSettingsPage`; removed dead `TeamPage`.
**Landing:** `CTA`, `DashboardMockup`, `Features`, `Footer`, `Hero`, `Navbar`, `Teams` (new), `landingAuth.ts` (new);
removed `About`, `Pricing`, `TrustedBy` (fake content).

---

## 10. Owner actions and known limitations

1. **Rotate the MongoDB Atlas password now.** The old credentials were committed in the repository history before
   `server/.env` was untracked, and they still work. After rotating, update `MONGO_URI` in Vercel.
2. **Email:** configure an SMTP provider (`EMAIL_HOST`, …) in Vercel and set `DEV_AUTO_VERIFY=false` to re-enable email
   verification; password-reset emails need SMTP.
3. The JWT is stored in `localStorage`; moving to an HttpOnly cookie is now simpler because the app is same-origin.
4. `braces` and `sprintf-js` advisories have no patched release yet (dev tooling only, not shipped).
5. No real-time sync between users; other members' changes appear after a reload.
