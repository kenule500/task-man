> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# workspaces-rbac — Workspaces, membership and role-based access control (v1)

| | |
|---|---|
| Feature | `workspaces-rbac` |
| Version | 1 |
| Status | Implemented and shipped |
| Governance | `.sdrive/governance/workspaces-rbac/v1/{spec,plan,tasks,traceability}.json` |
| Constitution | CON-103, CON-105, CON-106, CON-107, CON-109, CON-110, CON-402, CON-403, CON-404, CON-512, CON-515, CON-516, CON-704 |

## Overview

**Problem.** Every feature hangs off a workspace, and a workspace is only useful if the server can answer two
questions per request: is this person a member, and does their role allow this action? If that lives in each
controller, authorization drifts, and the moment a role id or a workspace id is taken from the request body a
member can grant themselves access or reach another workspace's data.

**Solution.** A workspace owns `members: [{ user, roleId, joinedAt }]`. Every workspace route is declared as
`protect` → `requirePermission('<area>:<action>')`, which loads the workspace by slug **plus membership**,
resolves the role, and attaches `req.workspace`, `req.role` and `req.permissions`
(`server/src/middleware/permissionMiddleware.ts`). Permissions come from one closed catalogue
(`server/src/config/permissions.ts`); roles are the five seeded system roles or workspace-local custom roles.
Role resolution and granting happen only in `server/src/utils/roleAccess.ts`, which rejects cross-workspace role
ids, non-string ids, and any grant above the actor's own permissions unless the actor owns the workspace.

**Audience.** Owners and admins managing people and settings, every member who needs to know what they may do,
and the API itself, which must never read or write across workspaces (CON-106).

**Assumptions recorded.**
- The five system roles and their permission sets are the contractual definition of owner, admin, developer,
  member and read-only access; custom roles are defined per workspace on top of the catalogue.
- The catalogue is closed: a new area or action means editing `server/src/config/permissions.ts` (mirrored in
  `client/src/features/developers/lib/catalog.ts`), not inventing keys at runtime.
- Workspace "admin" is a permission set (`settings:manage` + `users:write`), not a role name; `ROLE_LABELS` in
  `client/src/features/workspace/lib.ts` still carries the legacy `owner | admin | member` labels.
- `DEV_AUTO_VERIFY`, seeded demo accounts and `server/src/scripts/seed.ts` are setup concerns, not requirements
  (CON-506).

**Out of scope.** Two-factor authentication itself and SSO (`sso-2fa`) — only the workspace policy switch and
the point where it is enforced are covered here; permissions for tasks, projects, sprints, workflow and reports
beyond the fact that their routes call `requirePermission`; organisation-level administration, which does not
exist in this codebase; billing, seat counting and workspace deletion, which are not implemented.

## User stories and acceptance criteria

### US-001 — Create a workspace and be its Product Owner
*As* a signed-in user starting a team, *I want* to create a workspace from a name and own it from the first
second, *so that* I can invite people and configure it immediately.

- **AC-001** — `POST /api/workspaces` creates the workspace with the creator as `owner` and as a member holding
  the Product Owner role, a unique slug, a 12-hex invite code, and sets it active (`createWorkspace`).
- **AC-002** — A missing, empty, non-string or over-60-character name answers `400`, not `500`.
- **AC-003** — Same name twice → distinct slugs; a name without ASCII letters → the generic `workspace` slug
  (`generateSlug`).
- **AC-004** — `GET /api/workspaces` returns only the caller's workspaces with name, slug, owner, member names
  and role names — no invite codes, no account secrets (`getMyWorkspaces`).

### US-002 — Join a workspace with an invite code
*As* a teammate who received a code, *I want* to join and get a safe default role, *so that* I can see the
team's work without an admin hand-crafting my access.

- **AC-005** — `POST /api/workspaces/join` requires `/^[A-F0-9]{12}$/i` and answers `404 "Invalid invite code"`
  for an unknown code.
- **AC-006** — Joining stores the default Viewer role whatever `roleId` the body carries
  (`findDefaultRole`; asserted by `rbacSecurity.test.ts` "ignores a role sent by the client and assigns Viewer").
