> **Retroactive task list** — every task below is already implemented in the codebase (onboarded 2026-10-16). Not authored upfront; recorded for governance and traceability only.

# sso-2fa — Execution tasks (v1)

Legend: `P#` phase, `T#.#` task. Requirements use `FR-###`/`NFR-###`, acceptance criteria `AC-###`, tests
`TEST-###` (legend in `spec.md` → *Verification (retroactive)*).

## P1 — Single sign-on configuration and sign-in start

- [x] **T1.1 Read the provider configuration and expose what is enabled** — `readSsoProviders` enables a provider only when both client id and secret are set, sanitises `MICROSOFT_TENANT` to one URL-safe segment, and `listProviders` returns id/label pairs only. _FR-001 — AC-001_
- [x] **T1.2 Start a sign-in with state, PKCE and a nonce** — `startSso` fetches discovery, creates the PKCE pair, state and nonce, stores only the state hash with the verifier, nonce, validated redirect and a ten-minute expiry, and redirects with `Cache-Control: no-store`; unreachable provider → `502`. _FR-002 — AC-002, AC-003_

## P2 — Callback, token verification and account resolution

- [x] **T2.1 Finish the round trip and map every failure to a fixed code** — `ssoCallback` deletes the pending state first (single use), always exchanges the code with the PKCE verifier, and redirects to `/login` with one of the fixed `SsoErrorCode` values; the session travels in the fragment of `/sso/complete`. _FR-003 — AC-004, AC-005_
- [x] **T2.2 Verify ID tokens and decide which claims to trust** — `oidc.ts` caches discovery and JWKS, accepts only RS256 keys from the discovered set, checks audience, expiry, `iat`, issuer (including Microsoft tenant templates), `azp` and nonce; `identityFromClaims` applies the Google/Microsoft email trust rules. _FR-004 — AC-006, AC-007_
- [x] **T2.3 Resolve, link or create the account** — `resolveSsoUser` links by `(provider, subject)`, requires a provider-verified email otherwise, links or creates a verified `ssoOnly` account with a random password, takes over an unverified account, and refuses a second identity of the same provider. _FR-005 — AC-008, AC-009_
- [x] **T2.4 Send two-factor accounts to the challenge step** — An SSO identity whose account has two-factor on receives a challenge in the fragment of the login page instead of a session. _FR-006 — AC-015_

## P3 — Two-factor at sign-in

- [x] **T3.1 Implement TOTP on Node crypto only** — base32 encode/decode, HOTP/TOTP generation, a ±1 step window, a comparison visiting every candidate step, a `lastUsedStep` replay guard and the otpauth URL builder. _FR-007 — AC-014, AC-018_
- [x] **T3.2 Challenge, verify and lock the second step** — `createChallenge` writes a hashed single-use nonce with a five-minute expiry and signs a separate-purpose JWT; `completeTwoFactorLogin` verifies the code or a recovery code with conditional writes, counts challenge attempts, deletes the challenge after five wrong codes and locks the account for fifteen minutes after repeated failures. _FR-009 — AC-011, AC-012, AC-013_
- [x] **T3.3 Wire the password step to the challenge** — `loginUser` answers `{ twoFactorRequired: true, challenge }` instead of a session when two-factor is on, and `POST /api/auth/login/2fa` completes it via `completeTwoFactorLogin`. _FR-009 — AC-010, AC-011_

## P4 — Enrolment, recovery codes and disabling

- [x] **T4.1 Expose the status and start a setup** — `getTwoFactorStatus` reports `enabled`, `enabledAt` and `recoveryCodesRemaining`; `setupTwoFactor` returns a base32 secret and an otpauth URL while storing the secret encrypted as pending, refusing when already on. _FR-008 — AC-016, AC-017_
- [x] **T4.2 Enable with the password and a proving code** — `enableTwoFactor` requires the password plus a valid code, stores the encrypted secret, records the proving step as used, drops the pending secret and returns ten recovery codes exactly once. _FR-008, NFR-001 — AC-018, AC-020_
- [x] **T4.3 Accept and regenerate recovery codes** — codes are generated from an alphabet without look-alike characters, hashed with bcrypt and consumed by a conditional pull; regeneration requires the password plus a current authenticator code and invalidates the previous codes. _FR-010 — AC-021, AC-022, AC-023_
- [x] **T4.4 Disable two-factor unless a workspace requires it** — `disableTwoFactor` requires the password plus a code or a recovery code, refuses with `TWO_FACTOR_REQUIRED_BY_WORKSPACE` while any workspace requires it, and clears every two-factor field and the open challenges. _FR-011 — AC-024_

## P5 — Linked sign-in methods

- [x] **T5.1 List and unlink provider identities** — `listSsoMethods` reports the linked providers, whether a password exists and which providers are configured; `unlinkSsoMethod` pulls one link and refuses the only method of a passwordless account with `LAST_SIGN_IN_METHOD`. _FR-012 — AC-025, AC-026_

