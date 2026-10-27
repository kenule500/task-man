> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# auth-sessions — Account authentication and revocable sessions (v1)

| | |
|---|---|
| Feature | `auth-sessions` |
| Version | 1 |
| Status | Implemented and shipped |
| Governance | `.sdrive/governance/auth-sessions/v1/{spec,plan,tasks,traceability}.json` |
| Constitution | CON-103, CON-105, CON-109, CON-204, CON-207, CON-402, CON-403, CON-404, CON-505, CON-511, CON-514, CON-515, CON-516, CON-519 |

## Overview

**Problem.** TaskMan has to prove who a person is before any workspace data is returned, and it has to let an
account owner end access from a device that is lost or no longer trusted. Email + password accounts are the
default path, so registration, address proof and recovery all need to be safe against replay and against
revealing which addresses exist.

**Solution.** The password is a bcrypt hash (`server/src/models/userModel.ts`, pre-save hook, salt rounds 10).
Registration, resend and recovery use single-use tokens whose SHA-256 digest is the only stored value
(`server/src/utils/tokens.ts`). A successful sign-in mints a 7-day JWT with a random `jti`
(`authController.generateToken`) **and** a `Session` row keyed by the token hash
(`authController.createSession`). `protect` re-checks that row on every request, which is what makes logout,
password reset and the "signed-in devices" screen effective before the token expires.

**Audience.** New signups who must prove their address, returning members on several devices, and workspace
owners who need a reliable way to cut a session off.

**Assumptions recorded.**
- Email goes out through Resend (`RESEND_API_KEY`), else SMTP (`EMAIL_HOST`), else — outside production — a
  console fallback; a production process without a provider throws instead of dropping mail.
- The session lifetime is bounded by the 7-day JWT expiry; MongoDB deletes the row ~1 day later through the
  TTL index (`expireAfterSeconds: 8 * 24 * 60 * 60`) in `server/src/models/sessionModel.ts`.
- `DEV_AUTO_VERIFY=true` is a local convenience read straight from `process.env` in
  `authController.isDevAutoVerify`; it skips the email and marks accounts verified on creation.

**Out of scope.** SSO/2FA/API tokens (`sso-2fa`), role enforcement (`workspaces-rbac`), profile fields and
notification preferences in `profileController.ts`, and anything beyond the 8-character password minimum.

## User stories and acceptance criteria

### US-001 — Create an account with my email address
*As* a person signing up for the first time, *I want* to register with my name, email and a password and
receive a verification email, *so that* my address is proven before the account can be used.

- **AC-001** — `POST /api/auth/signup` creates an unverified account and answers `201` with id, name, email and
  `requiresVerification`, never with the password or a token (`authController.registerUser`).
- **AC-002** — Fewer than 8 characters is a `400`; exactly 8 is accepted (`MIN_PASSWORD_LENGTH`, `validateSignup`).
- **AC-003** — An address that already has an account answers `400 "User already exists"`.
- **AC-004** — Invalid email, missing name, a name over 80 characters or a non-string value answer `400`, not `500`.

### US-002 — Prove my email address before signing in
*As* a new account owner, *I want* to open the emailed link and have the account marked verified, *so that* the
address on the account is one I control.

- **AC-005** — `GET /api/auth/verify-email/:token` sets `isVerified`, clears the token fields, and the same link
  cannot be used twice (`authController.verifyEmail`).
- **AC-006** — Signing in before verification answers `403 { requiresVerification: true }` and issues no session.
- **AC-007** — `POST /api/auth/resend-verification` answers identically for unknown, already-verified and
  unverified addresses (`authController.resendVerification`).

### US-003 — Sign in and stay signed in for a working week
*As* a registered user, *I want* to exchange my credentials for a token the server can revoke, *so that* a lost
device is recoverable.

- **AC-008** — A successful login returns `token` plus `_id`, `name`, `email`, `onboardingComplete`,
  `activeWorkspace`, `activeWorkspaceSlug`, `workspaces` (`authController.issueSession`).
