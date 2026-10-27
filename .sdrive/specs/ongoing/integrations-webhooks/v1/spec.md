> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# GitHub integration, outbound webhooks and personal API tokens

- **Feature:** `integrations-webhooks`
- **Version:** v1
- **Status:** implemented (documented after the fact from `server/src` and `client/src`)

## Overview

### Problem

TaskMan held the work but nothing else could see it: pull requests, commits and branches were not
connected to the tasks they implement, other tools had no way to be told what changed inside a
workspace, and scripts had no credential of their own. Each need requires the opposite direction of
trust — GitHub must call TaskMan without a login, TaskMan must call arbitrary third-party URLs, and
a machine credential must be narrower than the person who created it.

### Solution

Three cooperating surfaces:

1. **GitHub integration.** The per-workspace secret is stored on the workspace document and managed
   through `server/src/controllers/integrationController.ts` (view/enable/regenerate/autoTransition/disable).
   Deliveries arrive at the public `POST /api/integrations/github/:slug`
   (`server/src/controllers/githubWebhookController.ts`, `server/src/routes/integrationRoutes.ts`),
   are authenticated with an HMAC-SHA256 signature of the raw body, and become task links and
   status transitions through the pure helpers in `server/src/utils/githubEvents.ts`.
2. **Outbound webhooks.** `server/src/utils/webhooks/register.ts` subscribes to the existing
   activity stream and posts a signed JSON payload to each subscribed URL
   (`server/src/utils/webhooks/{payload,deliver}.ts`), logging every attempt in `WebhookDelivery`
   and switching a webhook off after repeated failures. Management lives in
   `server/src/controllers/webhookController.ts` / `server/src/routes/webhookRoutes.ts`.
3. **Personal API tokens.** Created and revoked through `server/src/controllers/tokenController.ts`
   (`server/src/utils/apiTokens.ts`, `server/src/models/apiTokenModel.ts`), presented as a bearer
   token, resolved by digest in `server/src/middleware/authMiddleware.ts` and narrowed to their
   scopes and workspace by `server/src/middleware/permissionMiddleware.ts`.

### Target audience

Workspace administrators wiring repositories and external tools to a workspace, integration
developers implementing the outbound webhook contract, and developers automating the API.

### Assumptions

- GitHub calls the receiver with a repository or organisation webhook that carries a shared secret;
  TaskMan only verifies the signature and never calls the GitHub API, so no GitHub token exists.
  `assumption: true`
- There is no retry scheduler: a failed delivery is logged, and re-sending it is a manual action
  through the redeliver endpoint and `client/src/features/developers/components/DeliveriesDialog.tsx`.
  `assumption: true`
- The client targets GitHub only; the card and its API are GitHub-specific
  (`client/src/features/integrations`). `assumption: true`

### Out of scope

- A GitHub App installation flow or any TaskMan → GitHub API call.
- Automatic retry with backoff for failed deliveries (manual redelivery only).
- OAuth-style third-party scopes; token scopes are the workspace permission keys.

## User stories and acceptance criteria

### US-001 — Connect a workspace to GitHub

- **Role:** workspace administrator
- **Want:** to enable the integration, copy the receiver URL and secret, regenerate the secret, choose
  whether deliveries may move statuses, and disable it
- **Benefit:** pull requests and commits appear on the right tasks without manual copying

| AC | Acceptance criterion |
| --- | --- |
| AC-001 | `GET /api/workspaces/:slug/integrations/github` needs `settings:manage` and returns `enabled`, `webhookUrl`, `autoTransition`, `connectedAt`, with `secret` only while enabled; every answer carries `Cache-Control: no-store`. |
| AC-002 | Enabling generates a 64-hex secret plus `connectedAt` and keeps an existing secret when already enabled; disabling forgets the secret and timestamp; regenerating replaces it and answers 409 when not enabled; each change records `integration.updated`. |
| AC-003 | `PATCH …/integrations/github` accepts only a boolean `autoTransition` and records a change (`from`/`to`) only when the value flips. |

### US-002 — Turn GitHub deliveries into task links

