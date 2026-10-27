> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# sso-2fa — Single sign-on, two-factor authentication and personal API tokens (v1)

| | |
|---|---|
| Feature | `sso-2fa` |
| Version | 1 |
| Status | Implemented and shipped |
| Governance | `.sdrive/governance/sso-2fa/v1/{spec,plan,tasks,traceability}.json` |
| Constitution | CON-103, CON-109, CON-110, CON-112, CON-402, CON-403, CON-404, CON-501, CON-505, CON-511, CON-514, CON-515, CON-517 |

## Overview

**Problem.** A password alone can be guessed, reused or phished, and it is the wrong thing to hand to a script.
TaskMan needs three more ways to prove identity and to delegate access — OIDC sign-in with Google and
Microsoft, a time-based one-time password as a second step, and scoped personal API tokens — without ever
storing a secret in a form that can be read back or logging something an attacker could replay.

**Solution.** SSO is the authorization-code flow with PKCE: `server/src/utils/oidc.ts` does discovery, the code
exchange and ID-token verification (RS256, audience, expiry, `iat`, issuer, `azp`, nonce), while
`server/src/models/ssoStateModel.ts` keeps only the state hash with a ten-minute TTL. Two-factor implements TOTP
(RFC 6238 over RFC 4226: HMAC-SHA1, 30 s, 6 digits, ±1 step, replay protection via a stored last-used step) in
`server/src/utils/totp.ts`; the shared secret is encrypted at rest by `server/src/utils/secretBox.ts`
(AES-256-GCM, HKDF-derived key, user id as AAD, CON-112) and recovery codes are bcrypt hashes. The second step
is a short-lived JWT bound to a single-use nonce in `server/src/models/twoFactorChallengeModel.ts`. Personal API
tokens are `tm_` + 40 base62 characters, stored only as a keyed PBKDF2-SHA256 digest, bound to one workspace and
to a subset of the owner's permissions (`server/src/utils/apiTokens.ts`).

**Audience.** Members who sign in with Google or Microsoft, security-conscious users who add a second factor,
owners who need recovery codes, and developers who automate the API.

**Assumptions recorded.**
- SSO is optional: a provider is offered only when both its client id and secret are configured, so an
  installation without `GOOGLE_CLIENT_ID` / `MICROSOFT_CLIENT_ID` simply shows no button.
- The provider set is closed (`SSO_PROVIDER_IDS` = `google`, `microsoft`); no other provider is implemented.
- `API_PUBLIC_URL` must be set when the API and the web app do not share an origin, because the OIDC redirect URI
  is built from it (`getApiPublicUrl`, `callbackUrl`).
- `TWO_FACTOR_KEY` falls back to `JWT_SECRET` when unset; rotating either makes existing encrypted secrets
  unreadable and invalidates every API token digest. No key-rotation procedure is implemented.
- `RISK-005` in `spec.json` refers to provider metadata changes; the JWKS/discovery cache is a performance
  cache only, and no test asserts behaviour against a live provider.

**Out of scope.** Workspace roles and the permission catalogue (`workspaces-rbac`, referenced only as the source
of API-token scopes); passwords, email verification, reset and sessions (`auth-sessions`, whose `issueSession` the
second step reuses); SAML, SCIM, WebAuthn/passkeys, SMS and hardware keys; outbound webhooks and the GitHub
integration.

## User stories and acceptance criteria

### US-001 — Sign in with my Google or Microsoft account
*As* a team member with a work identity, *I want* to sign in through my provider, *so that* I do not manage
another password.

- **AC-001** — `GET /api/auth/sso/providers` lists only providers with both client id and secret, as
  `{ id, label }`, never returning a secret (`readSsoProviders`, `listProviders`).
- **AC-002** — `GET /api/auth/sso/:provider/start` answers `404` for an unconfigured provider and `400` when the
  requested redirect is not a relative in-app path (`safeRedirectPath`).
- **AC-003** — Start redirects to the provider with state, nonce, an S256 PKCE challenge and the callback URL,
  sets `Cache-Control: no-store`, sets no cookie, and stores only the state hash with a ten-minute expiry
  (`SSO_STATE_TTL_MS`).
