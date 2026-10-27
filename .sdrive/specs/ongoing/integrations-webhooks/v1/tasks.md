> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Tasks — GitHub integration, outbound webhooks and personal API tokens

- **Feature:** `integrations-webhooks`
- **Version:** v1
- **Machine-readable tasks:** `.sdrive/governance/integrations-webhooks/v1/tasks.json`

Every task below is already implemented, so all boxes are checked. Requirements in brackets are the
`FR-###` / `NFR-###` ids from `.sdrive/governance/integrations-webhooks/v1/spec.json`.

## P1 — GitHub integration

- [x] **T1.1 — Store the GitHub integration on the workspace.** `integrations.github` (enabled, `select: false` secret, autoTransition, connectedAt) in `server/src/models/workspaceModel.ts`; raw-body parser mounted for `/api/integrations/github` before `express.json` in `server/src/app.ts`. _(FR-001, FR-002, NFR-004; AC-001, AC-004)_
- [x] **T1.2 — Write the pure GitHub event helpers.** `server/src/utils/githubEvents.ts`: `verifySignature`/`signBody`, `extractTaskKeys` with per-surface case rules and caps, `safeGithubUrl`, `TRANSITIONS`/`nextStatus`, payload-to-plan. _(FR-003; AC-005)_
- [x] **T1.3 — Build the webhook receiver.** `server/src/controllers/githubWebhookController.ts` + `server/src/routes/integrationRoutes.ts`: slug pattern, workspace lookup, decoy verification for unknown slugs, ping/ignored/400 answers, `upsertTaskLink`, `transitionTask` and the audited `task.updated` entry. _(FR-002, FR-004, NFR-001; AC-004, AC-006)_
- [x] **T1.4 — Expose the GitHub settings API.** `server/src/controllers/integrationController.ts` and the five workspace routes: view (`no-store`, secret only while enabled), enable, regenerate (409 when disabled), PATCH autoTransition, disable — each audited as `integration.updated`. _(FR-001, NFR-001, NFR-002; AC-001, AC-002, AC-003)_
- [x] **T1.5 — Cover the integration with integration tests.** `server/src/__integration__/github.test.ts`. _(FR-001…FR-004; AC-001, AC-004, AC-005, AC-006)_

## P2 — Outbound webhooks (depends on P1)

- [x] **T2.1 — Model webhooks and deliveries.** `server/src/models/webhookModel.ts` (secret `select: false`, caps 10/20) and `server/src/models/webhookDeliveryModel.ts` (8 KB body, 14-day TTL). _(FR-005, FR-007, NFR-002; AC-007, AC-010)_
- [x] **T2.2 — Write the payload and signature helpers.** `server/src/utils/webhooks/payload.ts`: `generateWebhookSecret`, `signBody`/`verifySignature`, `matchesEvent`, `buildPayload` with the byte budget. _(FR-007; AC-009)_
- [x] **T2.3 — Implement the SSRF guard.** `server/src/utils/webhooks/ssrf.ts`: `checkWebhookUrl`, `isBlockedAddress`, `resolvePublicAddresses`, production/development port sets. _(FR-008, NFR-003; AC-007, AC-009)_
- [x] **T2.4 — Implement signed delivery and its log.** `server/src/utils/webhooks/deliver.ts`: `sendWebhookRequest` (5 s timeout, guarded lookup, redirects disabled, body discarded) and `deliverToWebhook` (attempt log, failure counter, auto-disable). _(FR-007, NFR-003; AC-009, AC-010)_
- [x] **T2.5 — Dispatch recorded activity to webhooks.** `server/src/utils/webhooks/register.ts`: `payloadForActivity`, `dispatchActivity`, registered once via `registerWebhooks()`. _(FR-007; AC-009, AC-010)_
- [x] **T2.6 — Expose the webhook management API.** `server/src/controllers/webhookController.ts` + `server/src/routes/webhookRoutes.ts`: CRUD with cap and SSRF check, one-time secret, rotate, test, deliveries, redeliver, behind `protect` + `rejectApiToken` + `settings:manage`. _(FR-005, FR-006, NFR-001, NFR-002; AC-007, AC-008)_
- [x] **T2.7 — Cover signing, matching and the guard with unit tests.** `server/src/__tests__/webhooks.test.ts`. _(FR-003, FR-007, FR-008; AC-005, AC-009)_
- [x] **T2.8 — Cover webhook management with integration tests.** `server/src/__integration__/webhooks.test.ts`. _(FR-005…FR-008, NFR-001; AC-007…AC-010)_

## P3 — Personal API tokens (depends on P1)

- [x] **T3.1 — Model tokens and their generation.** `server/src/models/apiTokenModel.ts` + `server/src/utils/apiTokens.ts` (`tm_` + base62, keyed PBKDF2 digest, caps 10/365/60). _(FR-009, NFR-002; AC-011)_
- [x] **T3.2 — Authenticate tokens in protect.** `server/src/middleware/authMiddleware.ts`: digest lookup, workspace-route restriction, throttled `lastUsedAt`, `req.apiToken`, and `rejectApiToken`. _(FR-010, NFR-002; AC-012)_
- [x] **T3.3 — Bind tokens to a workspace and to their scopes.** `server/src/middleware/permissionMiddleware.ts`: workspace binding, scope refusal, `req.permissions` = role ∩ scopes. _(FR-010, NFR-001; AC-012)_
- [x] **T3.4 — Expose the token API.** `server/src/controllers/tokenController.ts` + `server/src/routes/tokenRoutes.ts`: list/create/revoke with the scope-subset check, activity entries, `protect` + `rejectApiToken` + `tasks:read`. _(FR-009, NFR-001; AC-011)_
- [x] **T3.5 — Cover the token lifecycle with tests.** `server/src/__tests__/apiTokens.test.ts`, `server/src/__integration__/apiTokens.test.ts`. _(FR-009, FR-010; AC-011, AC-012)_

## P4 — Client surfaces (depends on P2, P3)

- [x] **T4.1 — Build the developers feature module.** `client/src/features/developers`: api, hooks, `lib/catalog` (scopes, expiry, event groups), `lib/snippets`, dialogs, lists and sections. _(FR-011; AC-013, AC-014)_
- [x] **T4.2 — Add the developers page.** `client/src/pages/DevelopersPage.tsx` hosting `TokensSection` and `WebhooksSection`. _(FR-011, FR-009, FR-005; AC-013)_
- [x] **T4.3 — Build the GitHub integration card.** `client/src/features/integrations` + hosting in `client/src/pages/WorkspaceSettingsPage.tsx`. _(FR-012, FR-001; AC-013, AC-001)_
- [x] **T4.4 — Cover the client surfaces with tests.** `client/src/features/developers/__tests__/{components,lib}.test.tsx`, `client/src/features/integrations/__tests__/GitHubIntegrationCard.test.tsx`, `client/src/pages/__tests__/WorkspaceSettingsPage.test.tsx`. _(FR-011, FR-012; AC-013, AC-014)_

## Verification

```bash
pnpm --filter server test webhooks apiTokens
pnpm --filter server test:integration webhooks github apiTokens
pnpm --filter client test features/developers
pnpm --filter client test GitHubIntegrationCard WorkspaceSettingsPage
pnpm --filter server typecheck && pnpm --filter client typecheck && pnpm --filter client lint && pnpm --filter client build
```

Test-id legend: see `spec.md → Verification (retroactive)` (`TEST-001` … `TEST-007`).