## P6 — Personal API tokens

- [x] **T6.1 Generate tokens and store only a digest** — `generateApiToken` returns `tm_` plus 40 uniform base62 characters with an 8-character display prefix and a keyed PBKDF2-SHA256 digest; `validateCreateToken` checks the name, the scope keys, the scope subset, the ten-token cap and the expiry window. _FR-013, NFR-002 — AC-027, AC-029_
- [x] **T6.2 List and create tokens without ever returning them again** — `listTokens` projects an explicit field set that excludes the digest and shows only the caller's tokens; `createToken` returns the plain value once and records `token.created`. _FR-013 — AC-027, AC-028_
- [x] **T6.3 Enforce the token's workspace and scopes on every request** — `protect` dispatches `tm_` tokens to `authenticateApiToken` (digest lookup, usable check, workspace route required, throttled `lastUsedAt`) and `requirePermission` adds the workspace and scope checks on top of the role's permissions. _FR-014, NFR-001 — AC-030, AC-031, AC-033_
- [x] **T6.4 Revoke a token** — `revokeToken` lets the owner revoke their own token, or a `settings:manage` holder revoke any token in the workspace, sets `revokedAt` and records `token.revoked`; revoked and expired tokens are refused on use. _FR-014 — AC-032, AC-033_

## P7 — Client surfaces

- [x] **T7.1 Offer provider buttons and complete the hand-off** — `SsoButtons` renders one button per configured provider and marks the pending sign-in per tab; `SsoCompletePage` reads the fragment once, clears it from the address bar and history, requires a sign-in started in this tab, loads the profile and stores the session. _FR-015 — AC-034_
- [x] **T7.2 Map server error codes to plain language** — `lib.ssoErrorMessage` covers every `SsoErrorCode` plus `not_started`, unknown codes fall back to a generic message, and `safeAppPath` restricts the redirect to an in-app path. _FR-015 — AC-034_
- [x] **T7.3 Build the two-factor settings and recovery UI** — `TwoFactorCard`, `TwoFactorSetupDialog`, `RecoveryCodesDialog` and the `TwoFactorStep` form, with sanitised code input, grouped secret display, normalised recovery codes and a downloadable recovery file. _FR-016 — AC-035_
- [x] **T7.4 Gate a workspace that requires two-factor** — the axios client raises `TWO_FACTOR_REQUIRED_EVENT` on a 403 with that code and `TwoFactorRequiredGate` shows a blocking screen linking to Security settings; the workspace security card warns the admin before enabling the policy. _FR-016, FR-011 — AC-035, AC-024_
- [x] **T7.5 Build the developer token screens** — `DevelopersPage` with `useTokens`, `CreateTokenDialog`, `TokenList` and `SecretReveal`: scopes limited by `catalog.grantableScopes`, read scopes preselected, and the secret shown once. _FR-013 — AC-027, AC-028_

## P8 — Hardening and quality gates

- [x] **T8.1 Unit test the pure modules** — `totp.test.ts`, `secretBox.test.ts`, `apiTokens.test.ts`, `oidc.test.ts` and `ssoRedirect.test.ts` cover the RFC vectors, encryption context binding, token format and digests, token verification and redirect safety. _NFR-005 — AC-004, AC-006, AC-014_
- [x] **T8.2 Integration test the flows** — `sso.test.ts` (against a fake provider), `twoFactor.test.ts` and `apiTokens.test.ts` drive SSO sign-in, linking, the second step, recovery codes, the workspace policy and token use over HTTP against a real database. _NFR-005 — AC-013, AC-015, AC-030_
- [x] **T8.3 Bound brute force at both steps** — both two-factor routes sit behind `sensitiveLimiter`, a challenge tolerates five wrong codes, and five consecutive failures set `lockedUntil` for fifteen minutes. _NFR-003 — AC-012, AC-013_
- [x] **T8.4 Keep secrets out of storage, logs and responses** — `secretBox` for the shared secret, bcrypt for recovery codes, SHA-256 for state and challenge nonces, PBKDF2 for tokens, `select: false` on every secret field, a `toJSON` reduction of `twoFactor`, and `logFailure` printing only the error name and message. _NFR-002, NFR-004 — AC-019, AC-020, AC-022, AC-028_
- [x] **T8.5 Require a real session for account endpoints** — `protect` plus `rejectApiToken` on every `/api/profile/2fa` and `/api/profile/sso` route, and password confirmation before enabling, disabling or regenerating codes. _NFR-001 — AC-018, AC-024, AC-026, AC-031_
- [x] **T8.6 Run the repository quality gates** — `pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client build`, plus the browser checks on the sign-in, security and developers screens (CON-402, CON-703). _NFR-005 — AC-034, AC-035_