- **AC-004** — The callback consumes the state exactly once; unknown, malformed, expired or replayed states
  redirect with `sso_error=invalid_state` and create no session (`STATE_SHAPE`, `findOneAndDelete`).
- **AC-005** — The code is always exchanged with the provider; a refusal, missing code or oversized code
  (> `MAX_CODE_LENGTH` = 4096) ends in `access_denied` or `provider_error`, never in provider text.
- **AC-006** — An ID token is accepted only with an RS256 signature from the discovered key set, the right
  audience, unexpired `exp`, sane `iat`, an accepted issuer, a matching `azp` for multi-audience tokens and the
  stored nonce (`verifyIdToken`).
- **AC-007** — Microsoft tenancy is respected: `organizations` refuses personal accounts, `consumers` accepts
  only them, and an issuer naming a different tenant than `tid` is rejected (`isTenantAllowed`, `isIssuerAccepted`).
- **AC-008** — A new person gets a verified account with a random unknown password and no other method; an
  existing verified account is linked by email and keeps its password (`resolveSsoUser`).
- **AC-009** — A second identity of the same provider, or a duplicate `(provider, subject)` race, answers
  `account_conflict`; an unverified email claim creates or links nothing (`email_unverified`).

### US-002 — Complete the second step of sign-in
*As* a member with two-factor on, *I want* to enter the code from my authenticator app after my password,
*so that* a stolen password alone is not enough.

- **AC-010** — `POST /api/auth/login` answers `{ twoFactorRequired: true, challenge }` with no session when
  two-factor is on (`loginUser`, `createChallenge`).
- **AC-011** — `POST /api/auth/login/2fa` accepts a signed challenge bound to a stored single-use nonce that
  expires after `CHALLENGE_TTL_SECONDS` (5 minutes) and issues a session only for a valid code.
- **AC-012** — A wrong code increments the challenge attempts, the challenge is deleted after
  `MAX_CHALLENGE_ATTEMPTS` (5) wrong codes or when the right code follows them, a consumed challenge cannot be
  replayed, and the answer reports `attemptsLeft`.
- **AC-013** — Five consecutive failures across challenges (`MAX_FAILED_ATTEMPTS`) set `lockedUntil` for
  `LOCK_MS` (15 minutes), answered with `429 TWO_FACTOR_LOCKED`.
- **AC-014** — A TOTP code is accepted once: `lastUsedStep` is compared and updated by a conditional write, so a
  used code fails on a new challenge and two parallel requests leave exactly one winner.
- **AC-015** — An SSO sign-in for an account with two-factor redirects to `/login#challenge=…` instead of
  issuing a session.

### US-003 — Turn two-factor authentication on
*As* an account owner, *I want* to set up an authenticator app and confirm it with a code before it takes
effect, *so that* I cannot lock myself out.

- **AC-016** — `GET /api/profile/2fa` reports `enabled`, `enabledAt` and `recoveryCodesRemaining` only.
- **AC-017** — `POST /api/profile/2fa/setup` returns `{ secret, otpauthUrl }` and stores the secret encrypted as
  pending; `409 ALREADY_ENABLED` when two-factor is already on.
- **AC-018** — `POST /api/profile/2fa/enable` requires the password plus a valid code, stores the encrypted
  secret, sets `lastUsedStep` to the proving step, removes the pending secret and returns ten recovery codes
  once; a wrong password is `400 INVALID_PASSWORD`, a setup changed in another tab is `409 SETUP_REQUIRED`
  (`loadAuthorizedUser`, `generateRecoveryCodes`).
- **AC-019** — The secret is only persisted through `secretBox` (AES-256-GCM, HKDF key, user id as AAD), so a
  ciphertext copied to another account cannot be decrypted (`secretContext`).
- **AC-020** — A serialised user exposes at most `{ enabled, enabledAt }`; secret, pending secret and
  recovery-code hashes are `select: false` and stripped by the `toJSON` transform.

