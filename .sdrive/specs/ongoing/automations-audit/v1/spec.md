> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Automation rules and the workspace audit trail

- **Feature:** `automations-audit`
- **Version:** v1
- **Status:** implemented (documented after the fact from `server/src` and `client/src`)

## Overview

### Problem

Teams repeated the same small task edits by hand — triaging bugs to high priority, clearing a
`blocked` label when work finishes, completing items that were reviewed — and had no durable,
reviewable record of who changed what. Without a rule engine the repetition never stops; without an
audit trail a workspace cannot answer "who moved this task and when" after a task has been renamed
or deleted.

### Solution

Everything hangs off one append-only log. `server/src/utils/activity.ts#recordActivity` stores an
`Activity` document (`server/src/models/activityModel.ts`) and then hands the entry to the
registered listeners. `server/src/utils/automation/register.ts` subscribes the rule engine, which
derives events from the recorded change list (`server/src/utils/automation/engine.ts#eventsFromActivity`),
matches them against the workspace's enabled rules (`server/src/models/automationModel.ts`) and
applies the planned actions in a single `Task.updateOne`.

Rules are managed through `server/src/controllers/automationController.ts` (router:
`server/src/routes/automationRoutes.ts`, mounted at `/api/workspaces/:slug/automations`). The trail is
read through `server/src/controllers/activityController.ts` at `/api/workspaces/:slug/activity`
(workspace log + CSV export, `settings:manage`) and `/api/workspaces/:slug/tasks/:id/activity`
(task history, `tasks:read`). The client ships the rule management screen
(`client/src/pages/AutomationsPage.tsx` + `client/src/features/automations`) and the log screen
(`client/src/pages/AuditLogPage.tsx` + `client/src/features/audit`).

### Target audience

Workspace owners and administrators who define and review rules and audit the workspace, plus every
member whose task changes are recorded in the trail.

### Assumptions

- Rules run inside the request that produced the change; there is no worker, queue or cron in this
  project (`.sdrive/context/architecture-context.md`), so a rule only fires while that request is
  alive. `assumption: true`
- Because the audit log stores the *number* of assignees, the `task.assigned` trigger treats a
  same-or-larger count as "someone was added" — stated in `engine.ts#eventsFromActivity` as a
  documented trade-off. `assumption: true`

### Out of scope

- Scheduled or time-based triggers ("every Friday", "stale for 3 days") — only the six
  `TRIGGER_TYPES` exist.
- Branching control flow inside a rule; actions apply in order to the same task.
- Export formats other than CSV, and retention beyond `ACTIVITY_RETENTION_DAYS` (365).

## User stories and acceptance criteria

### US-001 — Define automation rules for the workspace

- **Role:** workspace administrator
- **Want:** CRUD for "when … if … then …" rules, or a head start from a ready-made recipe
- **Benefit:** repetitive triage happens by itself and stays consistent

| AC | Acceptance criterion |
| --- | --- |
| AC-001 | `GET/POST/PATCH/DELETE /api/workspaces/:slug/automations` require `settings:manage`; a rule id from another workspace is a 404; rules are returned with trigger, conditions, actions, `runCount`, `lastRunAt` and creator. |
| AC-002 | A rule is refused with a readable message for an unknown trigger type, a trigger value not allowed for its type, an invalid field/operator pair, more than five conditions or actions, or a name that is empty or over 80 characters. |
| AC-003 | `GET /api/workspaces/:slug/automations/templates` returns the recipes in `server/src/utils/automation/templates.ts`, which the client copies into the builder. |

### US-002 — Have rules react to what happens in the workspace

- **Role:** workspace administrator
- **Want:** enabled rules to act on the tasks their trigger describes, honouring conditions
- **Benefit:** the board stays correct without anyone remembering the house rules

| AC | Acceptance criterion |
| --- | --- |
| AC-004 | Events come from the recorded change: `task.created` and `task.commented` map directly; a `task.updated` entry yields `task.status_changed`, `task.priority_changed`, `task.labeled` (only labels actually added) and `task.assigned` (same-or-larger assignee count). |
| AC-005 | A trigger matches by type and, when a value is set, by equality (case-insensitive) with the new status/priority or an added label; every condition must hold; a project-scoped rule only runs in its project; epics are skipped. |
| AC-006 | Actions are planned in order against a copy, then written with one update: status (with `completedAt` synced), priority, labels (capped by `MAX_LABELS`), assignments limited to members, sprint cleared for the backlog, comments pushed with the actor as author; `runCount` is incremented, `lastRunAt` set, and `automation.ran` + `task.updated` recorded. |
| AC-007 | Rules can start other rules, but a request runs at most `MAX_AUTOMATION_DEPTH` (3) levels deep and each `(rule, task)` pair fires at most once per request. |