- **Role:** workspace administrator
- **Want:** pull request, push, branch and ping deliveries to link to the tasks they mention, and to
  move those tasks along when configured
- **Benefit:** the board reflects the repository without a human in the loop

| AC | Acceptance criterion |
| --- | --- |
| AC-004 | `POST /api/integrations/github/:slug` is public and authenticated only by `X-Hub-Signature-256`: a wrong signature is 401, an unknown or disabled slug is 404 *after the same verification work against a decoy secret*, invalid JSON is 400, `ping` is 200 `pong`, and an event with nothing to link is 202 `Ignored`. |
| AC-005 | Keys are extracted from titles/bodies/commit messages in upper case and from branch names case-insensitively (≤ 10 keys per text, ≤ 50 commits); only `https://github.com` URLs without credentials or an explicit port are stored; the transition table moves `pending → in-progress` (start) and `pending`/`in-progress → completed` (complete), never reopening a completed task. |
| AC-006 | A delivery upserts the link on each resolved task (merged is final; the task link cap is enforced) and, when `autoTransition` is on, applies the transition and records a `task.updated` activity entry attributed to GitHub with no actor; the response reports how many links were written. |

### US-003 — Subscribe external tools to workspace changes

- **Role:** workspace administrator
- **Want:** signed JSON posts for the events I choose, a delivery log, secret rotation and a test ping
- **Benefit:** other tools stay in step instead of being polled

| AC | Acceptance criterion |
| --- | --- |
| AC-007 | Webhook routes need `settings:manage` and `rejectApiToken`; a workspace holds ≤ 10 webhooks; name ≤ 60 and URL ≤ 2000 characters are required; the URL must pass the SSRF guard or the request answers 400 with the guard's reason. |
| AC-008 | A `whsec_` secret is generated on create and returned only there and after a rotation (never by list/update); rotating invalidates the old value immediately; a test ping is delivered and reported; the last 50 deliveries are listed newest first; a delivery can be re-sent with the same body and id and the next attempt number. |

### US-004 — Make delivery trustworthy for the receiver

- **Role:** integration developer
- **Want:** a signature to verify, a bounded request and a log of what happened
- **Benefit:** I can trust the payload and debug my receiver

| AC | Acceptance criterion |
| --- | --- |
| AC-009 | A delivery posts JSON with `Content-Type`, `User-Agent: TaskMan-Webhooks/1`, `X-TaskMan-Event`, `X-TaskMan-Delivery` and `X-TaskMan-Signature: sha256=<hex HMAC of the raw body>`; it times out after 5 s, never follows a redirect and discards the response body. |
| AC-010 | Every attempt is logged with status, response status, duration, error and the sent body (≤ 8 KB); success resets `failureCount` and refreshes `lastDeliveryAt`; failure increments it; a webhook is switched off at 20 consecutive failures; deliveries expire after 14 days. |

### US-005 — Automate the API with a personal token

- **Role:** workspace member
- **Want:** a token carrying only the scopes I choose, its prefix and last use visible, and revocation
- **Benefit:** scripts stop depending on my password or browser session

| AC | Acceptance criterion |
| --- | --- |
| AC-011 | `POST …/tokens` needs `tasks:read` and accepts a name (1..60), ≥ 1 scope that is a real permission key and a subset of the caller's own permissions (else 403), an optional expiry within 365 days, and at most 10 active tokens per user; the value is returned once, while storage keeps a display prefix and a keyed digest. |
| AC-012 | A token is accepted only on workspace routes and is bound to its workspace and scopes: another workspace or a missing scope is refused (403), and token/webhook routes refuse tokens entirely, so a leaked token cannot mint another. |

### US-006 — Manage all of it from the app

- **Role:** workspace administrator or developer
- **Want:** a developers screen and a GitHub card in workspace settings
- **Benefit:** no hand-crafted requests to configure the integration