### US-004 — Keep access with recovery codes
*As* a member who lost the authenticator device, *I want* to sign in with a recovery code and replace the codes,
*so that* losing a phone does not mean losing the account.

- **AC-021** — A recovery code is accepted once, is pulled as it is used, and the answer reports how many remain.
- **AC-022** — Codes are bcrypt hashes; `findRecoveryCodeHash` compares every stored hash so timing does not
  reveal position.
- **AC-023** — `POST /api/profile/2fa/recovery-codes` replaces every code after the password plus a current
  authenticator code (a recovery code cannot be spent to mint new ones), and old codes stop working.

### US-005 — Manage how I sign in
*As* an account owner, *I want* to see my linked providers, remove one, and turn two-factor off again,
*so that* I keep control of my sign-in methods.

- **AC-024** — `POST /api/profile/2fa/disable` requires the password plus a code or a recovery code and is
  refused with `409 TWO_FACTOR_REQUIRED_BY_WORKSPACE` while a workspace the account belongs to requires
  two-factor; disabling clears every two-factor field and the open challenges (`requiredByAnyWorkspace`).
- **AC-025** — `GET /api/profile/sso` lists methods, `hasPassword` and the available providers;
  `DELETE /api/profile/sso/:provider` unlinks one, `404`s an unknown provider and answers
  `400 LAST_SIGN_IN_METHOD` for the only method of an account without a password.
- **AC-026** — Two-factor and SSO account routes are unreachable with a personal API token (`rejectApiToken` →
  `403`), and an account that resets its password through email can unlink its last method.

### US-006 — Create and revoke scoped personal API tokens
*As* a developer automating a workspace, *I want* a token restricted to one workspace and a few permissions,
*so that* automation does not need my password or my full access.

- **AC-027** — `POST /api/workspaces/:slug/tokens` validates the name (≤ 60) and at least one known scope,
  requires the scopes to be a subset of the caller's permissions, returns the plain token once and stores only
  the digest plus the display prefix (`validateCreateToken`, `generateApiToken`, `scopesWithinPermissions`).
- **AC-028** — Listing never returns the token or digest and shows only the caller's tokens in that workspace
  (`present`, `listTokens`).
- **AC-029** — At most `MAX_ACTIVE_TOKENS_PER_USER` (10) active tokens per user per workspace; expiry accepts
  1–365 days or an ISO date within a year.
- **AC-030** — A token is bound to its workspace and scopes: a missing scope answers `403 "This API token does
  not have the required scope"`, another workspace `403 "This API token belongs to another workspace"`, and the
  role check still applies so a token never exceeds its owner's current access (`requirePermission`).
- **AC-031** — A token never reaches account or workspace-management routes: `authenticateApiToken` requires a
  workspace slug (`403 "API tokens can only be used on workspace endpoints"`), `rejectApiToken` guards the
  account routes, and `/tokens` itself refuses tokens (`tokenRoutes.ts`).
- **AC-032** — `DELETE /api/workspaces/:slug/tokens/:id` revokes the caller's own token, or any token in the
  workspace for a caller with `settings:manage`; revoked (`revokedAt`) and expired tokens stop working
  (`isTokenUsable`).
- **AC-033** — `lastUsedAt` is written at most every `LAST_USED_WRITE_INTERVAL_MS` (60 s), unknown, malformed and
  look-alike tokens answer `401` (`isApiTokenFormat`, `isTokenUsable`), and `token.created` / `token.revoked`
  reach the activity log.

### US-007 — Use the SSO and two-factor screens in the web app
*As* a member using the browser, *I want* the secure flow to be the easy one.

- **AC-034** — `SsoButtons` renders one button per configured provider (nothing when there are none) and calls
  `markSsoPending` on click; `/sso/complete` reads the fragment once, calls `clearFragment()` before storing the
  session, and rejects a hand-off that was not started in this tab (`consumeSsoPending` → `not_started`).
- **AC-035** — `sanitizeCode` keeps digits only and caps at six, `formatSecret` groups the secret in fours,
  `normalizeRecoveryInput` produces `xxxx-xxxx`, `recoveryCodesFile` states the account, the date and that each
  code works once, and a `TWO_FACTOR_REQUIRED` answer raises the blocking gate
  (`client/src/utils/twoFactorRequired.ts`, `TwoFactorRequiredGate.tsx`).

## Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | Providers come from the environment; only fully configured ones are listed, tenant values are sanitised. | AC-001 |
| FR-002 | Start creates state/PKCE/nonce, stores only the state hash with a 10-minute TTL, no cookie, no-store. | AC-002, AC-003 |
| FR-003 | Callback consumes the state once, always exchanges the code, and maps every outcome to a fixed error code. | AC-004, AC-005 |
| FR-004 | ID-token verification (RS256, aud, exp, iat, iss, azp, nonce) with the provider-specific email trust rules. | AC-006, AC-007 |
| FR-005 | Account resolution: link by subject, else verified email, else create `ssoOnly`; conflicts and unverified emails refused. | AC-008, AC-009 |
| FR-006 | An SSO sign-in on a two-factor account gets a challenge instead of a session. | AC-015 |
| FR-007 | TOTP per RFC 6238/4226 with ±1 step window, timing-safe comparison and single-use steps. | AC-014, AC-018 |
| FR-008 | Two-step enrolment with an encrypted pending secret; status never reveals secrets. | AC-016…AC-018, AC-020 |
| FR-009 | Challenge lifecycle with a hashed nonce, attempt cap and account lock. | AC-010…AC-013 |
| FR-010 | Recovery codes: single use, bcrypt hashes, replaced only with password + current code. | AC-021, AC-022, AC-023 |
| FR-011 | Disabling requires the password plus a factor and is refused while a workspace policy requires two-factor. | AC-024 |
| FR-012 | Linked methods are listed and removable, with the last-method guard. | AC-025, AC-026 |
| FR-013 | Token creation validates name/scopes/expiry, subsetting scopes against the caller, and stores only a digest. | AC-027…AC-029 |
| FR-014 | Token use is workspace- and scope-bound, revocation is owner-or-admin, and use is audited and throttled. | AC-030…AC-033 |
| FR-015 | Client SSO surface: provider buttons, per-tab pending marker, error-code messages, fragment hygiene. | AC-034 |
| FR-016 | Client two-factor surface: sanitised input, grouped secret, recovery file, workspace gate. | AC-035 |

## Non-functional requirements

| ID | Requirement | Constitution |
|---|---|---|
| NFR-001 | Account endpoints need a session and the password for sensitive changes; API tokens are refused there. | CON-511 |
| NFR-002 | Secrets are encrypted (AES-256-GCM + HKDF + AAD) and everything else is a digest (SHA-256, bcrypt, PBKDF2). | CON-112, CON-505 |
| NFR-003 | Second-step brute force is bounded by the sensitive limiter, a 5-attempt challenge cap and a 15-minute lock. | CON-514 |
| NFR-004 | No secret, code, provider body or token is logged or echoed; successes and failures use fixed codes. | CON-501, CON-517 |
| NFR-005 | Unit tests for the pure modules and integration tests for the flows. | CON-402, CON-403, CON-404 |

## Edge cases

| ID | Situation | Expected behaviour |
|---|---|---|
| EC-001 | A start/callback names an unconfigured provider | `404 "This sign-in method is not available."`, no state row created |
| EC-002 | The provider is unreachable at start | `502` after a log line without secrets |
| EC-003 | The state is replayed, expired or missing | The row is deleted by the first callback, so later attempts get `invalid_state` and no session |
| EC-004 | Consent is refused at the provider | Back to login with `access_denied`, distinguishable from `provider_error` by the presence of `error` in the query |
| EC-005 | The phone clock drifts one step | The ±1 window accepts it; a stale code gets `400 INVALID_CODE` and advice to use the newest code |
| EC-006 | A TOTP ciphertext is moved to another account | GCM tag verification fails (user id is AAD) and the factor is treated as missing, never as valid |
| EC-007 | A token is used outside its reach | `403` for another workspace or a missing scope; account and token routes always refuse tokens |
| EC-008 | `API_TOKEN_PEPPER` or `JWT_SECRET` is rotated | Every token digest changes, so all tokens stop working; encrypted secrets are affected by the same rotation |
| EC-009 | A passwordless SSO account unlinks its only provider | `400 LAST_SIGN_IN_METHOD` until a password is set; a reset through email clears `ssoOnly` and allows it |
| EC-010 | A member without two-factor joins a workspace that requires it | Workspace routes answer `403 TWO_FACTOR_REQUIRED` while the enrolment routes stay reachable |
| EC-011 | Two parallel requests present the same code | Conditional writes on `lastUsedStep` and the challenge row leave exactly one winner |

