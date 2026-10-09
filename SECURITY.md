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

## Operating notes

- Secrets live in the host's environment settings (Vercel), never in the repository. Rotate any credential that was
  ever committed.
- Back up MongoDB with Atlas scheduled snapshots (or `mongodump`) and test a restore regularly.
