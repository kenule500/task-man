# Security policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (GitHub → **Security → Report a vulnerability**),
not in public issues. Include the affected URL or endpoint, steps to reproduce and the impact you expect.
We acknowledge reports within 3 working days.

## What TaskMan does today

| Area | Measures |
|---|---|
| Authentication | bcrypt password hashes; JWT with a unique id per session, checked against a server-side session that can be revoked ("sign out other devices") |
| Tokens at rest | Session, email-verification, password-reset and invitation tokens are stored as SHA-256 hashes |
| Authorization | Every workspace route passes `requirePermission('<area>:<action>')`; role grants are capped by the granter's own access |
| Input | express-validator on every write; NoSQL operator injection rejected; request bodies limited to 100 kB |
| Abuse | Rate limits on authentication, sensitive actions and the whole API |
| Transport and browser | HTTPS with HSTS, strict Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` |
| Files | Upload type allow-list (no SVG/HTML), size limit, members-only downloads served as attachments |
| Audit | Append-only activity log (who, what, when, IP, device) for tasks, projects, sprints, members, invitations, settings and exports, kept 365 days; owners and admins can filter and export it |
| Data exposure | Users never serialize password or token hashes; public user fields only (name, avatar) on tasks |
| Supply chain | `pnpm audit --prod` gate in CI, Dependabot updates, CodeQL analysis; SonarQube configuration in `sonar-project.properties` |

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
