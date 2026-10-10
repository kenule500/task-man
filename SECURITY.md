# Security policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (GitHub → **Security → Report a vulnerability**),
not in public issues. Include the affected URL or endpoint, steps to reproduce and the impact you expect.
We acknowledge reports within 3 working days.

## What TaskMan does today

| Area | Measures |
|---|---|
| Authentication | bcrypt password hashes; JWT with a unique id per session, checked against a server-side session that can be revoked ("sign out other devices") |
| Two-factor authentication | Optional TOTP (authenticator app) with one-time recovery codes; workspaces can require it for every member. See below |
| Single sign-on | Optional Google and Microsoft sign-in over OpenID Connect: authorization code with PKCE, single-use hashed state, nonce, RS256 ID-token verification, linking only on provider-verified emails, session handed over in the URL fragment. See below |
| Tokens at rest | Session, email-verification, password-reset and invitation tokens are stored as SHA-256 hashes |
| Authorization | Every workspace route passes `requirePermission('<area>:<action>')`; role grants are capped by the granter's own access |
| Input | express-validator on every write; NoSQL operator injection rejected; request bodies limited to 100 kB |
| Abuse | Rate limits on authentication, sensitive actions and the whole API |
| Transport and browser | HTTPS with HSTS, strict Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` |
| Files | Upload type allow-list (no SVG/HTML), size limit, members-only downloads served as attachments |
| Audit | Append-only activity log (who, what, when, IP, device) for tasks, projects, sprints, members, invitations, settings and exports, kept 365 days; owners and admins can filter and export it |
| Data exposure | Users never serialize password or token hashes; public user fields only (name, avatar) on tasks |
| Supply chain | `pnpm audit --prod` gate in CI, Dependabot updates, CodeQL analysis; SonarQube configuration in `sonar-project.properties` |

## Two-factor authentication

People turn it on in Settings, Security. Sign-in then asks for a code after the password. Owners and admins can require it
for a whole workspace.

- **TOTP parameters.** RFC 6238 with HMAC-SHA1, a 30 second step and 6 digits, the profile every authenticator app supports.
  Implemented with Node `crypto` only (`utils/totp.ts`, checked against the RFC 6238 and RFC 4226 test vectors). The shared
  secret is 20 random bytes (160 bits), base32 encoded. A code is accepted for the current step and one step either side
  (clock drift of 30 seconds); candidates are compared in constant time.
- **Setup.** `POST /api/profile/2fa/setup` stores a pending secret and returns it with an `otpauth://` URL (the web app draws the
  QR code in the browser). Nothing is enforced until `POST /api/profile/2fa/enable` receives a valid code and the account
  password. Repeating the password and a code is also required to turn it off or to replace the recovery codes.
- **Encryption at rest.** Secrets are encrypted with AES-256-GCM before they reach MongoDB (`utils/secretBox.ts`). The key is
  derived with HKDF-SHA256 from `TWO_FACTOR_KEY`, falling back to `JWT_SECRET`; the user id is authenticated as additional data,
  so a value copied to another account does not decrypt. The encrypted secret, the pending secret and the recovery code hashes are
  `select: false` and never serialized. Changing the key makes existing secrets unreadable, so people would have to be reset: set
  `TWO_FACTOR_KEY` before the first user enrolls and keep it stable.
- **Recovery codes.** Ten codes shaped `xxxx-xxxx` (about 40 random bits each, from `crypto.randomInt`), shown once. Only bcrypt
  hashes are stored. Each code works once: it is removed with a conditional update, so two parallel requests cannot both use it.
  Creating new codes replaces all of them. A recovery code can turn two-factor off or complete a sign-in, but cannot create new codes.
- **Replay protection.** The last accepted time step is stored (`lastUsedStep`); a code is accepted only for a newer step, and the
  step is claimed with a conditional write, so the same code cannot be used twice, even in parallel. The code that proves the setup
  is counted as used.
- **Sign-in flow.** After a correct password, `POST /api/auth/login` answers `{ twoFactorRequired, challenge }` and creates no session.
  The challenge is a 5 minute JWT (`purpose: '2fa'`) signed with a key derived from `JWT_SECRET` (not the session key) and bound to a
  random nonce whose hash is stored in the `twofactorchallenges` collection (TTL index). `POST /api/auth/login/2fa` with the
  challenge and a code or recovery code creates the session exactly like a password login. The challenge is single use and is deleted
  after 5 wrong codes. Five consecutive wrong codes on an account, across challenges, pause second-step attempts for 15 minutes.
  The endpoint also sits behind the sensitive rate limiter.