- **AC-007** — Joining a workspace you already belong to answers `400`.
- **AC-008** — A successful join adds the workspace to the user and makes it active; a regenerated invite code
  makes the old one stop working (`workspaceJoin.test.ts`).

### US-003 — Invite a teammate by email with a role
*As* an owner or member with `users:write`, *I want* to invite an address with a chosen role, *so that* the
invitee joins with exactly the access I intended.

- **AC-009** — `POST /api/workspaces/:slug/invitations` normalises the email, stores only the token hash with a
  3-day expiry, emails the accept link and never returns the token (`createInvitation`, `INVITE_EXPIRY_DAYS`).
- **AC-010** — Creating an invitation requires `users:write` and validates email and `roleId`
  (`validateCreateInvitation`).
- **AC-011** — A role id from another workspace answers `404`; a non-owner cannot invite above their own
  permissions or as Product Owner (`findAssignableRole`, `canGrantRole`).
- **AC-012** — Re-inviting an address expires the earlier pending invitation; inviting an existing member
  answers `400`.

### US-004 — Manage members, roles and access
*As* an owner or member with `users:write`, *I want* to see who is in the workspace, move people, remove them,
and know the server enforces my role, *so that* membership stays intentional.

- **AC-013** — `GET /api/workspaces/:slug/members` requires `users:read` and returns members sorted by system
  role order (`roleRank`), custom roles last, then by name, with only id, name, email, avatar, job title, role
  and `joinedAt`.
- **AC-014** — `PUT /api/workspaces/:slug/members/:userId/role` requires `users:write` and refuses a
  self-target with `400 "You can't change your own role"`.
- **AC-015** — The owner's role can never be changed (`403`), and a non-owner can neither grant a role above
  their own permissions nor hand out Product Owner.
- **AC-016** — `DELETE /api/workspaces/:slug/members/:userId` requires `users:write`, refuses the owner and the
  caller, and on success unassigns that member's tasks, pulls the workspace from their list and clears a stale
  `activeWorkspace`.
- **AC-017** — `DELETE /api/workspaces/:slug/members/me` lets a member leave with the same cleanup and answers
  `409` for the owner. The route is declared before `:userId` so `me` is never read as an id.
- **AC-029** — `requirePermission` answers `401` anonymous, `400` without a slug, `403` for a non-member, for a
  role missing the permission and for a membership without `roleId`, and attaches `req.workspace`, `req.role`
  and `req.permissions` on success (`permissionMiddleware.test.ts`).

### US-005 — Define custom roles from the permission catalogue
*As* an owner configuring access levels, *I want* to create, edit and delete workspace-local roles from the
catalogue, *so that* the team can express its own access levels without code changes.

- **AC-018** — `GET /api/workspaces/:slug/roles` requires `users:read` and lists system roles plus the
  workspace's own custom roles, system first (`listWorkspaceRoles`, sort `{ isSystem: -1, name: 1 }`).
- **AC-019** — Create/update/delete require `settings:manage`; the name is required, ≤ 60 characters and unique
  per workspace; the description is ≤ 280.
- **AC-020** — Unknown permission keys answer `400` (`getInvalidPermissions`), and a non-owner cannot create or
  update a role holding a permission they lack (`withinOwnPermissions`).
- **AC-021** — System roles and other workspaces' roles cannot be touched (`findCustomRoleOr404`), a malformed or
  unknown id answers `404` instead of `500`, and a role still assigned to a member answers `409`.
- **AC-022** — `GET /api/roles/permissions` serves the catalogue grouped by area to any logged-in user.
- **AC-030** — On boot the five system roles are upserted idempotently and members without `roleId` are repaired:
  legacy role strings map to their system role, otherwise the workspace owner becomes Product Owner and anyone
  else Viewer (`seedSystemRoles`, `repairMemberRoles`, run from `ensureReady` in `server/src/app.ts`).

### US-006 — Control workspace settings and the two-factor policy
*As* an owner or member with `settings:manage`, *I want* to rename the workspace, rotate the invite code and
require two-factor authentication, *so that* the workspace stays recognisable and access to it stays strong.

