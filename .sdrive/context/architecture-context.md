# Architecture Context

<!-- generated during SpecDrive onboarding (brownfield) on 2026-10-16 -->

## Observed Project Facts

### Repository shape

```
server/src/
  models/       25 Mongoose schemas (User, Session, Workspace, Role, Task, Project, Sprint, ...)
  controllers/  31 route handlers
  routes/       21 Express routers mounted under /api/*
  middleware/   authMiddleware (protect), permissionMiddleware, uploadMiddleware
  config/       db, env, permissions, sso
  utils/        30+ pure/helper modules (taskQuery, taskGraph, roleAccess, secretBox, totp, webPush, gridfs...)
  scripts/      seed, seedWorkspace
  __tests__/    unit tests
  __integration__/ integration tests (real MongoDB)

client/src/
  components/ui/  shadcn Base UI primitives (generated)
  components/     app shell (Sidebar, SettingsLayout, StatCard, FormDialog, ds/*)
  components/ds/  design-system components (Surface, EmptyState, SkeletonList, Field, Alert, toast)
  features/       20 feature modules (tasks, projects, planning, flow, notifications, wiki, ...)
  hooks/, utils/, pages/, pwa/, config.ts
```

<!-- source: server/src and client/src listings -->

### Request pipeline (API)

1. Express app assembly, Helmet, CORS allowlist, `trust proxy`, JSON body limits and rate limiters (`server/src/app.ts`).
2. Router in `server/src/routes/*.ts` declares the path, the `express-validator` chain and the middleware order.
3. `protect` resolves the JWT and the database session, then attaches the authenticated user (`middleware/authMiddleware.ts`).
4. `requirePermission('<area>:<action>')` attaches `req.workspace`, `req.role` and `req.permissions` for workspace-scoped routes (`middleware/permissionMiddleware.ts`, `config/permissions.ts`).
5. The controller in `server/src/controllers/*.ts` validates input, applies the permission result and queries Mongoose models.
6. **All workspace-scoped queries filter by `req.workspace._id`; cross-workspace data access is not possible by construction.** <!-- source: AGENTS.md -->

<!-- source: server/src/app.ts, routes, middleware, AGENTS.md -->

### Boundaries and modules

- Workspace routes are permission scoped: `/api/workspaces/:slug/...` mounted through `protect` then `requirePermission`. <!-- source: server/src/routes/workspaceRoutes.ts -->
- Roles are assigned only through `server/src/utils/roleAccess.ts` (`findAssignableRole`, `canGrantRole`); role documents are seeded by `utils/seedRoles.ts`. <!-- source: AGENTS.md, server/src/utils/roleAccess.ts -->
- Custom workflow columns map to the canonical Pending / In progress / Completed buckets via `server/src/utils/workflow.ts`, so burndown, velocity and flow reports keep working. <!-- source: README.md, server/src/utils/workflow.ts -->
- Task graph logic (dependencies, cycles) is pure and unit tested: `server/src/utils/taskGraph.ts`; task filtering/sorting is `server/src/utils/taskQuery.ts`. <!-- source: server/src/utils, AGENTS.md -->
- Client feature modules are the unit of reuse. A feature exposes its public surface through its `index.ts`, and other code imports it as `@/features/<feature>`. <!-- source: AGENTS.md -->
- Task views implement the shared `TaskViewProps` contract (`client/src/features/tasks/views/types.ts`) and read data from the `useTasks` hook, which is the single source of truth with optimistic updates. <!-- source: AGENTS.md, client/src/features/tasks -->
- Secrets that must be read back (TOTP shared secrets) are encrypted with AES-256-GCM, HKDF-derived key and context binding in `server/src/utils/secretBox.ts`. <!-- source: server/src/utils/secretBox.ts -->
- Attachments are stored in GridFS through `server/src/utils/gridfs.ts` with sanitized file names (`middleware/uploadMiddleware.ts` → `sanitizeFilename`). <!-- source: server/src/utils/gridfs.ts, server/src/middleware/uploadMiddleware.ts -->
- Live updates use polling/change cursors (`utils/changeCursor.ts`, client `features/live`) rather than a websocket layer; presence is tracked in `models/presenceModel.ts`. <!-- source: server/src/utils/changeCursor.ts, client/src/features/live -->
- Authentication supports email verification, password reset, revocable database sessions, TOTP two-factor with recovery codes, and OIDC SSO (`controllers/authController.ts`, `utils/totp.ts`, `utils/recoveryCodes.ts`, `utils/oidc.ts`). <!-- source: server/src/controllers, server/src/utils -->

## Standard Best Practices (external)

- Separate transport (routes), authorization (middleware), orchestration (controllers) and persistence (models) concerns — Express routing guide: <https://expressjs.com/en/guide/routing.html>.
- Never build authorization on client-supplied identifiers: enforce it server-side per resource — OWASP Authorization Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>.
- Store only hashed credentials and use authenticated encryption for secrets that must be recovered — OWASP Cryptographic Storage Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html>.

## Assumptions

- No message queue, websocket server or background worker exists; anything that looks asynchronous is implemented with HTTP polling or a scheduler inside the API process. Marked `assumption`.
- `render.yaml` / `vercel.json` describe the same API twice (hosted alternatives); the Vercel deployment is the one referenced by the README. Marked `assumption`.
