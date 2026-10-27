> **Retroactive plan** — describes the architecture that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# workspaces-rbac — Technical plan (v1)

## Approach

One authorization pipeline, declared in the router and never re-implemented in a controller (CON-105, CON-512):
`server/src/routes/workspaceRoutes.ts` declares `protect` → `requirePermission('<area>:<action>')` per route;
the middleware resolves the workspace from the URL slug **plus membership**, checks the role's permission and
attaches `req.workspace`, `req.role` and `req.permissions`; controllers read the workspace from that request
object, so every query is scoped to `req.workspace._id` (CON-106). Permissions are a closed catalogue
(`server/src/config/permissions.ts`); roles are either the five seeded system roles (`isSystem: true`,
`workspaceId: null`) or custom roles owned by exactly one workspace. All role resolution, defaulting and granting
goes through `server/src/utils/roleAccess.ts`, so the privilege ceiling lives in one testable module, and the
pure helpers (`roleHelpers`, `workspaceHelpers`, `roleRank`) stay free of HTTP and the database (CON-109).

Every component below already exists, so the actions are `reuse`.

## Components

| Component | Action | Responsibility |
|---|---|---|
| `server/src/config/permissions.ts` | reuse | `PERMISSIONS` catalogue (area:action, label, group), the five `SYSTEM_ROLES`, `deriveActions`, `hasPermission` |
| `server/src/middleware/permissionMiddleware.ts` | reuse | `requirePermission` factory: slug resolution, membership lookup, role load, 2FA policy gate, API-token workspace/scope check, request context |
| `server/src/utils/roleAccess.ts` | reuse | `findAssignableRole`, `canGrantRole`, `findDefaultRole`, `roleRank`, `OWNER_ROLE_NAME`, `DEFAULT_ROLE_NAME` |
| `server/src/utils/seedRoles.ts` | reuse | `seedSystemRoles` upsert and `repairMemberRoles` for memberships without a role |
| `server/src/utils/roleHelpers.ts` | reuse | `getInvalidPermissions`, `findCustomRoleOr404`, `hasRoleNameConflict` |
| `server/src/utils/workspaceHelpers.ts` | reuse | `findMember`, `isWorkspaceOwner` |
| `server/src/utils/activity.ts` | reuse | `recordActivity`/`auditLookup` for member, role, invitation and workspace changes |
| `server/src/routes/workspaceRoutes.ts` | reuse | The route table: create/list/join without workspace context, then every `:slug` route with its permission |
| `server/src/controllers/workspaceController.ts` | reuse | `createWorkspace`, `getMyWorkspaces`, `getWorkspaceBySlug`, `switchWorkspace`, `joinWorkspace`, `getWorkspaceMembers`, `updateWorkspace`, `regenerateInviteCode`, `validateUpdateWorkspace`, `permissionsOf` |
| `server/src/controllers/memberController.ts` | reuse | `changeMemberRole`, `removeMember`, `leaveWorkspace` |
| `server/src/controllers/roleController.ts` | reuse | `listWorkspaceRoles`, `listPermissions`, `createCustomRole`, `updateCustomRole`, `deleteCustomRole`, `withinOwnPermissions` |
| `server/src/controllers/invitationController.ts` | reuse | `createInvitation` + `validateCreateInvitation`, `listInvitations`, `cancelInvitation`, `getInvitationByToken`, `acceptInvitation`, `declineInvitation` |
| `server/src/models/workspaceModel.ts` | reuse | `name`/`slug`/`owner`/`members`/`inviteCode`, `security.require2fa`, index on `members.user` |
| `server/src/models/roleModel.ts` | reuse | `name`/`description`/`permissions`/`isSystem`/`workspaceId` with the two partial unique indexes |
| `server/src/models/invitationModel.ts` | reuse | Hashed token, status enum, `expiresAt`, pending-per-address partial unique index |
| `server/src/routes/invitationRoutes.ts` | reuse | Public `GET /:token` preview; authenticated accept/decline, mounted at `/api/invitations` |
| `server/src/routes/roleRoutes.ts` | reuse | `GET /api/roles/permissions` behind `protect` |
| `server/src/app.ts` | reuse | Mounts the routers and runs `seedSystemRoles`/`repairMemberRoles` through `ensureReady` before the first request |
| `client/src/context/PermissionProvider.tsx` | reuse | Slug detection, `/auth/currentuser?workspaceSlug=…`, `can()`, `hasRole()`, `refresh()` |
| `client/src/hooks/usePermissions.ts` | reuse | Consumer hook (throws outside the provider) |
| `client/src/features/workspace/api.ts` | reuse | `workspaceApi.get/members/update/regenerateInvite` |
| `client/src/features/workspace/useWorkspaceData.ts` | reuse | Loads the workspace and its members together |
| `client/src/features/workspace/lib.ts` | reuse | `canManageWorkspace`, `buildInviteLink`, `formatJoinedDate`, `getInitials` |
| `client/src/features/workspace/components/WorkspaceSecurityCard.tsx` | reuse | The `require2fa` switch with its disabled states and lockout warning |
| `client/src/pages/TeamMembersPage.tsx` | reuse | Member list, role control, invite modal, remove action |
| `client/src/components/InviteMemberModal.tsx` | reuse | Invite by email with a role limited to what the caller may grant |
| `client/src/pages/WorkspaceSettingsPage.tsx` | reuse | Rename, invite-code rotation and the security section |

