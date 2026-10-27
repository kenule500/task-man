> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Plan — GitHub integration, outbound webhooks and personal API tokens

- **Feature:** `integrations-webhooks`
- **Version:** v1
- **Machine-readable plan:** `.sdrive/governance/integrations-webhooks/v1/plan.json`

## Architecture

**Approach.** Three surfaces share one pattern: a credential is verified before any work happens, and
a per-workspace scope decides what the caller may touch.

- **Inbound** — GitHub posts to a public receiver; the raw body is HMAC-verified before it is parsed,
  the delivery is planned by pure helpers and then applied to the workspace's tasks.
- **Outbound** — the feature subscribes to the existing activity stream (a second listener on
  `server/src/utils/activity.ts#onActivity`) and posts a signed JSON payload to each subscribed URL,
  logging every attempt.
- **Machines** — personal API tokens are presented as bearer tokens and resolved in `protect()` to
  their owner; `requirePermission` then narrows the effective permissions to the intersection of the
  workspace role and the token scopes, and refuses another workspace.

**Referenced requirements:** `FR-001`–`FR-012`, `NFR-001`–`NFR-004`.

### Components

| Component | Action | Role |
| --- | --- | --- |
| `server/src/controllers/integrationController.ts` | create | GitHub settings view/enable/regenerate/PATCH/disable, `no-store`, audited. |
| `server/src/controllers/githubWebhookController.ts` | create | Public receiver: decoy-verified signature, plan application, audited transitions. |
| `server/src/utils/githubEvents.ts` | create | Pure key extraction, URL sanitisation, transition table, plan builder. |
| `server/src/routes/integrationRoutes.ts` | create | `POST /github/:slug` (public by design). |
| `server/src/models/webhookModel.ts` | create | Webhook schema, `select: false` secret, caps 10/20. |
| `server/src/models/webhookDeliveryModel.ts` | create | Delivery log with a 14-day TTL and 8 KB body cap. |
| `server/src/utils/webhooks/payload.ts` | create | Secret generation, signing/verification, event matching, byte-budgeted payload. |
| `server/src/utils/webhooks/ssrf.ts` | create | URL rules and IPv4/IPv6 address classification. |
| `server/src/utils/webhooks/deliver.ts` | create | One guarded POST, delivery logging, failure counter, auto-disable. |
| `server/src/utils/webhooks/register.ts` | create | Activity → payload → per-webhook dispatch. |
| `server/src/controllers/webhookController.ts` | create | CRUD, rotate, test, deliveries, redeliver. |
| `server/src/routes/webhookRoutes.ts` | create | `protect` + `rejectApiToken` + `settings:manage`. |
| `server/src/models/apiTokenModel.ts` | create | Token schema (digest `select: false`, prefix, scopes, expiry, revocation). |
| `server/src/utils/apiTokens.ts` | create | Generation, PBKDF2 digest, format/scope/expiry helpers, caps. |
| `server/src/controllers/tokenController.ts` | create | List/create/revoke with the scope-subset check and activity. |
| `server/src/routes/tokenRoutes.ts` | create | `protect` + `rejectApiToken` + `tasks:read`. |
| `server/src/middleware/authMiddleware.ts` | modify | Token authentication in `protect`, `lastUsedAt` throttle, `rejectApiToken`. |
| `server/src/middleware/permissionMiddleware.ts` | modify | Workspace binding + scope intersection. |
| `server/src/models/workspaceModel.ts` | modify | `integrations.github` block. |
| `server/src/app.ts` | modify | Raw parser on the GitHub path, integration router, `registerWebhooks()`. |
| `server/src/routes/workspaceRoutes.ts` | modify | GitHub settings routes; webhook and token router mounts. |
| `client/src/features/developers/` | create | Tokens/webhooks UI, catalogs, snippets. |
| `client/src/features/integrations/` | create | `GitHubIntegrationCard` + api. |
| `client/src/pages/DevelopersPage.tsx` | create | Hosts both sections. |
| `client/src/pages/WorkspaceSettingsPage.tsx` | modify | Hosts the GitHub card. |

## Data model

### `Webhook` (create) / `WebhookDelivery` (create)

`Webhook`: `workspace`, `name` (1..60), `url` (≤ 2000, SSRF-checked), `secret` (`select: false`,
`whsec_…`), `events` (`'*'` or activity names), `active`, `createdBy`, `lastDeliveryAt`,
`failureCount`; index `(workspace, active)`.
`WebhookDelivery`: `webhook`, `workspace`, `event` (≤ 60), `deliveryId` (uuid), `status`
(`success|failed`), `attempt` (≥ 1), `responseStatus`, `durationMs`, `error` (≤ 300),
`requestBody` (≤ 8192), `createdAt` (TTL 14 days); indexes `(webhook, createdAt)`,
`(webhook, deliveryId)`.

### `ApiToken` (create)