## Verification (retroactive)

Unit tests — `pnpm --filter server test <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-001 | `server/src/__tests__/totp.test.ts` | base32, HOTP/TOTP vectors, window, replay guard, otpauth URL |
| TEST-002 | `server/src/__tests__/secretBox.test.ts` | Round trip, tamper detection, context binding, key material handling |
| TEST-003 | `server/src/__tests__/apiTokens.test.ts` | Token format/uniqueness, digest, scope subsetting, expiry and usability |
| TEST-004 | `server/src/__tests__/oidc.test.ts` | Discovery, JWKS refetch limit, issuer/tenant rules, token verification and claim trust |
| TEST-005 | `server/src/__tests__/ssoRedirect.test.ts` | `safeRedirectPath` accepts in-app paths and rejects absolute, protocol-relative and control-character input |

Integration tests (real MongoDB; SSO runs against a fake provider) — `pnpm --filter server test:integration <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-006 | `server/src/__integration__/sso.test.ts` | Provider list, start (state/PKCE/no cookie), state single use/replay/expiry, account creation/linking/take-over, error codes, Microsoft tenancy, linked methods |
| TEST-007 | `server/src/__integration__/twoFactor.test.ts` | Setup/enable, secret hygiene, sign-in challenge, replay and parallel codes, recovery codes, regeneration, disable, workspace policy, tokens refused |
| TEST-008 | `server/src/__integration__/apiTokens.test.ts` | Create/list, digest-only storage, scope and workspace limits, role ceiling, unusable tokens, revoke/expire, activity entries |

Client tests — `pnpm --filter client test <file>`:

| Test id | File | Covers |
|---|---|---|
| TEST-009 | `client/src/features/sso/__tests__/lib.test.ts` | Error-code messages, `safeAppPath`, fragment parsing/clearing, pending marker, stored user from profile |
| TEST-010 | `client/src/features/sso/__tests__/SsoButtons.test.tsx` | One button per provider, none when unconfigured, start URL and pending marker |
| TEST-011 | `client/src/features/sso/__tests__/ConnectedSignIn.test.tsx` | Linked methods list, unlink action and the last-method message |
| TEST-012 | `client/src/features/account/__tests__/twoFactorLib.test.ts` | `sanitizeCode`, `isCompleteCode`, `formatSecret`, recovery-code normalisation, recovery file |
| TEST-013 | `client/src/features/account/__tests__/TwoFactorCard.test.tsx` | Status card, enrolment and recovery-code dialogs |
| TEST-014 | `client/src/features/developers/__tests__/lib.test.ts` | Scope catalogue mirror, `grantableScopes`, `defaultScopes`, event labels |
| TEST-015 | `client/src/features/developers/__tests__/components.test.tsx` | Token/webhook components, including the one-time secret reveal |
| TEST-016 | `client/src/pages/__tests__/SsoCompletePage.test.tsx` | Fragment hand-off, not-started rejection and error redirect |
| TEST-017 | `client/src/pages/__tests__/AuthPageSso.test.tsx` | Provider buttons and `sso_error` messaging on the sign-in page |
| TEST-018 | `client/src/pages/__tests__/AuthPageTwoFactor.test.tsx` | The second-step form after the password (and after an SSO challenge) |
| TEST-019 | `client/src/components/__tests__/TwoFactorRequiredGate.test.tsx` | The blocking workspace gate raised by `TWO_FACTOR_REQUIRED` |

Full gate: `pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402).