Referenced requirements: FR-001…FR-013, NFR-001…NFR-004.

## Data model

**`Workspace`** — `action: no_change`. `name` (trimmed, ≤ 60), `slug` (unique, lowercase, `/^[a-z0-9-]+$/`),
`owner` (ref User), `members` (array of `{ user, roleId, joinedAt }`), `inviteCode` (unique, 12 uppercase hex),
`security.require2fa` (boolean, default `false`), `taskCounter`, `createdAt`/`updatedAt`. Index on
`{ 'members.user': 1 }`.

**`Role`** — `action: no_change`. `name` (≤ 60), `description` (≤ 280), `permissions` (string[] of catalogue
keys), `isSystem`, `workspaceId` (nullable). Partial unique index on `{ name }` where `isSystem` is true, and on
`{ workspaceId, name }` where `isSystem` is false.

**`Invitation`** — `action: no_change`. `workspaceId`, `invitedBy`, `email`, `roleId`, `token` (unique SHA-256
hash), `status` (`pending | accepted | declined | expired`), `expiresAt`. Partial unique index on
`{ workspaceId, email, status }` where `status` is `pending`.

**Flow.** A signed-in user creates a workspace: the document is written with the creator as owner and as the
first member holding the Product Owner role id, plus a unique slug and a 12-hex invite code, and the user's
`workspaces`/`activeWorkspace` are updated. Every later request to `/api/workspaces/:slug/...` resolves
membership inside `requirePermission`, so controllers only ever act inside that workspace. Membership changes
(join by code, invite/accept, role change, removal, leave) all funnel through `roleAccess`:
`findAssignableRole` restricts the target to a system role or a role of the same workspace, `canGrantRole`
compares permission sets unless the actor owns the workspace, and `findDefaultRole` supplies Viewer for
invite-code joins.

## API contracts

| Method | Path | Auth | Permission | Requirements |
|---|---|---|---|---|
| POST | `/api/workspaces` | yes | — (authenticated) | FR-001 |
| GET | `/api/workspaces` | yes | — (authenticated) | FR-002 |
| POST | `/api/workspaces/join` | yes | — (authenticated) | FR-003 |
| GET | `/api/workspaces/:slug` | yes | membership (field filtering by permission) | FR-002 |
| PUT | `/api/workspaces/:slug/activate` | yes | membership | FR-002 |
| PUT | `/api/workspaces/:slug` | yes | `settings:manage` | FR-011 |
| POST | `/api/workspaces/:slug/invite-code` | yes | `settings:manage` | FR-011 |
| GET | `/api/workspaces/:slug/members` | yes | `users:read` | FR-005 |
| PUT | `/api/workspaces/:slug/members/:userId/role` | yes | `users:write` | FR-006 |
| DELETE | `/api/workspaces/:slug/members/:userId` | yes | `users:write` | FR-007 |
| DELETE | `/api/workspaces/:slug/members/me` | yes | membership | FR-007 |
| POST | `/api/workspaces/:slug/invitations` | yes | `users:write` | FR-008 |
| GET | `/api/workspaces/:slug/invitations` | yes | `users:read` | FR-008 |
| DELETE | `/api/workspaces/:slug/invitations/:id` | yes | `users:write` | FR-008 |
| GET | `/api/invitations/:token` | no | token is the credential | FR-008 |
| POST | `/api/invitations/:token/accept` | yes | token + matching address | FR-008 |
| POST | `/api/invitations/:token/decline` | yes | token + matching address | FR-008 |
| GET | `/api/workspaces/:slug/roles` | yes | `users:read` | FR-009 |
| POST | `/api/workspaces/:slug/roles` | yes | `settings:manage` | FR-009 |
| PUT | `/api/workspaces/:slug/roles/:id` | yes | `settings:manage` | FR-009 |
| DELETE | `/api/workspaces/:slug/roles/:id` | yes | `settings:manage` | FR-009 |
| GET | `/api/roles/permissions` | yes | — (any logged-in user) | FR-010 |
| GET | `/api/workspaces/:slug/activity` | yes | `settings:manage` | FR-011 |