`workspace`, `user`, `name` (1..60), `prefix` (≤ 12), `tokenHash` (unique, `select: false`,
PBKDF2-SHA256 digest), `scopes` (permission keys), `expiresAt`, `lastUsedAt`, `revokedAt`;
index `(workspace, user, createdAt)`.

### `Workspace` (update)

`integrations.github.enabled`, `.secret` (64 hex, `select: false`), `.autoTransition`
(default true), `.connectedAt`.

### `Task` (update; fields unchanged)

`links` (`MAX_TASK_LINKS` cap, merged final), `status` (transitions only) and `completedAt`
(set by a completing transition) — all pre-existing fields this feature writes.

### Flow

Inbound → signature check → `planGithubEvent` → `resolveTasks` (numbers + project keys) →
`upsertTaskLink` (refresh-or-push in two atomic updates) → optional `transitionTask` (+ audited
`task.updated` without actor). Outbound → activity entry → `dispatchActivity` → active webhooks with
secrets → per-webhook `deliverToWebhook`. Tokens → create generates `tm_` + 40 base62 chars, stores
prefix + digest, returns the value once → later requests resolve the digest and `permissionMiddleware`
intersects scopes.

## API contracts

| Method | Path | Action | Auth | Requirements |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:slug/integrations/github` | create | required (`settings:manage`) | FR-001, FR-012, NFR-001 |
| POST | `/api/workspaces/:slug/integrations/github/enable` | create | required (`settings:manage`) | FR-001, NFR-001 |
| POST | `/api/workspaces/:slug/integrations/github/regenerate-secret` | create | required (`settings:manage`) | FR-001, NFR-002 |
| POST | `/api/workspaces/:slug/integrations/github/disable` | create | required (`settings:manage`) | FR-001, NFR-002 |
| PATCH | `/api/workspaces/:slug/integrations/github` | create | required (`settings:manage`) | FR-001 |
| POST | `/api/integrations/github/:slug` | create | **not required** — called by GitHub, authenticated by HMAC signature | FR-002, FR-003, FR-004, NFR-004 |
| GET | `/api/workspaces/:slug/webhooks` | create | required (`settings:manage`, token refused) | FR-005, NFR-001 |
| POST | `/api/workspaces/:slug/webhooks` | create | required (`settings:manage`, token refused) | FR-005, FR-008, NFR-002 |
| PATCH | `/api/workspaces/:slug/webhooks/:id` | create | required (`settings:manage`, token refused) | FR-005, FR-008 |
| DELETE | `/api/workspaces/:slug/webhooks/:id` | create | required (`settings:manage`, token refused) | FR-005 |
| POST | `/api/workspaces/:slug/webhooks/:id/rotate-secret` | create | required (`settings:manage`, token refused) | FR-006, NFR-002 |
| POST | `/api/workspaces/:slug/webhooks/:id/test` | create | required (`settings:manage`, token refused) | FR-006, FR-007 |
| GET | `/api/workspaces/:slug/webhooks/:id/deliveries` | create | required (`settings:manage`, token refused) | FR-006, FR-007 |
| POST | `/api/workspaces/:slug/webhooks/:id/deliveries/:deliveryId/redeliver` | create | required (`settings:manage`, token refused) | FR-006 |
| GET | `/api/workspaces/:slug/tokens` | create | required (`tasks:read`, token refused) | FR-009 |
| POST | `/api/workspaces/:slug/tokens` | create | required (`tasks:read`, token refused) | FR-009, NFR-002 |
| DELETE | `/api/workspaces/:slug/tokens/:id` | create | required (`tasks:read`, token refused) | FR-009 |

Mount points: `server/src/app.ts:81` (raw parser), `:181` (`/api/integrations`),
`server/src/routes/workspaceRoutes.ts:126-133` (GitHub), `:241-242` (webhooks, tokens).
The only endpoint called by an external system rather than by a logged-in user is
`POST /api/integrations/github/:slug`; it is deliberately public and relies on the signature.

## Security considerations

`plan.json → securityConsiderations`: permission gating plus `rejectApiToken` and workspace/scope
binding for tokens (CON-106, CON-512); digest-only token storage and `select: false` secrets
(CON-505, CON-519); the SSRF guard with an address-pinned socket lookup (NFR-003); the isolated raw
parser, rate limiters and validator chains (CON-513, CON-514, CON-515).

## Performance considerations

`plan.json → performanceConsiderations`: parallel, 5 s-capped deliveries; bounded lists (10 webhooks,
10 active tokens, 50 deliveries) served by their indexes; PBKDF2 cost documented as a deliberate
trade-off; `lastUsedAt` written at most once a minute.

## Dependencies

`express.raw`, `node:crypto`, `node:dns|net|http|https`, `onActivity`, `API_TOKEN_PEPPER`/`JWT_SECRET`
and the GitHub webhook secret configured by the administrator — see `plan.json → dependencies`.

## Risks

SSRF via URL/hostname/redirect; a leaked or over-scoped token; delivery storms; a public receiver.
Mitigations in `plan.json → risks`.
