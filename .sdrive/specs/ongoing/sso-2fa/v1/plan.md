> **Retroactive plan** — describes the architecture that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# sso-2fa — Technical plan (v1)

## Approach

Three credential paths share one rule: the secret never travels and is never stored in a readable form.

- **OIDC is a pure module.** `server/src/utils/oidc.ts` takes an injectable `fetch` (`OidcDeps`), so discovery,
  the code exchange and ID-token verification are unit tested against a fake provider with no network
  (CON-109). The controller only wires request → utility → redirect.
- **Two-factor is split by concern.** Cryptography in `server/src/utils/totp.ts` (Node `crypto`, no new
  dependency), encryption in `server/src/utils/secretBox.ts` (CON-112), the state machine in
  `server/src/utils/twoFactor.ts` (challenge, verify, lock), and persistence through `select: false` fields on
  the user document.
- **API tokens are digests plus scopes from birth.** The plain value exists once, in the create response; the
  database holds a keyed PBKDF2 digest, so a leaked copy cannot be replayed without the server key.
- **Errors are values, not prose.** The browser only ever receives one of the fixed `SsoErrorCode` values or a
  fixed client `code`, so nothing provider-supplied or secret can leak through a redirect.

Everything below already exists, so the actions are `reuse`.

## Components

| Component | Action | Responsibility |
|---|---|---|
| `server/src/config/sso.ts` | reuse | `readSsoProviders` (both credentials required), tenant sanitisation, `getSsoProvider`, `getApiPublicUrl`, `callbackUrl` |
| `server/src/utils/oidc.ts` | reuse | Discovery/JWKS caching, PKCE, `buildAuthorizationUrl`, `exchangeCode`, `verifyIdToken`, `identityFromClaims` |
| `server/src/utils/safeRedirect.ts` | reuse | `safeRedirectPath`: relative in-app paths only |
| `server/src/utils/totp.ts` | reuse | base32, HOTP/TOTP, `verifyTotp` (window + replay guard), `buildOtpauthUrl` |
| `server/src/utils/secretBox.ts` | reuse | `encryptSecret`/`decryptSecret` (AES-256-GCM, HKDF, AAD = context) |
| `server/src/utils/recoveryCodes.ts` | reuse | `generateRecoveryCodes`, `normalizeRecoveryCode`, `hashRecoveryCodes`, `findRecoveryCodeHash` |
| `server/src/utils/twoFactor.ts` | reuse | `createChallenge`, `readChallenge`, `verifySecondFactor`, `registerFailure`, `isLocked`, `requiredByAnyWorkspace` |
| `server/src/utils/apiTokens.ts` | reuse | `generateApiToken`, `hashApiToken`, `isApiTokenFormat`, `isTokenUsable`, `scopesWithinPermissions`, `expiryFromDays` |
| `server/src/controllers/ssoController.ts` | reuse | `listProviders`, `startSso`, `ssoCallback` (single-use state, fixed codes), `resolveSsoUser`, `listSsoMethods`, `unlinkSsoMethod` |
| `server/src/controllers/twoFactorController.ts` | reuse | Status, setup, enable, disable, regenerate, `completeTwoFactorLogin`, `loadAuthorizedUser` |
| `server/src/controllers/tokenController.ts` | reuse | `validateCreateToken`, `listTokens`, `createToken`, `revokeToken` |
| `server/src/routes/ssoRoutes.ts` | reuse | `/api/auth/sso/providers`, `/:provider/start`, `/:provider/callback` (mounted before `/api/auth`) |
| `server/src/routes/authRoutes.ts` | reuse | `POST /login/2fa` |
| `server/src/routes/profileRoutes.ts` | reuse | The `/2fa` and `/sso` endpoints behind `protect` + `rejectApiToken` |
| `server/src/routes/tokenRoutes.ts` | reuse | `/api/workspaces/:slug/tokens` behind `protect` + `rejectApiToken` + `requirePermission('tasks:read')` |
| `server/src/models/ssoStateModel.ts` | reuse | Pending sign-in row: state hash, provider, verifier, nonce, redirect, TTL |
| `server/src/models/twoFactorChallengeModel.ts` | reuse | `user`, unique `nonceHash`, `attempts`, TTL |
| `server/src/models/apiTokenModel.ts` | reuse | `workspace`, `user`, `name`, `prefix`, `tokenHash` (`select: false`), `scopes`, `expiresAt`, `lastUsedAt`, `revokedAt` |
| `server/src/models/userModel.ts` | reuse | `twoFactor.*` (secrets/`select: false`), `sso[]`, `ssoOnly`, partial unique index on `(provider, subject)`, the `toJSON` reduction |
| `server/src/middleware/authMiddleware.ts` | reuse | `authenticateApiToken` inside `protect`, `rejectApiToken` |
| `server/src/middleware/permissionMiddleware.ts` | reuse | Token workspace/scope enforcement and `req.permissions` narrowing |
| `server/src/app.ts` | reuse | Mount order (`/api/auth/sso` before `/api/auth`) and the sensitive limiter on the 2FA routes |
| `client/src/features/sso/*` | reuse | `api.ts` (providers/methods/unlink, `ssoStartUrl`), `lib.ts` (messages, fragment, pending marker), `SsoButtons`, `ConnectedSignIn` |
| `client/src/pages/AuthPage.tsx` | reuse | Password step, second step, `sso_error` message, SSO challenge hand-off |
| `client/src/pages/SsoCompletePage.tsx` | reuse | Fragment read/clear, pending check, profile load, session save, routing |
| `client/src/features/account/*` | reuse | `twoFactorApi`, `useTwoFactorStatus`, `TwoFactorCard`, `TwoFactorSetupDialog`, `RecoveryCodesDialog`, `lib/twoFactor.ts` |
| `client/src/features/developers/*` | reuse | `useTokens`, `CreateTokenDialog`, `TokenList`, `SecretReveal`, `lib/catalog.ts` |
| `client/src/components/TwoFactorRequiredGate.tsx` | reuse | The blocking screen raised by the `TWO_FACTOR_REQUIRED` event |