Mounts: `app.use('/api/workspaces', workspaceRoutes)`, `app.use('/api/invitations', invitationRoutes)`,
`app.use('/api/roles', roleRoutes)` in `server/src/app.ts`.

## Security considerations

- **NFR-001 — server-side scoping (CON-106).** `requirePermission` looks the workspace up with slug equality
  **and** `'members.user': callerId`, so a non-member cannot even observe that a workspace exists. On success the
  controller uses `req.workspace` and every query filters by `req.workspace._id`.
- **NFR-002 — one place that grants roles (CON-107).** `findAssignableRole` matches
  `{ _id, $or: [{ isSystem: true }, { workspaceId }] }`, so a role id from another workspace can never be
  granted; `canGrantRole` always refuses Product Owner to a non-owner and otherwise requires the actor to hold
  every permission of the target role. Role documents come from `seedRoles.ts` only.
- **NFR-003 — identifier hygiene (CON-516).** Non-string and malformed ids are rejected before any query runs
  (`findAssignableRole` returns `null`, `findCustomRoleOr404` answers `404`), so payloads such as
  `{ "$ne": null }` cannot widen a lookup.
- **NFR-004 — verified behaviour (CON-402).** `permissionMiddleware.test.ts` asserts the 401/400/403 branches and
  the attached context, `rbacSecurity.test.ts` exercises the privilege ceiling against the real catalogue, and
  the integration suites drive the same rules over HTTP.

## Performance considerations

- **NFR-001.** Each authorized request costs one indexed workspace lookup (unique slug plus the index on
  `members.user`) and one `Role.findById`; the resolved document is reused by the controller rather than
  re-queried.
- **NFR-004.** `getMyWorkspaces` projects `name`, `slug`, `owner`, `members`, `createdAt` and populates only
  member names and role names, so the switcher never ships invite codes, emails or full user documents.
- **NFR-002.** System roles are single shared documents (`workspaceId: null`), so role resolution stays one
  indexed lookup instead of a per-workspace copy.

## Dependencies

| Name | Type | Action | Notes |
|---|---|---|---|
| `mongoose` | library | no_change | Workspace, Role and Invitation models with partial unique indexes |
| `express-validator` | library | no_change | `validateUpdateWorkspace`, `validateCreateInvitation` and other setting chains |
| `express-rate-limit` | library | no_change | The sensitive limiter covers `/api/workspaces/join` and `/api/invitations` |
| MongoDB | service | no_change | Workspaces, memberships, roles, invitations, activity log |
| `server/src/config/permissions.ts` | internal | no_change | Closed catalogue and system role definitions |
| `server/src/utils/roleAccess.ts` | internal | no_change | The only place roles are resolved, defaulted and granted |
| `server/src/utils/seedRoles.ts` | internal | no_change | Boot-time seeding and membership repair |

## Risks

| Risk | Mitigation |
|---|---|
| A future workspace route is added without `requirePermission` | The permission is declared next to the path, and the middleware and integration suites fail when the pipeline changes |
| Legacy members without a `roleId` break access | `repairMemberRoles` on boot, `getCurrentUser` self-healing, and an explicit `403` instead of a crash |
| A custom role is deleted while still assigned | `deleteCustomRole` checks `Workspace.exists({ 'members.roleId': role._id })` and answers `409` |
| An invite code leaks to the wrong audience | Codes grant read-only Viewer only, can be rotated by `settings:manage`, and the join route is rate limited |