### US-003 — See the history of a task

- **Role:** workspace member
- **Want:** a newest-first history of a task's changes
- **Benefit:** I understand how a task got here without asking around

| AC | Acceptance criterion |
| --- | --- |
| AC-008 | Every audited write appends one `Activity` entry with workspace, actor, action name, summary, task/project/sprint references, the change list and the request IP/user agent, truncated to model limits, and the write never fails the request. |
| AC-009 | `GET /api/workspaces/:slug/tasks/:id/activity` needs `tasks:read`, is a 404 when the task is not in the workspace, and returns at most 100 entries (default 50) newest first with `nextBefore`. |

### US-004 — Review the workspace audit log

- **Role:** workspace administrator
- **Want:** the whole log, filtered by area and actor, with the retention promise visible
- **Benefit:** I can investigate a change and answer compliance questions

| AC | Acceptance criterion |
| --- | --- |
| AC-010 | `GET /api/workspaces/:slug/activity` needs `settings:manage` and returns one page (default 50, max 100) with `nextBefore`, `retentionDays` and `areas`; `area` accepts only a known area and `actor` only a valid ObjectId, otherwise the filter is ignored. |

### US-005 — Export the audit log

- **Role:** workspace administrator
- **Want:** the filtered log as a CSV download
- **Benefit:** I can hand the record to an auditor or keep it past the retention window

| AC | Acceptance criterion |
| --- | --- |
| AC-011 | With `format=csv` the same endpoint returns up to 5000 rows as RFC 4180 CSV (every cell quoted, inner quotes doubled, leading `=`, `+`, `-`, `@`, tab or CR prefixed with an apostrophe), a UTF-8 BOM and a filename `audit-<slug>-<date>.csv`, and records the export as `audit.exported`. |
| AC-012 | The client log page keeps filters in the URL, groups by day, opens an entry in a sheet, pages older/newer, and downloads the CSV as a Blob. |

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Rules can be listed, created, updated and deleted per workspace by `settings:manage` holders, with a 25-rule workspace cap, a name of at most 80 characters and `createdBy`/`runCount`/`lastRunAt` metadata. |
| FR-002 | Trigger, condition and action input is validated against closed vocabularies (`utils/automation/validate.ts`): allowed operators per field, allowed values per trigger/action, ≤ 5 conditions, ≤ 5 actions, label values ≤ 40 and comments ≤ 500 characters. |
| FR-003 | A catalog of ready-made rule templates is served to the client. |
| FR-004 | Automation events are derived purely from an activity entry: creation and comments map directly, updates decompose into status, priority, newly added labels and assignments. |
| FR-005 | Trigger matching (including the optional narrowed value) and condition evaluation are pure functions over the event and a task snapshot; conditions are ANDed and a rule without conditions always matches. |
| FR-006 | Actions are planned purely against a copy of the task so later actions see earlier results; label adds are de-duplicated case-insensitively and respect `MAX_LABELS`; assignments are limited to current members. |
| FR-007 | A plan is written in one update with `completedAt` kept in sync, children moved out of the sprint when the task is sent to the backlog, counters updated, and `automation.ran` + `task.updated` recorded so the change can chain. |
| FR-008 | Activity entries are appended by every audited write path via `recordActivity`, using `formatChangeValue`, `diffFields` and `auditLookup` to build the change list; listeners are awaited in registration order. |
| FR-009 | A task's history is served to `tasks:read`, newest first, with a `before` cursor and a limit cap of 100. |
| FR-010 | The workspace log is served to `settings:manage` with `area`, `actor` and `before` filters, a limit cap of 100 and `retentionDays`/`areas` metadata. |
| FR-011 | The log exports as CSV (≤ 5000 matching rows) with RFC 4180 quoting, formula neutralisation, a BOM and a dated filename, and the export is itself recorded. |
| FR-012 | The client provides rule management (list with enable switch, builder with draft validation and templates, delete confirmation) and log review (URL filters, day grouping, entry sheet, older/newer paging, CSV download). |

## Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-001 | Rule and audit queries always filter by `req.workspace._id` and are gated by `settings:manage` (rules, templates, workspace log, export) or `tasks:read` (single task history). *(CON-106, CON-512)* |
| NFR-002 | Audit and automation work can never fail the user's request: `recordActivity` catches its own errors, listener failures are logged and skipped, and each rule runs in its own `try/catch`. *(CON-105)* |
| NFR-003 | The trail is bounded: 365-day TTL, summary ≤ 200, change values ≤ 200, page caps 50/100, export cap 5000 rows. |
| NFR-004 | Input that reaches a query is whitelisted or cast, never interpolated: only a known area name is used inside the anchored action regex, and the actor filter is applied only for a valid ObjectId. *(CON-516)* |

## Edge cases

| ID | Case | Expected behaviour |
| --- | --- | --- |
| EC-001 | An action assigns a user who is not (or no longer) a member. | `checkAssignees` refuses the rule on write; at run time `planActions` only assigns current member ids, so the action is skipped rather than adding a stranger. |
| EC-002 | Two rules react to each other's changes. | Depth 3 plus the per-request fired set stops the cycle and the request still answers normally. |
| EC-003 | One update changes several watched fields at once. | `eventsFromActivity` emits one event per change, so each matching rule type is evaluated in the same pass. |
| EC-004 | The referenced task, project or sprint was deleted, or a change has no before/after value. | The entry stays readable: the summary text lives on the entry and missing values render as `–` (CSV) or as described changes (entry sheet). |
| EC-005 | Export for a filter that matches nothing. | Header-only CSV (valid RFC 4180, with BOM) and the export is recorded with 0 entries. |

## Dependencies

| Name | Type | Notes |
| --- | --- | --- |
| `utils/activity.ts#onActivity` | internal | Shared listener registry; the engine registers through `registerAutomations()` in `server/src/app.ts`. |
| `utils/workflow.ts` | internal | Canonical status vocabulary (`TASK_STATUSES`) used by trigger/action validation and client labels. |
| `models/taskModel.ts` | internal | Field names, vocabularies and `MAX_LABELS` enforced while planning label actions. |
| Mongoose indexes | internal | Four compound `Activity` indexes plus the 365-day TTL index. |

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-001 | A self-triggering rule could multiply writes in one request. | Depth limit 3 and a per-request fired set keyed by rule + task (`register.ts`). |
| RISK-002 | Automation edits could look like user edits in the trail. | Automation writes `automation.ran` with the rule name and a `task.updated` entry naming the automation. |
| RISK-003 | A growing log could slow the workspace. | Purpose-built compound indexes, a TTL index, capped pages and a capped export. |

## Verification (retroactive)

| Test id | Test file | What it covers |
| --- | --- | --- |
| TEST-001 | `server/src/__tests__/automationEngine.test.ts` | Pure event derivation, trigger/condition matching, ordered action planning. |
| TEST-002 | `server/src/__tests__/activity.test.ts` | `formatChangeValue`, `diffFields`, and `recordActivity` behaviour including the never-throw path. |
| TEST-003 | `server/src/__integration__/automations.test.ts` | Access, CRUD, running rules (including chaining/member rules) and workspace isolation. |
| TEST-004 | `server/src/__integration__/activity.test.ts` | Task activity, the workspace audit log, area/actor filters and the CSV export. |
| TEST-005 | `client/src/features/automations/__tests__/draft.test.ts`, `describe.test.ts`, `components.test.tsx` | Draft validation, rule descriptions, builder/list/template rendering. |
| TEST-006 | `client/src/features/audit/__tests__/format.test.ts`, `client/src/pages/__tests__/AuditLogPage.test.tsx` | Entry formatting/grouping and the page with filters, paging and CSV download. |

Commands

```bash
pnpm --filter server test automationEngine activity        # TEST-001, TEST-002
pnpm --filter server test:integration automations activity # TEST-003, TEST-004
pnpm --filter client test features/automations             # TEST-005
pnpm --filter client test features/audit AuditLogPage       # TEST-006
```

> The test names in these files do not carry `AC-###` ids; the mapping above was produced by reading
> the tests during onboarding, so CON-405 remains an unmet convention rather than a verified claim.