Referenced requirements: FR-001…FR-016, NFR-001…NFR-005.

## Data model

**`User`** — `action: no_change`. `twoFactor` (`enabled`, `secretEncrypted`, `pendingSecretEncrypted`,
`recoveryCodeHashes`, `enabledAt`, `lastUsedStep`, `failedAttempts`, `lockedUntil`; the secret and hash fields
are `select: false`), `sso` (array of `{ provider, subject, email, linkedAt }` with a partial unique index on
`(sso.provider, sso.subject)`) and `ssoOnly`.

**`SsoState`** — `action: no_change`. `stateHash` (unique), `provider`, `codeVerifier`, `nonce`, `redirect`
(max 300), `expiresAt` with a TTL index; `SSO_STATE_TTL_MS` = 10 minutes.

**`TwoFactorChallenge`** — `action: no_change`. `user`, `nonceHash` (unique), `attempts`, `expiresAt` with a TTL
index.

**`ApiToken`** — `action: no_change`. `workspace`, `user`, `name`, `prefix`, `tokenHash` (unique, `select:
false`), `scopes`, `expiresAt`, `lastUsedAt`, `revokedAt`; index on `{ workspace, user, createdAt }`.

**Flow.**
1. `/start` → discovery, PKCE pair, state, nonce → `SsoState` (hash only, 10 min) → redirect to the provider.
2. `/callback` → delete the state row (single use) → exchange the code with the verifier → verify the ID token →
   resolve the account (linked subject → verified email → create `ssoOnly`) → session in the URL fragment of
   `/sso/complete`, or a challenge in the fragment of `/login` when two-factor is on.
3. Password login with two-factor → `TwoFactorChallenge` row (hashed nonce, 5 min) → `POST /api/auth/login/2fa`
   verifies the code or a recovery code with conditional writes → session.
4. Token creation → plain token returned once, `ApiToken` row with the digest, prefix, scopes, workspace and
   expiry → every later request resolves the row by digest and enforces workspace + scopes on top of the role.

## API contracts

| Method | Path | Auth | Requirements |
|---|---|---|---|
| GET | `/api/auth/sso/providers` | no | FR-001 |
| GET | `/api/auth/sso/:provider/start` | no | FR-002 |
| GET | `/api/auth/sso/:provider/callback` | no (state + provider) | FR-003, FR-004, FR-005, FR-006 |
| POST | `/api/auth/login/2fa` | no (challenge is the credential) | FR-009 |
| GET | `/api/profile/2fa` | yes, no API token | FR-008 |
| POST | `/api/profile/2fa/setup` | yes, no API token | FR-008 |
| POST | `/api/profile/2fa/enable` | yes, no API token + password | FR-008 |
| POST | `/api/profile/2fa/disable` | yes, no API token + password | FR-011 |
| POST | `/api/profile/2fa/recovery-codes` | yes, no API token + password | FR-010 |
| GET | `/api/profile/sso` | yes, no API token | FR-012 |
| DELETE | `/api/profile/sso/:provider` | yes, no API token | FR-012 |
| GET | `/api/workspaces/:slug/tokens` | yes (session or token), `tasks:read` | FR-013 |
| POST | `/api/workspaces/:slug/tokens` | yes, `tasks:read`, token refused | FR-013 |
| DELETE | `/api/workspaces/:slug/tokens/:id` | yes, `tasks:read`, token refused | FR-014 |