- **AC-023** — `GET /api/workspaces/:slug` hides member emails unless the caller has `users:read`, and the invite
  code unless the caller has `users:write` or `settings:manage` (`permissionsOf`).
- **AC-024** — `PUT /api/workspaces/:slug` requires `settings:manage`, renames with the trimmed name (≤ 60) and
  leaves the slug untouched (`updateWorkspace`, `validateUpdateWorkspace`).
- **AC-025** — `POST /api/workspaces/:slug/invite-code` requires `settings:manage` and returns a new 12-hex code.
- **AC-026** — Turning `require2fa` on answers `400 { code: 'OWN_TWO_FACTOR_REQUIRED' }` when the caller has no
  2FA themselves; `require2fa` must be a real boolean (`isBoolean({ strict: true })`).
- **AC-027** — While the policy is on, a member without 2FA receives `403 { code: 'TWO_FACTOR_REQUIRED' }` on
  workspace routes, while their account routes (`/api/profile/2fa`, `/api/auth/currentuser`) stay reachable so
  they can enable it.
- **AC-028** — Rename and policy changes each write a `workspace.updated` activity entry, and rotating the code
  writes `workspace.invite_code_regenerated` (`recordActivity`).
- **AC-031** — The web app resolves permissions from `GET /api/auth/currentuser` through
  `PermissionProvider`/`usePermissions` (`can`, `hasRole`) and the management screens degrade to read-only
  without the matching permission.

## Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | Creating a workspace makes the creator owner + Product Owner and generates slug and invite code. | AC-001…AC-003 |
| FR-002 | Workspace list/read/switch, with member emails and the invite code filtered by permission. | AC-004, AC-023 |
| FR-003 | Joining by invite code always assigns the default Viewer role, never one from the body. | AC-005…AC-008 |
| FR-004 | `requirePermission` is the single authorization gate and attaches the request context. | AC-027, AC-029 |
| FR-005 | Member list ordered by role seniority with public fields only. | AC-013 |
| FR-006 | Role change with self-change, owner and privilege-ceiling rules. | AC-014, AC-015 |
| FR-007 | Removal and leaving, with task unassignment and stale active-workspace cleanup. | AC-016, AC-017 |
| FR-008 | Invitation lifecycle: create, list, cancel, preview, accept, decline, single use, 3-day expiry. | AC-009…AC-012 |
| FR-009 | Custom role CRUD with catalogue validation, per-workspace uniqueness and in-use protection. | AC-018…AC-021 |
| FR-010 | Permission catalogue endpoint for the role editor. | AC-022 |
| FR-011 | Workspace settings: rename, invite-code rotation, `require2fa`, with audit entries. | AC-024…AC-026, AC-028 |
| FR-012 | System roles seeded and member roles repaired on every boot. | AC-030 |
| FR-013 | Client permission context drives which management actions are offered. | AC-031 |

## Non-functional requirements

| ID | Requirement | Constitution |
|---|---|---|
| NFR-001 | Every workspace route is `protect` → `requirePermission`, and every workspace query filters by `req.workspace._id`; membership lookups include `'members.user'`. | CON-106, CON-512 |
| NFR-002 | Roles are resolved/granted only through `roleAccess.ts` and produced only by `seedRoles.ts`. | CON-107 |
| NFR-003 | Role ids are validated as ObjectId strings before querying; malformed ids answer `404`, never a cast `500`. | CON-516 |
| NFR-004 | Unit tests for the middleware and access rules, integration tests for the flows. | CON-402, CON-403, CON-404 |

## Edge cases

