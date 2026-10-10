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