- **AC-009** — A wrong password and an unknown address both answer `401 "Invalid email or password"`.
- **AC-010** — A payload such as `{ "email": { "$gt": "" } }` is rejected by `validateLogin` before any query runs.
- **AC-011** — The JWT carries a random `jti` and `expiresIn: '7d'`; the `Session` row stores only
  `hashToken(token)` (`sha256`).
- **AC-012** — A token with no valid session answers `401 "Session expired or invalidated. Please log in again."`.
- **AC-013** — `POST /api/auth/logout` invalidates only that session, so two logins in the same second are
  independent.
- **AC-026** — `GET /api/auth/currentuser` returns identity plus workspace, role, permissions and
  `deriveActions(...)` output for the requested `workspaceSlug`, and `403` when the caller is not a member.

### US-004 — Reset a password I have forgotten
*As* an account owner who cannot sign in, *I want* a link by email and a new password, *so that* I regain access
without an administrator.

- **AC-014** — `POST /api/auth/forgot-password` answers the same generic `200` whether or not the address exists.
- **AC-015** — An expired reset token is rejected, and only the most recent link is honoured.
- **AC-016** — A completed reset invalidates every session of the account and clears `ssoOnly`.

### US-005 — See the sessions on my account and change my password
*As* an account owner on several devices, *I want* to list where I am signed in, end sessions, and change my
password, *so that* a device I no longer control cannot reach my workspace.

- **AC-017** — `GET /api/profile/sessions` lists active sessions, current first, with user agent, IP and
  timestamps, and never with token material (`profileController.listSessions`).
- **AC-018** — `DELETE /api/profile/sessions/:id` signs out one device, which then cannot call the API;
  an unknown or foreign id answers `404`.
- **AC-019** — `POST /api/profile/sessions/revoke-others` keeps the calling session and reports `revoked`.
- **AC-020** — One account can never see or revoke another account's sessions.
- **AC-021** — `PUT /api/profile/password` answers `401` for a wrong current password and changes nothing.
- **AC-022** — A successful change keeps the calling session and revokes every other session.

### US-006 — Finish onboarding and get a first workspace
*As* a newly registered user, *I want* my answers saved and a workspace created with me as Product Owner,
*so that* I can start planning immediately.

- **AC-023** — `POST /api/auth/onboarding` stores the answers with `completedAt`, generates a unique slug and a
  12-hex invite code, assigns the `Product Owner` system role and sets the workspace active
  (`authController.saveOnboarding`).
- **AC-024** — A second call is idempotent and returns the existing workspace.
- **AC-025** — A non-string or over-60-character `workspaceName`, or an answer over 80 characters, answers `400`.

## Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | Signup creates an account from name/email/password, normalises the email, refuses duplicates and returns a secret-free summary. | AC-001…AC-004 |
| FR-002 | Verification stores only the hash of a 32-byte token with a 24-hour expiry, emails a link built from `CLIENT_URL`, and resend answers a uniform message. | AC-005…AC-007 |
| FR-003 | A verified login mints a JWT (`jti`, 7 days) and a `Session` document holding the token hash, user agent and IP. | AC-008, AC-011 |
| FR-004 | Login failures are uniform; lookups are written as `{ email: { $eq: String(email) } }` so an object payload cannot become a query operator. | AC-009, AC-010 |
| FR-005 | `protect` verifies the JWT, requires an `isValid` session matching the token hash, refreshes `lastLoggedIn` at most every 5 minutes and attaches the user without the password. | AC-012 |
| FR-006 | `POST /api/auth/logout` marks exactly the calling session invalid and answers `200`. | AC-013 |
| FR-007 | Reset uses a hashed token with a 1-hour expiry, one generic response, and is consumed once. | AC-014, AC-015 |
| FR-008 | A reset invalidates every session and clears `ssoOnly`; a password change keeps the calling session and revokes the others. | AC-016, AC-021, AC-022 |
| FR-009 | The devices API lists, revokes one, or revokes all other sessions of the caller only. | AC-017…AC-020 |
| FR-010 | Onboarding is idempotent, creates the first workspace with the creator as Product Owner and generates the invite code. | AC-023…AC-025 |
| FR-011 | `currentuser` resolves workspace, role, permissions and actions, and self-heals a membership without `roleId`. | AC-026 |
| FR-012 | The web app stores the session only through `client/src/utils/session.ts`; the axios client clears it and redirects to `/login?expired=1` on a non-auth `401`. | AC-027 |