| ID | Situation | Expected behaviour |
|---|---|---|
| EC-001 | A role endpoint is called with `"not-an-id"` | `404 "Custom role not found"`, never a Mongoose CastError `500` |
| EC-002 | The invited custom role is deleted before the invitation is accepted | `409` asking for a new invitation (the role is re-resolved at accept time) |
| EC-003 | A membership has no `roleId` (legacy data) | `403 "No role assigned in this workspace"`; `getCurrentUser` self-heals and `repairMemberRoles` fixes it on the next boot |
| EC-004 | Two requests accept the same invitation at once | The conditional `findOneAndUpdate` claims the row once; the other answers `400` |
| EC-005 | The invite code is rotated while a colleague joins with the old one | `404 "Invalid invite code"` |
| EC-006 | A role still assigned to a member is deleted | `409`; after the member is moved, deletion succeeds |
| EC-007 | The owner tries to leave, or is removed/demoted | Leave `409`, removal and role change `403`, so a workspace never loses its owner |
| EC-008 | Two workspaces define a custom role with the same name | Both allowed (partial unique index on `{ workspaceId, name }` where `isSystem` is false) |
| EC-009 | A personal API token is used outside its workspace or scopes | `403` "belongs to another workspace" / "does not have the required scope", and `req.permissions` is narrowed to the token scopes |

## Observations that are not requirements

- `repairMemberRoles` has no dedicated test file. Verified by searching `server/src/__tests__` and
  `server/src/__integration__`: there is no `seedRoles`/`repair` spec. Its effect is exercised indirectly, since
  `harness.startApp()` calls `ensureReady()`, which runs `seedSystemRoles` and `repairMemberRoles`, and
  `rbac.test.ts` asserts that the five system roles are listed.
- `client/src/context/PermissionProvider.tsx` reads `localStorage.getItem('token')` directly when deciding
  whether to fetch permissions. CON-204 forbids reading `localStorage` outside `client/src/utils/session.ts`;
  this is the one place in the workspace feature that does, and it is recorded here rather than changed, because
  these documents describe the code as it exists.

## Verification (retroactive)

Unit tests — `pnpm --filter server test <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-001 | `server/src/__tests__/permissionMiddleware.test.ts` | 401 anonymous, 400 without slug, 403 non-member, 403 missing permission, context attached on success |
| TEST-002 | `server/src/__tests__/rbacSecurity.test.ts` | `canGrantRole`, `findAssignableRole` rejections, `joinWorkspace` ignoring a client role, `changeMemberRole` rules |
| TEST-003 | `server/src/__tests__/workspaceSettings.test.ts` | Member ordering/projection, rename validation keeping the slug, invite-code regeneration |

Integration tests (real MongoDB) — `pnpm --filter server test:integration <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-004 | `server/src/__integration__/rbac.test.ts` | Task permissions per role, `/currentuser` reflection, catalogue, custom role CRUD, role changes and the privilege ceiling |
| TEST-005 | `server/src/__integration__/workspaces.test.ts` | Create/list/read/rename, member listing and removal, leaving, per-permission visibility of emails and the invite code |
| TEST-006 | `server/src/__integration__/workspaceJoin.test.ts` | Malformed/unknown codes, join as Viewer, invite-code rotation and its permission |
| TEST-007 | `server/src/__integration__/invitationsAdmin.test.ts` | Invitation creation, permission and role limits, member checks, replacement, list and cancel |
| TEST-008 | `server/src/__integration__/invitationsFlow.test.ts` | Public preview with a masked address, accept/decline rules, cancellation, expiry, deleted role |
| TEST-009 | `server/src/__integration__/twoFactor.test.ts` (`two-factor: workspace policy`) | `require2fa` default, the OWN_TWO_FACTOR_REQUIRED guard, `TWO_FACTOR_REQUIRED` blocking, account routes staying open |

Client tests — `pnpm --filter client test <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-010 | `client/src/features/workspace/__tests__/lib.test.ts` | `canManageWorkspace`, `buildInviteLink`, date and initials helpers |
| TEST-011 | `client/src/features/workspace/__tests__/WorkspaceSecurityCard.test.tsx` | The 2FA policy switch, its disabled states and the lockout warning |
| TEST-012 | `client/src/pages/__tests__/WorkspaceSettingsPage.test.tsx` | Settings page behaviour, including rename and invite-code display |
| TEST-013 | `client/src/components/__tests__/RolePermissionMatrix.test.tsx` | The role/permission matrix rendering used by the role editor |
| TEST-014 | `client/src/pages/__tests__/AuditLogPage.test.tsx` | The activity log view that surfaces the workspace/member/role audit entries |

Full gate: `pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402).
