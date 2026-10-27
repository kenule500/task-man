> **Retroactive task list** — every task below is already implemented in the codebase (onboarded 2026-10-16). Not authored upfront; recorded for governance and traceability only.

# auth-sessions — Execution tasks (v1)

Legend: `P#` phase, `T#.#` task. Requirements use `FR-###`/`NFR-###`, acceptance criteria `AC-###`, tests
`TEST-###` (legend in `spec.md` → *Verification (retroactive)*).

## P1 — Account creation and email verification

- [x] **T1.1 Create an account from name, email and password** — `registerUser` + `validateSignup` in `server/src/controllers/authController.ts`, wired in `server/src/routes/authRoutes.ts`; unique lower-case email, 8-character minimum, `201` summary without secrets. _FR-001, NFR-003 — AC-001…AC-004_
- [x] **T1.2 Hash and email the verification link** — `createSecureToken`/`hashToken` (`server/src/utils/tokens.ts`), 24-hour expiry on the user, `verifyEmailTemplate` + `sendEmail` (Resend → SMTP → console). _FR-002, NFR-002 — AC-005, AC-007_
- [x] **T1.3 Verify an address once and refuse a replayed link** — `verifyEmail` matches the token hash against an unexpired row, sets `isVerified` and clears the token fields. _FR-002 — AC-005, AC-006_
- [x] **T1.4 Resend verification without revealing account state** — `resendVerification` answers the same generic message for unknown, verified and unverified addresses. _FR-002 — AC-006, AC-007_

## P2 — Sign-in, session lifetime and sign-out

- [x] **T2.1 Issue a JWT and a revocable session row** — `generateToken` (random `jti`, 7-day expiry) and `createSession` storing the SHA-256 token hash, user agent and IP; `issueSession` builds the sign-in response; indexes in `server/src/models/sessionModel.ts`. _FR-003, NFR-002 — AC-008, AC-011_
- [x] **T2.2 Make login failures uniform and reject operator payloads** — `validateLogin`, `{ email: { $eq: String(email) } }` lookups, one `401` for every credential failure, `403 { requiresVerification: true }` for an unverified address. _FR-004, NFR-003 — AC-006, AC-009, AC-010_
- [x] **T2.3 Re-check the session on every authenticated request** — `protect` in `server/src/middleware/authMiddleware.ts`: bearer parsing, JWT verification, `isValid` session lookup by token hash, throttled `lastLoggedIn` write, user attached without the password. _FR-005 — AC-012_
- [x] **T2.4 Invalidate exactly the session that logs out** — `logoutUser` marks the matching session invalid and always answers `200`. _FR-006 — AC-013_

## P3 — Password recovery and credential changes

- [x] **T3.1 Request a reset link without an enumeration oracle** — `forgotPassword` stores a hashed token with a 1-hour expiry and answers the same message either way; only the newest link stays valid. _FR-007 — AC-014, AC-015_
- [x] **T3.2 Reset the password and end every session** — `resetPassword` consumes the token once, saves the new password, clears `ssoOnly` and invalidates every session of the account. _FR-008 — AC-016, AC-021_
- [x] **T3.3 Change the password from settings** — `changePassword` in `server/src/controllers/profileController.ts` requires the current password, keeps the calling session and revokes the others. _FR-008 — AC-021, AC-022_

## P4 — Signed-in devices and identity resolution

- [x] **T4.1 List the account's active sessions** — `listSessions` filters with `activeSessionFilter`, sorts the current session first and returns no token material. _FR-009 — AC-017, AC-020_
- [x] **T4.2 Revoke one session or all other sessions** — `revokeSession` scopes the update to the caller's own user id (`404` otherwise); `revokeOtherSessions` keeps the calling session and reports `revoked`. _FR-009 — AC-018, AC-019, AC-020_
- [x] **T4.3 Resolve identity, role, permissions and actions** — `getCurrentUser` returns workspace, role, permission keys and `deriveActions(...)`, and self-heals a membership without `roleId` (owner → Product Owner, otherwise Viewer). _FR-011 — AC-026_
- [x] **T4.4 Store the session in one place and react to a 401** — `client/src/utils/session.ts` owns the token/user keys and wipes the query and service-worker caches; `client/src/utils/api.ts` clears the session and redirects to `/login?expired=1`; `useAuthGuard` protects pages. _FR-012 — AC-027_

## P5 — Onboarding and first workspace

- [x] **T5.1 Save onboarding answers and create the first workspace** — `saveOnboarding` validates the answers, generates a unique slug and a 12-hex invite code, assigns the Product Owner system role and sets the workspace active; a second call returns the existing workspace. _FR-010 — AC-023, AC-024, AC-025_

## P6 — Hardening and quality gates

- [x] **T6.1 Apply the auth and sensitive rate limits** — `authLimiter` on `/api/auth` plus `sensitiveLimiter` on login, forgot-password, resend-verification, the profile password change and the two-factor routes, with JSON error bodies (`server/src/app.ts`). _NFR-001 — AC-009, AC-014_
- [x] **T6.2 Keep credentials and tokens unrecoverable** — bcrypt pre-save hook and `matchPassword` in `userModel`, SHA-256 digests for every token, and the `toJSON` transform that deletes password and token fields. _NFR-002 — AC-001, AC-011_
- [x] **T6.3 Validate every auth payload** — validation chains on all mutating auth routes and `String()` casts before queries, so malformed payloads answer `400` instead of `500`. _NFR-003 — AC-002, AC-004, AC-010, AC-025_
- [x] **T6.4 Cover the flows with unit and integration tests** — `server/src/__tests__/security.test.ts`, `server/src/__tests__/sendEmail.test.ts`, `server/src/__integration__/{auth,sessions,passwordReset,resendVerification,profile}.test.ts`, and the client `AuthPage`, `SecurityPage` and `session` tests. _NFR-004 — AC-005, AC-012, AC-015, AC-017, AC-018, AC-022_
- [x] **T6.5 Run the repository quality gates** — `pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402). _NFR-004 — AC-008, AC-017_
