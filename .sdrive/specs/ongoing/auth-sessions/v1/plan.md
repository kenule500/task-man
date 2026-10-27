> **Retroactive plan** — describes the architecture that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# auth-sessions — Technical plan (v1)

## Approach

Transport, authorization, orchestration and persistence stay separated (CON-103, CON-105).
`server/src/routes/authRoutes.ts` declares the path, the `express-validator` chain and the middleware order;
`server/src/controllers/authController.ts` orchestrates; `server/src/models/*.ts` persist. The JWT proves the
sign-in, but the **database session is the authority**: `protect`
(`server/src/middleware/authMiddleware.ts`) attaches a user only when a `Session` row matching
`hashToken(bearerToken)` still has `isValid: true`. That is what makes logout, a password reset and the
"signed-in devices" screen take effect before the token expires. Pure token helpers live in
`server/src/utils/tokens.ts` so they can be unit tested without Express or MongoDB (CON-109).

Nothing here is new work: every component below already exists in the repository, so the actions are `reuse`.

## Components

| Component | Action | Responsibility |
|---|---|---|
| `server/src/routes/authRoutes.ts` | reuse | `POST /signup`, `/login`, `/logout`, `/resend-verification`, `/forgot-password`, `/reset-password/:token`, `/onboarding`; `GET /verify-email/:token`, `/currentuser`; validation chains and `protect` |
| `server/src/controllers/authController.ts` | reuse | `registerUser`, `verifyEmail`, `resendVerification`, `loginUser`, `getCurrentUser`, `forgotPassword`, `resetPassword`, `saveOnboarding`, `logoutUser`, `issueSession`, the exported validation chains |
| `server/src/utils/tokens.ts` | reuse | `createSecureToken`, `hashToken` (SHA-256), `getBearerToken` |
| `server/src/utils/sendEmail.ts` | reuse | Resend → SMTP → development console; throws in production without a provider; logs one JSON line so user text cannot forge log entries |
| `server/src/utils/emailTemplates.ts` | reuse | `verifyEmailTemplate`, `resetPasswordTemplate`; escapers for user-controlled text in HTML |
| `server/src/middleware/authMiddleware.ts` | reuse | `protect` (JWT + session row + throttled `lastLoggedIn` write), `rejectApiToken` |
| `server/src/models/sessionModel.ts` | reuse | Unique index on the token hash, composite `{ user, isValid, createdAt }`, TTL index at 8 days, `SESSION_LIFETIME_MS` |
| `server/src/models/userModel.ts` | reuse | Credential fields, the bcrypt pre-save hook, `matchPassword`, the `toJSON` transform that strips password/token fields |
| `server/src/controllers/profileController.ts` | reuse | `changePassword`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `activeSessionFilter` |
| `server/src/routes/profileRoutes.ts` | reuse | `PUT /password` and the session routes behind `protect` |
| `server/src/config/env.ts` | reuse | `readConfig` validation of `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `CORS_ORIGIN`, `RATE_LIMIT_MAX`, `TRUST_PROXY` |
| `server/src/app.ts` | reuse | Helmet, CORS allow-list, body limits, `authLimiter`/`apiLimiter`/`sensitiveLimiter`, router mounts under `/api/auth` |
| `client/src/pages/AuthPage.tsx` | reuse | Sign-in/sign-up form, verification notice, `?expired=1` message, post-login routing |
| `client/src/pages/VerifyEmailPage.tsx` | reuse | Consumes the verification link; success, expired and resend states |
| `client/src/pages/ForgotPasswordPage.tsx` | reuse | Requests the reset email; always the same confirmation |
| `client/src/pages/ResetPasswordPage.tsx` | reuse | Sets the new password from the URL token |
| `client/src/pages/SecurityPage.tsx` | reuse | Hosts the password change and the signed-in devices list |
| `client/src/features/account/components/SessionList.tsx` | reuse | Accessible device list with per-device sign-out (`aria-label="Sign out <device>"`) |
| `client/src/features/account/api.ts` | reuse | `sessionsApi.list/revoke/revokeOthers` against `/profile/sessions` |
| `client/src/utils/session.ts` | reuse | `saveSession`, `getStoredUser`, `updateStoredUser`, `clearSession`, cache wipe on login/logout |
| `client/src/utils/api.ts` | reuse | Bearer injection, the `401 → clearSession + /login?expired=1` interceptor, `getApiErrorMessage` |
| `client/src/hooks/useAuthGuard.ts` | reuse | Page guard (session + onboarding) and logout through `/auth/logout` |
| `client/src/components/auth/validation.ts` | reuse | Shared email, name and password rules |

Referenced requirements: FR-001…FR-012, NFR-001…NFR-004.

## Data model

**`User`** — `action: no_change`. Fields used by this feature: `name` (max 80), `email` (unique, lowercase),
`password` (bcrypt hash), `isVerified`, `verificationToken` (hash, nullable), `verificationTokenExpires`
(nullable), `resetPasswordToken` (hash, nullable), `resetPasswordExpires` (nullable), `onboarding`
`{ role, useCase, teamSize, completedAt }` (nullable), `workspaces` (ObjectId[]), `activeWorkspace`
(nullable). No field is added, modified or removed by this record.

**`Session`** — `action: no_change`. `user` (ref User), `token` (unique SHA-256 hash of the JWT), `userAgent`,
`ipAddress`, `lastLoggedIn` (written at most every 5 minutes), `isValid` (default `true`), `createdAt`,
`updatedAt`. Indexes: `{ createdAt: 1 }` TTL 8 days, `{ user, isValid, createdAt }`, unique `{ token: 1 }`.

**Flow.** Signup writes a `User` with `isVerified: false` and a hashed verification token and emails a link
built from `CLIENT_URL`. Opening the link hashes the token, matches it against an unexpired row, sets
`isVerified` and clears the token fields. Login loads the user by exact email, compares the bcrypt hash,
refuses an unverified account with `403`, and otherwise mints a JWT (`jti`, 7 days) plus a `Session` row
holding the token hash, the user agent and the IP. `protect` recomputes the hash on every request and requires
a matching `isValid` session, so revocation is immediate. Sessions are read and revoked through
`GET|DELETE /api/profile/sessions` and `POST /api/profile/sessions/revoke-others`; MongoDB drops rows eight days
after creation through the TTL index.

## API contracts

| Method | Path | Auth | Requirements |
|---|---|---|---|
| POST | `/api/auth/signup` | no | FR-001 |
| POST | `/api/auth/login` | no | FR-003, FR-004 |
| POST | `/api/auth/logout` | yes (bearer) | FR-006 |
| GET | `/api/auth/currentuser` | yes (bearer) | FR-011 |
| GET | `/api/auth/verify-email/:token` | no | FR-002 |
| POST | `/api/auth/resend-verification` | no | FR-002 |
| POST | `/api/auth/forgot-password` | no | FR-007 |
| POST | `/api/auth/reset-password/:token` | no | FR-007, FR-008 |
| POST | `/api/auth/onboarding` | yes (bearer) | FR-010 |
| PUT | `/api/profile/password` | yes (bearer) | FR-008 |
| GET | `/api/profile/sessions` | yes (bearer) | FR-009 |
| DELETE | `/api/profile/sessions/:id` | yes (bearer) | FR-009 |
| POST | `/api/profile/sessions/revoke-others` | yes (bearer) | FR-009 |

All paths are mounted in `server/src/app.ts` (`app.use('/api/auth', authRoutes)`,
`app.use('/api/profile', profileRoutes)`), and `authRoutes`/`profileRoutes` declare the segments above.

## Security considerations

- **NFR-001 — rate limiting (CON-514).** `app.use('/api/auth', authLimiter)` (100 / 15 min per IP) and the
  stricter `sensitiveLimiter` (20 / 15 min) on `/api/auth/login`, `/api/auth/forgot-password`,
  `/api/auth/resend-verification`, `/api/profile/password` and the two-factor routes (GET requests are exempt
  so a form can load). Denials return JSON so the web app can display them.
- **NFR-002 — unrecoverable credentials (CON-505).** bcrypt for passwords; SHA-256 digests for session,
  verification and reset tokens; `userModel`'s `toJSON` transform also deletes the password and token fields,
  so a serialised user can never carry them.
- **NFR-003 — input validation (CON-515, CON-516).** Validation chains are exported next to their controllers
  and attached in the routers; controllers cast with `String()` and query with `{ email: { $eq: … } }` so
  payload objects cannot become MongoDB operators (covered by `security.test.ts` "rejects NoSQL operator
  objects on login").
- **NFR-004 — verified by tests (CON-402, CON-404).** Unit tests for the helpers plus integration tests against
  a real MongoDB; see the verification table in `spec.md`.

## Performance considerations

- **NFR-002.** Deterministic token digests keep the per-request lookup an indexed equality match
  (`{ token: 1 }` unique); bcrypt is used only where a value must be hard to guess.
- **NFR-004.** The authenticated path costs one indexed `Session` lookup and one `User.findById`. Writing
  `lastLoggedIn` at most every 5 minutes keeps a chatty client from turning reads into writes, and the TTL index
  keeps the collection from growing without a background job.

## Dependencies

| Name | Type | Action | Notes |
|---|---|---|---|
| `jsonwebtoken` | library | no_change | Session JWT signing/verification |
| `bcryptjs` | library | no_change | Password hashing and comparison |
| `express-validator` | library | no_change | Route-level validation chains |
| `nodemailer` | library | no_change | SMTP fallback transport |
| `express-rate-limit` | library | no_change | `authLimiter`, `apiLimiter`, `sensitiveLimiter` |
| `mongoose` | library | no_change | `User` and `Session` models, TTL index |
| Resend | service | no_change | Preferred email provider (`RESEND_API_KEY`) |
| MongoDB | service | no_change | Users and revocable session rows |
| `server/src/config/env.ts` | internal | no_change | Validated configuration before the app starts |

## Risks

| Risk | Mitigation |
|---|---|
| Verification/recovery mail is filtered as spam, blocking activation | Resend endpoint, console fallback outside production, and the link is never logged in production |
| A stale browser token is presented after revocation | `401` from `protect` plus the axios interceptor clearing the session and redirecting to `/login?expired=1` |
| A reset link stays valid for its hour | The hash is cleared on use, every session is invalidated, and only the newest link is honoured |
| Rate limiting keys on the proxy address, weakening brute-force protection | `app.set('trust proxy', config.trustProxy)` when the environment declares a proxy depth |