## Non-functional requirements

| ID | Requirement | Constitution |
|---|---|---|
| NFR-001 | `/api/auth` is capped at 100 requests / 15 min per IP; login, forgot-password, resend-verification, `PUT /api/profile/password` and the 2FA routes additionally share the 20 / 15 min `sensitiveLimiter` (`server/src/app.ts`). | CON-511, CON-514 |
| NFR-002 | Passwords are bcrypt hashes and every token exists in the database only as a SHA-256 digest; `toJSON` deletes password and token fields. | CON-505, CON-511 |
| NFR-003 | Every mutating auth route declares an `express-validator` chain and controllers cast with `String()` before querying. | CON-515, CON-516 |
| NFR-004 | Unit tests for the pure helpers and integration tests for the flows; `pnpm --filter server test` / `test:integration` must pass. | CON-402, CON-403, CON-404 |

## Edge cases

| ID | Situation | Expected behaviour |
|---|---|---|
| EC-001 | A verification link is expired or opened twice | `400` explaining the link was used or expired, pointing at login and a fresh link |
| EC-002 | A reset link is requested twice and the older one is used | Only the newest link works (the stored hash is overwritten) |
| EC-003 | Two logins in the same second, one logs out | `jti` + token hash keep them distinct, so one logout kills one session |
| EC-004 | Email provider down or unconfigured | Account still created; the link is printed only when `NODE_ENV !== 'production'`; production without a provider throws |
| EC-005 | A session older than the JWT lifetime | Excluded by `activeSessionFilter`, and removed by the TTL index about a day later |
| EC-006 | A revoked session replays its token | `protect` finds no valid session and answers `401` |
| EC-007 | A number, object or null password on signup/reset | Validator answers `400`; bcrypt is never called with a non-string |
| EC-008 | A reset happens while another device is signed in | That device's session is invalidated and its next request answers `401` |

## Verification (retroactive)

Unit tests (no database, no network) — `pnpm --filter server test <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-001 | `server/src/__tests__/security.test.ts` | `readConfig` environment rules, `createSecureToken`/`hashToken`/`getBearerToken`, login and signup validation |
| TEST-002 | `server/src/__tests__/sendEmail.test.ts` | Resend path, SMTP fallback, the development console fallback, production without a provider |
| TEST-009 | `client/src/components/auth/__tests__/validation.test.ts` | Client-side email, name and password rules |
| TEST-010 | `client/src/utils/__tests__/session.test.ts` | `saveSession`/`clearSession` plus the query-cache and service-worker cache wipe |

Integration tests (real MongoDB) — `pnpm --filter server test:integration <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-003 | `server/src/__integration__/auth.test.ts` | Signup validation, verification single-use, login/logout, `currentuser`, onboarding idempotency |
| TEST-004 | `server/src/__integration__/sessions.test.ts` | Signed-in devices: list, revoke one, revoke others, cross-account isolation |
| TEST-005 | `server/src/__integration__/passwordReset.test.ts` | Generic forgot answer, full reset flow, session revocation, expiry, single active link |
| TEST-006 | `server/src/__integration__/resendVerification.test.ts` | Identical answers for unknown/verified/unverified accounts |
| TEST-007 | `server/src/__integration__/profile.test.ts` | Password change validation and "keep current session, revoke the others" |

Client tests — `pnpm --filter client test <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-008 | `client/src/pages/__tests__/AuthPage.test.tsx` | Sign-in/sign-up form behaviour and error states |
| TEST-011 | `client/src/pages/__tests__/SecurityPage.test.tsx` | Password change and the signed-in devices screen |

Full gate: `pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402).
