> **Retroactive task list** — every task below is already implemented in the codebase (onboarded 2026-10-16). Not authored upfront; recorded for governance and traceability only.

# workspaces-rbac — Execution tasks (v1)

Legend: `P#` phase, `T#.#` task. Requirements use `FR-###`/`NFR-###`, acceptance criteria `AC-###`, tests
`TEST-###` (legend in `spec.md` → *Verification (retroactive)*).

## P1 — Workspace lifecycle and settings

- [x] **T1.1 Create a workspace as Product Owner** — `createWorkspace` writes the workspace with a unique slug and a 12-hex invite code, adds the creator as owner/member with the Product Owner role, and updates the user's workspace list and `activeWorkspace`. _FR-001 — AC-001, AC-002, AC-003_
- [x] **T1.2 List, read and switch workspaces** — `getMyWorkspaces` projects switcher data only; `getWorkspaceBySlug` checks membership and strips member emails without `users:read` and the invite code without `users:write`/`settings:manage` (`permissionsOf`); `switchWorkspace` sets `activeWorkspace` for members. _FR-002 — AC-004, AC-023_
- [x] **T1.3 Rename, rotate the invite code and toggle the 2FA policy** — `updateWorkspace` and `regenerateInviteCode` behind `settings:manage`, with the `OWN_TWO_FACTOR_REQUIRED` guard and `workspace.updated` / `workspace.invite_code_regenerated` activity entries. _FR-011 — AC-024, AC-025, AC-026, AC-028_

## P2 — Membership management

- [x] **T2.1 Join a workspace with an invite code** — `joinWorkspace` validates the 12-hex code, refuses a second join, assigns the Viewer role through `findDefaultRole` (never from the body) and registers the workspace on the user. _FR-003, NFR-002 — AC-005, AC-006, AC-007, AC-008_
- [x] **T2.2 List members by role seniority** — `getWorkspaceMembers` populates user and role, projects public fields, drops broken entries and sorts with `roleRank` then name. _FR-005 — AC-013_
- [x] **T2.3 Change a member's role within the privilege ceiling** — `changeMemberRole` refuses self-changes and owner changes, resolves the role with `findAssignableRole`, applies `canGrantRole` to both the held and the requested role, then records `member.role_changed`. _FR-006, NFR-002, NFR-003 — AC-014, AC-015_
- [x] **T2.4 Remove a member** — `removeMember` refuses the owner and the caller, applies the ceiling to the member's current role, unassigns their tasks, pulls the workspace from their list and clears a stale `activeWorkspace`. _FR-007 — AC-016_
- [x] **T2.5 Leave a workspace** — `leaveWorkspace` lets any member except the owner leave with the same cleanup and writes `member.left`. _FR-007 — AC-017_

## P3 — Authorization pipeline and system roles

- [x] **T3.1 Define the permission catalogue and the system roles** — `server/src/config/permissions.ts` declares the area:action keys with labels and groups, the five `SYSTEM_ROLES`, `deriveActions` and `hasPermission`. _FR-004, FR-010, FR-012 — AC-022, AC-029, AC-030_
- [x] **T3.2 Enforce permissions in one middleware** — `requirePermission` resolves the slug, loads the workspace by membership, resolves the role, applies the workspace 2FA policy, narrows API-token permissions to their scopes and attaches `req.workspace`, `req.role`, `req.permissions`; every workspace route declares it after `protect`. _FR-004, NFR-001 — AC-027, AC-029_
- [x] **T3.3 Seed system roles and repair orphaned memberships** — `seedSystemRoles` upserts each role with `workspaceId: null`; `repairMemberRoles` fills a missing `roleId` (legacy strings mapped, owner → Product Owner, otherwise Viewer); both run through `ensureReady` in `server/src/app.ts`. _FR-012, NFR-002 — AC-030_

## P4 — Invitations