- **Workspace policy.** `security.require2fa` on the workspace (changed by `settings:manage` through `PUT /api/workspaces/:slug`
  with `{ require2fa }`, audited as `workspace.updated` with the change field `require2fa`). `requirePermission` answers
  `403 { code: 'TWO_FACTOR_REQUIRED' }` to members, and to their API tokens, who have no two-factor. Account routes (profile, two-factor
  setup, workspace list) are not workspace scoped and stay open so people can fix it. Nobody can switch the policy on without two-factor
  on their own account, and nobody can turn two-factor off while a workspace they belong to requires it, so the policy cannot lock an
  owner out.
- **Scope.** None of the two-factor endpoints accept an API token. Resetting a forgotten password through the email link does not
  remove two-factor, and does not skip it at the next sign-in.

## Single sign-on (Google and Microsoft)

Optional OpenID Connect sign-in, off until a provider's client id and secret are set (see the README). It is implemented with
`fetch`, Node `crypto` and `jsonwebtoken` only (`utils/oidc.ts`, unit tested against a locally generated RSA key and a fake JWKS;
the HTTP flow is covered by `__integration__/sso.test.ts` with a fake provider).

- **Authorization code with PKCE.** `GET /api/auth/sso/:provider/start` creates a random `state` (256 bits), a `nonce` and a PKCE
  verifier (S256 challenge), stores them and redirects to the provider with `scope=openid email profile` and `prompt=select_account`.
  The authorization endpoint, token endpoint and JWKS URI come from the provider's discovery document (cached for an hour) and
  must be `https`. The client secret is sent only to the token endpoint, in the POST body.
