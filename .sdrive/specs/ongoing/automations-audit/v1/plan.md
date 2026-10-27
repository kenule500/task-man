> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Plan — Automation rules and the workspace audit trail

- **Feature:** `automations-audit`
- **Version:** v1
- **Machine-readable plan:** `.sdrive/governance/automations-audit/v1/plan.json`

## Architecture

**Approach.** One append-only activity log drives both halves of the feature. Every audited write
path ends in `recordActivity(req, input)` (`server/src/utils/activity.ts`), which stores an `Activity`
document and then hands the entry to the registered listeners. The automation engine is one such
listener: it turns the recorded change list into events with pure functions
(`server/src/utils/automation/engine.ts`), matches them against the workspace's enabled rules, plans
actions purely and applies them with one `Task.updateOne` — recording `automation.ran` and a
`task.updated` entry that can chain into further rules until the depth limit stops it. Reads are two
thin controllers: task history (`tasks:read`) and the workspace log (`settings:manage`) which also
produces the CSV export.

**Referenced requirements:** `FR-001`–`FR-012`, `NFR-001`–`NFR-004`.

### Components

| Component | Action | Role |
| --- | --- | --- |
| `server/src/models/activityModel.ts` | create | `Activity` schema, 48 action names, change sub-document, five indexes, 365-day TTL. |
| `server/src/models/automationModel.ts` | create | `Automation` schema with the closed trigger/condition/action vocabularies and caps. |
| `server/src/utils/activity.ts` | create | `recordActivity`, `formatChangeValue`, `diffFields`, `auditLookup`, listener registry. |
| `server/src/utils/automation/engine.ts` | create | Pure `eventsFromActivity`, `matchesTrigger`, `matchesConditions`, `planActions`. |
| `server/src/utils/automation/validate.ts` | create | `parseTrigger`, `parseConditions`, `parseActions`. |
| `server/src/utils/automation/register.ts` | create | Subscribes the engine, depth + fired-set guard, applies plans. |
| `server/src/utils/automation/templates.ts` | create | Seven ready-made recipes. |
| `server/src/controllers/automationController.ts` | create | Validation chains and rule CRUD (cap, member check, projection). |
| `server/src/controllers/activityController.ts` | create | Task history, workspace log, `toAuditCsv` and the CSV branch. |
| `server/src/routes/automationRoutes.ts` | create | `/api/workspaces/:slug/automations` behind `protect` + `settings:manage`. |
| `server/src/routes/workspaceRoutes.ts` | modify | Adds `GET /:slug/activity` and mounts the automations router. |
| `server/src/routes/taskRoutes.ts` | modify | Adds `GET /:id/activity`. |
| `server/src/app.ts` | modify | `registerAutomations()` at startup. |
| `client/src/features/automations/` | create | Rule API/hooks, options, draft validation, describes, builder/list/templates. |
| `client/src/features/audit/` | create | Log API/hooks, URL filters, formatting, table/sheet/pagination. |
| `client/src/pages/AutomationsPage.tsx` | create | Rule management screen. |
| `client/src/pages/AuditLogPage.tsx` | create | Log screen with filters, paging and CSV download. |

## Data model

### `Activity` (create)

`workspace` (→ Workspace), `actor` (→ User, nullable), `action` (enum of `ACTIVITY_ACTIONS`),
`summary` (≤ 200), `task`/`project`/`sprint` (nullable refs), `changes` (`{ field ≤ 40, from?, to? ≤ 200 }`),
`ip` (≤ 64), `userAgent` (≤ 200), `createdAt` (TTL 365 days).
Indexes: `workspace+createdAt`, `workspace+task+createdAt`, `workspace+actor+createdAt`,
`workspace+action+createdAt`, `createdAt` (TTL).

### `Automation` (create)

`workspace`, `name` (1..80), `enabled` (default true), `project` (≤ 60, `''` = every project),
`trigger` `{ type, to }`, `conditions` (`{ field, op, value }`, ≤ 5), `actions` (`{ type, value }`, 1..5),
`runCount` (min 0), `lastRunAt`, `createdBy`, timestamps.
Index: `(workspace, enabled, createdAt)`.

### `Task` (update; fields unchanged)

The engine writes `status`, `priority`, `labels`, `assignees`, `sprint`, `completedAt` and pushes
`comments`; all of these already exist on the task model. Field action is `no_change` — the plan
records that this feature is a writer of them, not their definition.

### Flow

`recordActivity` → `Activity.create` → listeners. The engine derives events, loads
`Automation.find({ workspace, enabled: true }).sort({ createdAt: 1 })`, re-reads the task per matching
rule, skips epics and project mismatches, evaluates conditions, plans actions, then applies one
`Task.updateOne` (with `$set`/`$unset` for `completedAt`), backlogs children when the sprint is
cleared, `$inc` `runCount`, sets `lastRunAt`, records `automation.ran` and `task.updated`.
Task history filters `{ workspace, task, createdAt < before }`; the workspace log adds
`action: /^area\./` and/or `actor`; the CSV branch records `audit.exported` before responding.

## API contracts

| Method | Path | Action | Auth | Requirements |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:slug/automations` | create | required (`settings:manage`) | FR-001, NFR-001 |
| GET | `/api/workspaces/:slug/automations/templates` | create | required (`settings:manage`) | FR-003, NFR-001 |
| POST | `/api/workspaces/:slug/automations` | create | required (`settings:manage`) | FR-001, FR-002 |
| PATCH | `/api/workspaces/:slug/automations/:id` | create | required (`settings:manage`) | FR-001, FR-002 |
| DELETE | `/api/workspaces/:slug/automations/:id` | create | required (`settings:manage`) | FR-001, NFR-001 |
| GET | `/api/workspaces/:slug/activity` | create | required (`settings:manage`) | FR-010, FR-011, NFR-004 |
| GET | `/api/workspaces/:slug/tasks/:id/activity` | create | required (`tasks:read`) | FR-009, NFR-001 |

Mounts: `server/src/routes/workspaceRoutes.ts:217` (`/:slug/activity`), `:237`
(`/:slug/automations`), `server/src/routes/taskRoutes.ts:75` (`/:id/activity`). Every route runs
`protect` first, then `requirePermission(...)`, which attaches `req.workspace`, `req.role` and
`req.permissions` (CON-512). The frontend calls these through `client/src/utils/api.ts` (CON-207).

## Security considerations

`plan.json → securityConsiderations`: permission gating and `req.workspace._id` scoping (CON-106,
CON-512); audit writes that can never fail the request (CON-105); retention/truncation bounds;
whitelisted area values and ObjectId-cast actor filter instead of interpolated input (CON-516).

## Performance considerations

`plan.json → performanceConsiderations`: `limit + 1` paging with narrow projections; compound indexes
matching the three filter shapes plus the TTL index; rules re-read the task only after a trigger
matched and stop at depth 3; the export is the single capped large query (5000 rows).

## Dependencies

`onActivity` listener registry, `utils/workflow.ts` vocabularies, `models/taskModel.ts` limits,
`express-validator` chains and Mongoose indexes — see `plan.json → dependencies`.

## Risks

Self-triggering rules (depth + fired set), automation edits framed as automation in the trail,
log growth (indexes, TTL, caps), assignment to non-members (checked on write and at run time), and
CSV formula injection (cell neutralisation). Details in `plan.json → risks`.