- [x] **T4.1 Create an invitation with a role the inviter may grant** — `createInvitation` normalises the email, resolves the role with `findAssignableRole`, applies `canGrantRole`, expires an earlier pending invitation, stores only the token hash with a 3-day expiry and emails the accept link. _FR-008, NFR-002, NFR-003 — AC-009, AC-010, AC-011, AC-012_
- [x] **T4.2 List and cancel pending invitations** — `listInvitations` returns pending, unexpired rows without the token; `cancelInvitation` flips a pending row to expired and `404`s malformed or foreign ids. _FR-008 — AC-009_
- [x] **T4.3 Preview, accept and decline by token** — `getInvitationByToken` is public and masks the address; `acceptInvitation` claims the row atomically, matches the signed-in address, re-resolves the role and adds the member once; `declineInvitation` marks the row declined. _FR-008 — AC-011, AC-012_

## P5 — Custom roles and permission catalogue endpoint

- [x] **T5.1 List workspace roles and the permission catalogue** — `listWorkspaceRoles` returns system roles plus the workspace's own custom roles (system first); `listPermissions` groups the catalogue under `GET /api/roles/permissions`. _FR-009, FR-010 — AC-018, AC-022_
- [x] **T5.2 Create and update a custom role** — `createCustomRole`/`updateCustomRole` validate name and description, check `getInvalidPermissions`, apply `withinOwnPermissions`, and refuse a duplicate name (`hasRoleNameConflict`). _FR-009 — AC-019, AC-020_
- [x] **T5.3 Delete a custom role that nobody holds** — `deleteCustomRole` resolves the role with `findCustomRoleOr404`, refuses when a member still holds it (`409`) and records `role.deleted`. _FR-009, NFR-003 — AC-021_

## P6 — Client permission surface

- [x] **T6.1 Load permissions for the workspace in view** — `PermissionProvider` derives the slug from the route, requests `/auth/currentuser?workspaceSlug=…`, resets when logged out and exposes `user`, `workspace`, `role`, `permissions`, `actions`, `can()` and `hasRole()` through `usePermissions`. _FR-013 — AC-031_
- [x] **T6.2 Gate the member and invitation screens** — `TeamMembersPage` and `InviteMemberModal` show the role control, remove action and invite form only with the matching permission; `lib.canManageWorkspace` drives the settings affordances. _FR-013 — AC-031_
- [x] **T6.3 Show the invite link, rename and the 2FA policy** — `WorkspaceSettingsPage` and `WorkspaceSecurityCard` expose rename, invite-code rotation and the `require2fa` switch, disabling the switch and explaining the lockout when the viewer lacks two-factor or `settings:manage`. _FR-011, FR-013 — AC-024, AC-026, AC-031_

## P7 — Hardening and quality gates

- [x] **T7.1 Unit test the middleware and the role rules** — `permissionMiddleware.test.ts` and `rbacSecurity.test.ts` mock the models and assert every 401/400/403 branch, the attached context and the privilege ceiling with the real catalogue. _NFR-004 — AC-029, AC-015_
- [x] **T7.2 Integration test the workspace and role flows** — `rbac.test.ts`, `workspaces.test.ts`, `workspaceJoin.test.ts`, `invitationsAdmin.test.ts`, `invitationsFlow.test.ts` and the workspace-policy block of `twoFactor.test.ts` run over HTTP against a real MongoDB. _NFR-004 — AC-013, AC-021, AC-027_
- [x] **T7.3 Keep every workspace query scoped** — controllers read the workspace from `req.workspace` and filter by `req.workspace._id` (CON-106); membership-aware lookups use `'members.user'` so a non-member cannot observe a workspace. _NFR-001 — AC-029, AC-023_
- [x] **T7.4 Validate identifiers before querying** — `findAssignableRole` rejects non-strings and malformed ObjectIds without a query; `findCustomRoleOr404` answers `404`, so odd ids never produce a CastError `500` (CON-516). _NFR-003 — AC-020, AC-021_
- [x] **T7.5 Run the repository quality gates** — `pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client build`, plus the browser check on the workspace settings and team pages (CON-402, CON-703). _NFR-004 — AC-031, AC-013_
