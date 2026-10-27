---
name: server-route-rbac
description: How to add or change a TaskMan API endpoint, including the protect + requirePermission chain, express-validator rules, workspace scoping and the Jest tests that must accompany it.
version: 1.0.0
tags: [server, express, mongoose, rbac, api]
source: custom (derived from AGENTS.md and server/src)
license: project-internal
last_updated: 2026-10-16
---

# Adding a server route in TaskMan

Use this when a change adds or modifies an HTTP endpoint under `server/src/routes/`.

## Anatomy of a route

Every workspace endpoint follows the same five-part chain, in this order:

```ts
// server/src/routes/taskRoutes.ts (shape, not a literal excerpt)
router.post(
  '/:slug/tasks',
  protect,                                  // 1. JWT + database session → req.user
  requirePermission('tasks:write'),         // 2. role check → req.workspace, req.role, req.permissions
  body('title').trim().notEmpty(),          // 3. express-validator chain
  taskController.createTask                 // 4. controller (thin, orchestrates)
);
```

1. **`protect`** (`server/src/middleware/authMiddleware.ts`) resolves the bearer token and its database session.
2. **`requirePermission('<area>:<action>')`** (`server/src/middleware/permissionMiddleware.ts`) reads the workspace slug from `req.params.slug`, `req.params.workspaceSlug` or `req.query.workspaceSlug`, verifies membership, loads the role and attaches `req.workspace`, `req.role`, `req.permissions`. It also enforces the workspace two-factor policy.
3. **Validation** is declared on the route, not inside the controller: `body(...)`, `param(...)`, `query(...)` from `express-validator`, with a final `validationResult` check in the handler.
4. **The controller** (`server/src/controllers/*.ts`) stays thin: validate, apply the permission decision, call models or `utils/`, respond.
5. **Mounting** happens in `server/src/app.ts`, which also holds Helmet, the CORS allow-list, `trust proxy` and the rate limiters.

## Permission catalog

- Permissions are declared once in `server/src/config/permissions.ts` (`PERMISSIONS`, e.g. `tasks:write`, `settings:manage`). `PermissionKey` is derived from it, so `requirePermission` is type-checked.
- A brand-new permission must be added to `PERMISSIONS` **and** granted in the relevant entry of `SYSTEM_ROLES`; system roles are seeded by `server/src/utils/seedRoles.ts`.
- Roles and role assignment never bypass `server/src/utils/roleAccess.ts` (`findAssignableRole`, `canGrantRole`).

## Non-negotiable rules

- **Always scope by workspace.** Queries filter on `req.workspace._id` (constitution CON-106). Never trust a workspace or owner id supplied by the client.
- **Relative imports carry `.js`** because the server is ESM + `NodeNext` (CON-102): `import X from '../models/xModel.js'`.
- **Validate before you query.** Cast/validate ids (`mongoose.Types.ObjectId`) and never interpolate user input into a query object (CON-516).
- **Keep logic pure where possible**: put decisions in `server/src/utils/`, e.g. `taskGraph.ts`, `taskQuery.ts`, and unit test them.
- **Never read `process.env` ad hoc** — add the variable to `server/src/config/env.ts` instead (CON-206).
- Uploads go through `middleware/uploadMiddleware.ts` (MIME allow-list + `sanitizeFilename`).
- Errors: respond with `{ message }` (plus a `code` when the client must branch, e.g. `TWO_FACTOR_REQUIRED`), and use the existing HTTP status conventions (400 validation, 401 unauthenticated, 403 not a member / missing permission).

## Tests to add

- Pure helper → `server/src/__tests__/<name>.test.ts` with no database (CON-407).
- Route/controller behaviour → `server/src/__tests__/` with models mocked, or `server/src/__integration__/` when a real MongoDB is needed (`pnpm --filter server test:integration`).
- Name tests after the acceptance criteria they cover (CON-405), e.g. `it('AC-004 rejects a task without a title', ...)`.
- Run `pnpm --filter server test`, then `pnpm --filter server typecheck`.

## Common pitfalls

- Forgetting `requirePermission` on one route of a router — the route then serves every member of the workspace regardless of role.
- Using `req.params.slug` inside the controller without `requirePermission` before it: `req.workspace` will be `undefined`.
- Declaring the validator chain after the controller (it never runs).
- Returning other workspaces' documents because the query forgot the `req.workspace._id` filter.