| AC | Acceptance criterion |
| --- | --- |
| AC-013 | The developers page offers a token dialog (grouped grantable scopes, expiry options, one-time reveal + copy), a token list with prefix/scopes/expiry/last use/revoke, a webhook dialog (name, URL, event groups), a webhook list with active toggle, rotate, test, deliveries and redeliver, and the settings GitHub card drives enable, copy secret, autoTransition, regenerate, disable. |
| AC-014 | The event catalog lists every activity event grouped by area with labels, describes a selection as "All events" or a list, and the snippets panel shows a curl example and a Node snippet that verifies `X-TaskMan-Signature` against the raw body. |

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | GitHub settings are readable/changeable by `settings:manage`: view (secret only while enabled, `no-store`), enable (keeps an existing secret), disable (forgets it), regenerate, and PATCH `autoTransition`, each audited as `integration.updated`. |
| FR-002 | The public receiver authenticates by a constant-time HMAC over the raw body, spends the same work on a decoy secret for unknown/disabled slugs, and separates ping, unhandled events and malformed bodies by status code. |
| FR-003 | Deliveries are planned by pure helpers: per-surface key extraction, `https://github.com`-only URLs, and a transition table that never reopens a completed task. |
| FR-004 | A delivery applies its plan: links are upserted atomically (merged final, link cap enforced), transitions run only when `autoTransition` is on, and each transition is an audited `task.updated` entry attributed to GitHub. |
| FR-005 | Webhooks can be listed/created/updated/deleted by `settings:manage` holders (never through a token), with a 10-webhook cap and SSRF validation on create and on URL changes (which resets the failure counter). |
| FR-006 | A webhook secret can be rotated (returned once), a test ping delivered on demand, the last 50 deliveries listed, and a previous delivery re-sent with its stored body, id and next attempt number. |
| FR-007 | Outbound delivery signs the raw body, sets the event/delivery headers, uses a 5 s timeout with redirects disabled and the body discarded, logs every attempt with outcome and duration, maintains `failureCount` (auto-disable at 20) and expires deliveries after 14 days. |
| FR-008 | Target URLs are validated without network access (scheme, credentials, port per environment, blocked IP literals) and resolved addresses are classified so private/loopback/link-local/CGNAT/multicast/unique-local destinations are refused; development allows http on a short port list. |
| FR-009 | Tokens can be created (name, scopes within the caller's permissions, expiry ≤ 365 days or none, ≤ 10 active), listed with prefix/scopes/expiry/last use, and revoked by their owner or by a `settings:manage` holder. |
| FR-010 | A token is authenticated by format check plus keyed PBKDF2 digest lookup, restricted to workspace routes, bound to its workspace and scopes (effective permissions = role ∩ scopes), refreshes `lastUsedAt` at most once a minute, and is refused on token/webhook/account routes. |
| FR-011 | The client developers area provides the token and webhook sections, the scope/event catalogs and the curl + signature-verification snippets. |
| FR-012 | The workspace settings screen hosts the GitHub card reflecting the server view and driving enable/regenerate/autoTransition/disable. |

## Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-001 | Workspace surfaces are gated by `settings:manage`/`tasks:read` after `protect`, queries filter by `req.workspace._id`, and tokens are bound to one workspace and to their scopes. *(CON-106, CON-512)* |
| NFR-002 | Credentials are not recoverable: token values live only in the create answer, storage keeps a PBKDF2 digest (keyed by `API_TOKEN_PEPPER` or `JWT_SECRET`) plus an 8-character prefix, webhook/GitHub secrets are randomly generated and `select: false`, and secrets are never logged. *(CON-505, CON-519)* |
| NFR-003 | Outbound requests are guarded and bounded: SSRF rules before storing and before dialling, the socket uses the checked address, redirects are not followed, the response body is discarded, 5 s timeout, 8 KB stored body. |
| NFR-004 | Transport limits hold: the 1 MB raw parser is mounted only on the GitHub path before `express.json`, apiLimiter/Helmet/CORS stay in force, and every mutating route carries a validator chain. *(CON-513, CON-514, CON-515)* |

## Edge cases

| ID | Case | Expected behaviour |
| --- | --- | --- |
| EC-001 | A delivery for a slug that does not exist or whose integration is disabled. | The signature is verified against a decoy secret and the answer is a plain 404, so valid and invalid slugs are indistinguishable. |
| EC-002 | An unhandled event, or a handled event that mentions no task key. | 202 `Ignored`, nothing written, no activity entry. |
| EC-003 | A merged pull request later receives a reopened/updated delivery. | `upsertTaskLink` refuses to move a merged link back and `nextStatus` never reopens a completed task. |
| EC-004 | The receiver answers with a redirect. | Recorded as a failure with `Redirect (3xx) not followed`; the failure counter increases. |
| EC-005 | Receiver down for long, or the admin edits the URL, or re-enables a disabled webhook. | Auto-disabled after 20 consecutive failures; changing the URL or re-enabling resets `failureCount` to 0. |
| EC-006 | A token used against another workspace, or a scope the owner no longer has. | `requirePermission` refuses the other workspace (403) and the effective permissions are the intersection of the current role with the token scopes. |

## Dependencies

| Name | Type | Notes |
| --- | --- | --- |
| GitHub webhook deliveries | external | Requires `X-Hub-Signature-256` and the shared secret configured on the GitHub side. |
| Node `crypto` | library | HMAC-SHA256, `timingSafeEqual`, PBKDF2-SHA256, `randomBytes`. |
| Node `dns`/`net`/`http(s)` | library | Address resolution and the guarded outbound POST. |
| `utils/activity.ts#onActivity` | internal | The dispatcher subscribes via `registerWebhooks()` in `server/src/app.ts`. |
| `config/env.ts` | internal | `clientUrl`/`isProduction` for receiver URLs and payload links. |

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-001 | SSRF through a webhook URL (including a hostname that resolves internally, or a redirect). | Static rules + address classification, the socket lookup pinned to approved addresses, redirects treated as failures. |
| RISK-002 | A leaked or over-scoped token. | Digest-only storage, workspace binding, permissions intersected with scopes, `rejectApiToken` on credential routes, 10-token cap, ≤ 365-day lifetime. |
| RISK-003 | Delivery storms from noisy workspaces or a dead receiver. | Per-webhook event selection, 10-webhook cap, 5 s timeout, 14-day log retention, auto-disable at 20 failures. |
| RISK-004 | The receiver is public. | Constant-time signature check before parsing; 401 on a bad signature, 400 on malformed JSON, only tasks of the matching workspace are touched. |

## Verification (retroactive)

| Test id | Test file | What it covers |
| --- | --- | --- |
| TEST-001 | `server/src/__tests__/webhooks.test.ts` | Signing/verification, event matching, payload trimming, `isBlockedAddress` classification, `checkWebhookUrl` and target validation. |
| TEST-002 | `server/src/__tests__/apiTokens.test.ts` | Token generation, digesting, format/scope/expiry helpers. |
| TEST-003 | `server/src/__integration__/webhooks.test.ts` | Access, create/manage (cap, one-time secret, rotate, test), delivery to a local receiver, failure counting, SSRF guard. |
| TEST-004 | `server/src/__integration__/github.test.ts` | GitHub settings API, webhook authentication (signature and slug probing) and linking/transitions. |
| TEST-005 | `server/src/__integration__/apiTokens.test.ts` | Token create/list/revoke, scope enforcement, workspace binding, `rejectApiToken`. |
| TEST-006 | `client/src/features/developers/__tests__/components.test.tsx`, `lib.test.ts` | Token/webhook sections and dialogs, catalog grouping, event/scope helpers, snippets. |
| TEST-007 | `client/src/features/integrations/__tests__/GitHubIntegrationCard.test.tsx`, `client/src/pages/__tests__/WorkspaceSettingsPage.test.tsx` | GitHub card states and the settings page hosting it. |

Commands

```bash
pnpm --filter server test webhooks apiTokens                     # TEST-001, TEST-002
pnpm --filter server test:integration webhooks github apiTokens  # TEST-003, TEST-004, TEST-005
pnpm --filter client test features/developers                     # TEST-006
pnpm --filter client test GitHubIntegrationCard WorkspaceSettingsPage  # TEST-007
```

> The existing test names do not carry `AC-###` ids; the mapping above comes from reading the tests
> during onboarding, so CON-405 stays an unmet convention rather than a verified claim.