- **State.** Kept in the `ssostates` collection with a 10 minute TTL index. Only the SHA-256 of `state` is stored; the verifier and
  nonce are needed to finish the exchange. The callback deletes the row atomically (`findOneAndDelete`) before doing anything else, so a
  state works once, even when the sign-in later fails, and a replayed callback is refused. No cookie is set. The web app
  remembers in `sessionStorage` that a sign-in was started in that tab and refuses a hand-off it did not start (login CSRF: a crafted
  callback link that would sign you in to somebody else's account).
- **Redirect path.** `redirect` must be a relative in-app path: absolute URLs, `//host`, backslashes, control characters and
  anything that parses to another origin are refused with `400` and nothing is stored. The sign-in itself only ever redirects to
  `CLIENT_URL`.
- **ID token verification.** RS256 only (`none`, HMAC and other algorithms are refused, so there is no algorithm confusion); the key is
  chosen by `kid` from the provider's JWKS and imported with `crypto.createPublicKey({ format: 'jwk' })`. An unknown `kid`
  refetches the key set at most once a minute. Checked: signature, `iss` (exact match; for Microsoft's multi-tenant endpoints the
  `{tenantid}` template is filled with the token's own `tid`, which must be a GUID), `aud` equal to the client id (with `azp` when
  there are several), `exp` and `iat` with 2 minutes of clock skew (both required), `sub`, and the `nonce` (constant time).
  `MICROSOFT_TENANT=organizations` refuses personal accounts and `consumers` accepts only them.
- **Account linking rule.** A provider account that is already linked (`provider` + `sub`) signs in as that user, whatever its
  email claim says now. Otherwise the provider must vouch for the email: Google needs `email_verified: true`; Microsoft's `email`
  (or `preferred_username` when it is an address) is trusted only for personal Microsoft accounts, when `MICROSOFT_TENANT` is one specific
  organization, or when the `xms_edov` claim (email domain owner verified) is true, because Entra otherwise allows a tenant to set any
  address on its own users ("nOAuth"). Without a vouched email the sign-in ends with `email_unverified` and nothing is created. With one,
  the account with that email (`$eq` lookup) is linked, or a new verified account is created with a random password nobody knows.
  An account holds at most one identity per provider (a second one answers `account_conflict`), and a provider identity can belong to only
  one account (unique partial index on `sso.provider` + `sso.subject`). If the existing account was never email-verified, it may have
  been registered by someone who does not own the address (pre-hijacking): its password, verification and reset tokens are discarded and
  its sessions revoked before the link is made.
- **Two-factor stays in force.** When the account has two-factor authentication the callback creates no session; it redirects to
  `/login#challenge=...` with the same single-use challenge as a password sign-in, and the code is entered on the usual second step.
- **Hand-off.** A finished sign-in redirects to `/sso/complete#token=<session token>`. The fragment is never sent to a server, so the
  token stays out of access logs, proxies and `Referer` headers (the app also sends `Referrer-Policy: no-referrer`); the page reads it,
  removes it from the address bar and history, stores the session like a password login (a normal, revocable server-side session) and
  continues. The redirects carry `Cache-Control: no-store`.
- **Errors.** Failures redirect to `/login?sso_error=<code>` with one of a fixed set of codes (`access_denied`, `invalid_state`,
  `provider_error`, `invalid_token`, `email_missing`, `email_unverified`, `tenant_not_allowed`, `account_conflict`, `server_error`); the web
  app maps them to plain sentences. Provider messages, token endpoint bodies, codes, tokens and secrets are never put in a redirect or a
  log line. The routes sit behind the authentication rate limiter.
- **Removing a method.** `GET /api/profile/sso` and `DELETE /api/profile/sso/:provider` (never reachable with an API token). The last
  way into an account that has no password cannot be removed; setting a password through "Forgot password" turns the account into a
  normal one.
- **Operating.** Rotate a client secret at the provider and in the host settings; changing it does not affect linked accounts. Removing
  a provider's variables switches the button off and answers `404` on its routes; linked accounts keep their other sign-in methods.

## API tokens and webhooks

### Personal API tokens

- **Format and storage.** A token is `tm_` plus 40 random base62 characters (from `crypto.randomBytes`, no modulo bias). Only an
  PBKDF2-SHA256 digest (10,000 iterations) keyed with a server secret (`API_TOKEN_PEPPER`, else `JWT_SECRET`) is stored (unique index, never
  selected by default), so a database copy alone cannot test guessed tokens; rotating that secret revokes every token.
  The plain value is returned once, in the create response.
  The list shows the first 8 characters after `tm_` so people can tell tokens apart.
- **Use.** `Authorization: Bearer tm_...` is looked up by its digest. Revoked and expired tokens get `401`. Expiry is at most one year.
  `lastUsedAt` is written at most once a minute.
- **Scopes.** A token carries permission keys (`tasks:read`, ...) chosen at creation, and only keys its creator holds themselves.
  At request time `requirePermission` checks the token's workspace (another workspace gives `403`), the scope, and the
  owner's current role. A token therefore never does more than its owner can do today, and loses access if the owner is
  removed or demoted. At most 10 active tokens per person per workspace.
- **Where tokens work.** Only on workspace-scoped routes (`/api/workspaces/:slug/...`). Profile, password, sessions, login,
  notifications, invitations and the workspace list/create/join/activate/leave routes answer `403` to a token, and the token
  and webhook routes reject tokens, so a leaked token cannot mint another token, add a webhook or change credentials.
- **Revoking.** People revoke their own tokens; owners with `settings:manage` can revoke any token of the workspace. Creating and
  revoking are written to the audit log (`token.created`, `token.revoked`), never the token itself.

### Outbound webhooks

- **Who.** Only `settings:manage`, never through an API token; at most 10 per workspace. Changes are audited
  (`webhook.created`, `webhook.updated`, `webhook.deleted`).
- **Secret.** `whsec_` plus 32 random characters, shown once on creation and on rotation. It is stored in the database (it is
  the HMAC key, so it cannot be hashed) but excluded from every query and response by default. Rotating invalidates the old one.
- **Signature.** Each request carries `X-TaskMan-Signature: sha256=<hex>`, the HMAC-SHA256 of the raw body keyed with the secret,
  plus `X-TaskMan-Event` and `X-TaskMan-Delivery` (also the `id` in the body, so receivers can ignore repeats). Receivers must
  compute the HMAC over the raw bytes and compare in constant time:

  ```js
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const ok = expected.length === header.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  ```

- **Delivery.** 5 second timeout, redirects are never followed, the response body is discarded. Any 2xx is success; a webhook that
  fails 20 times in a row is switched off. Deliveries (status, code, duration, request body without secrets) are kept 14 days.
- **SSRF rules.** In production only `https://` URLs on ports 80/443 without credentials are accepted (development also allows
  `http://` and ports 8080/3000, and any port on localhost for test receivers). The host name is resolved and refused when any
  address is loopback, private (10/8, 172.16/12, 192.168/16), link-local (169.254/16, including cloud metadata), CGNAT
  (100.64/10), multicast/reserved, or IPv6 unique-local/link-local/multicast, including IPv4-mapped, NAT64 and 6to4 forms. The
  same check runs as the socket `lookup`, so the address that was checked is the one connected to (no DNS rebinding gap).

## Operating notes

- Secrets live in the host's environment settings (Vercel), never in the repository. Rotate any credential that was
  ever committed.
- Back up MongoDB with Atlas scheduled snapshots (or `mongodump`) and test a restore regularly.