Mounts: `app.use('/api/auth/sso', ssoRoutes)` before `app.use('/api/auth', authRoutes)`,
`app.use('/api/profile', profileRoutes)`, and the token router under `/api/workspaces/:slug/tokens`.

## Security considerations

- **NFR-001 — real credentials only (CON-511).** Account endpoints sit behind `protect` + `rejectApiToken`;
  `authenticateApiToken` additionally refuses any request without a workspace slug, so tokens cannot reach
  account or workspace-management routes. Enabling, disabling and regenerating recovery codes repeat the
  password (`loadAuthorizedUser` answers `400 INVALID_PASSWORD`, not `401`, so the client does not treat it as an
  expired session).
- **NFR-002 — authenticated encryption and digests (CON-112).** TOTP secrets are AES-256-GCM with an
  HKDF-SHA256 key and the user id as AAD, so a value copied between accounts fails the tag check. SSO state and
  challenge nonces are SHA-256 hashes, recovery codes are bcrypt hashes, API tokens are keyed PBKDF2-SHA256
  digests, and every secret field is `select: false`.
- **NFR-003 — bounded brute force (CON-514).** `/api/auth/login/2fa` and `/api/profile/2fa` share the
  20-per-15-minute sensitive limiter (GET exempt so a page can load), a challenge tolerates five wrong codes,
  and five consecutive failures set `lockedUntil` for fifteen minutes.
- **NFR-004 — no leaks in logs or responses (CON-501, CON-517).** `logFailure` prints the error name and message
  only; the browser always receives a fixed code; `toJSON` reduces `twoFactor` to `{ enabled, enabledAt }`; token
  listing projects an explicit field set without `tokenHash`; the SSO session token travels in a URL fragment so
  it never reaches an access log or `Referer`.
- **NFR-005 — verified (CON-402, CON-404).** Unit tests cover the RFC vectors, the secret box, the token digests,
  token verification and redirect safety; integration tests cover both sign-in paths, recovery, the workspace
  policy and token use.

## Performance considerations

- **NFR-002.** PBKDF2 with 10,000 iterations costs a few milliseconds per token request while keeping a leaked
  digest expensive offline; token creation pays that cost once.
- **NFR-003.** Challenge rows are replaced per sign-in (`deleteMany` per user) and both transient collections
  carry TTL indexes, so they stay small without a cleanup job.
- **NFR-004.** Discovery and JWKS documents are cached for an hour with at most one refetch per minute for an
  unknown `kid`, so verification is normally a local RS256 check.
- **NFR-001.** `authenticateApiToken` writes `lastUsedAt` at most once a minute per token.

## Dependencies

| Name | Type | Action | Notes |
|---|---|---|---|
| `jsonwebtoken` | library | no_change | Challenge signing/verification, ID-token header decoding |
| `bcryptjs` | library | no_change | Recovery-code hashes and the password check before sensitive changes |
| `mongoose` | library | no_change | `SsoState`, `TwoFactorChallenge`, `ApiToken` models with TTL/unique indexes |
| Node `crypto` | internal | no_change | TOTP, AES-256-GCM, HKDF, PBKDF2, random tokens — no new crypto dependency |
| Google Identity | service | no_change | OIDC provider (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) |
| Microsoft Entra ID | service | no_change | OIDC provider (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`) |
| MongoDB | service | no_change | Users, transient sign-in rows, API tokens |
| `server/src/utils/secretBox.ts` | internal | no_change | Only writer/reader of encrypted secrets |
| `server/src/config/permissions.ts` | internal | no_change | The API-token scope catalogue |

## Risks

| Risk | Mitigation |
|---|---|
| An unverified account is pre-hijacked with a password before the real owner signs in with the provider | A provider-verified email is required, the unverified account is taken over explicitly (password/tokens/sessions dropped) and a second identity of the same provider is `account_conflict` |
| Rotating `JWT_SECRET` or losing `TWO_FACTOR_KEY` makes stored secrets unreadable | A dedicated `TWO_FACTOR_KEY` keeps the rotations independent, both are validated at boot, and a failed decryption is treated as a missing factor rather than a success |
| A leaked API token is used beyond its intent | One workspace, scopes bounded by the owner's permissions, refused on account routes, ten tokens maximum, optional expiry, immediate revocation, digest-only storage |
| Provider metadata changes break verification | Discovery/JWKS caching with a bounded refetch, explicit claim checks, fixed browser error codes instead of stack traces |
