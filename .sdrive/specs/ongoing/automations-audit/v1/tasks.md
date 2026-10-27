> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Tasks — Automation rules and the workspace audit trail

- **Feature:** `automations-audit`
- **Version:** v1
- **Machine-readable tasks:** `.sdrive/governance/automations-audit/v1/tasks.json`

Every task below is already implemented, so all boxes are checked. Requirements in brackets are the
`FR-###` / `NFR-###` ids from `.sdrive/governance/automations-audit/v1/spec.json`.

## P1 — Activity log and rule engine

- [x] **T1.1 — Model the activity log.** `server/src/models/activityModel.ts`: `ACTIVITY_ACTIONS`, references, change sub-document limits, four compound indexes, 365-day TTL, `MAX_CHANGE_VALUE`. _(FR-008, NFR-003; AC-008, AC-010)_
- [x] **T1.2 — Implement recordActivity and its pure helpers.** `server/src/utils/activity.ts`: `formatChangeValue`, `diffFields`, `auditLookup`, `onActivity`, `recordActivity` (truncates, never throws). _(FR-008, NFR-002; AC-008)_
- [x] **T1.3 — Model automation rules.** `server/src/models/automationModel.ts`: trigger/condition/action vocabularies, caps (25 rules, name 80, 5 conditions, 5 actions, value 40, comment 500), `(workspace, enabled, createdAt)` index. _(FR-001, FR-002; AC-001, AC-002)_
- [x] **T1.4 — Write the pure rule engine.** `server/src/utils/automation/engine.ts`: `eventsFromActivity`, `matchesTrigger`, `matchesConditions`, `planActions` (ordered, `MAX_LABELS`, member-only assignment, audit-shaped change list). _(FR-004, FR-005, FR-006; AC-004, AC-005, AC-006)_
- [x] **T1.5 — Validate rule input.** `server/src/utils/automation/validate.ts`: `parseTrigger`, `parseConditions`, `parseActions`. _(FR-002; AC-002)_
- [x] **T1.6 — Run rules from the activity stream.** `server/src/utils/automation/register.ts`: single subscription, `MAX_AUTOMATION_DEPTH` + fired set, per-rule task re-read, epic/project skip, single update, `completedAt` sync, child backlogging, `automation.ran` + `task.updated`. _(FR-007, NFR-002; AC-006, AC-007)_
- [x] **T1.7 — Add the rule template catalog.** `server/src/utils/automation/templates.ts` with the seven recipes. _(FR-003; AC-003)_
- [x] **T1.8 — Cover the engine and the log with unit tests.** `server/src/__tests__/automationEngine.test.ts`, `server/src/__tests__/activity.test.ts`. _(FR-004, FR-005, FR-006, FR-008; AC-004, AC-005, AC-006, AC-008)_

## P2 — Rule API (depends on P1)

- [x] **T2.1 — Implement the automation controller.** `server/src/controllers/automationController.ts`: validation chains, `present()`, workspace cap, `checkAssignees`, list/templates/create/update/delete, activity recording. _(FR-001, FR-002, FR-003; AC-001, AC-002, AC-003)_
- [x] **T2.2 — Declare the automation routes.** `server/src/routes/automationRoutes.ts` (templates before `/:id`) with `protect` + `settings:manage`, mounted at `/:slug/automations` in `server/src/routes/workspaceRoutes.ts`. _(FR-001, NFR-001; AC-001)_

## P3 — Audit API (depends on P1)

- [x] **T3.1 — Serve task history and the workspace log.** `server/src/controllers/activityController.ts`: `getTaskActivity` (`tasks:read`), `getWorkspaceActivity` (`settings:manage`, area/actor/before, `retentionDays`, `areas`), cursor paging with `limit + 1`. _(FR-009, FR-010, NFR-001, NFR-004; AC-009, AC-010)_
- [x] **T3.2 — Add the CSV export.** `toAuditCsv` (quoting, doubled quotes, formula neutralisation), `format=csv` branch with the 5000-row cap, BOM, dated filename and the `audit.exported` entry. _(FR-011, NFR-003, NFR-004; AC-011)_
- [x] **T3.3 — Mount the audit routes.** `GET /:slug/activity` in `workspaceRoutes.ts`, `GET /:id/activity` in `taskRoutes.ts`. _(FR-009, FR-010, NFR-001; AC-009, AC-010)_
- [x] **T3.4 — Cover rules and the log with integration tests.** `server/src/__integration__/automations.test.ts`, `server/src/__integration__/activity.test.ts`. _(FR-001, FR-007, FR-008, FR-009, FR-010, FR-011, NFR-001; AC-001, AC-006, AC-009, AC-010, AC-011)_

## P4 — Client surfaces (depends on P2, P3)

- [x] **T4.1 — Build the automations feature module.** `client/src/features/automations`: api, `useAutomations`, `lib/options`, `lib/draft` (`validateDraft`, `toInput`), `lib/describe`, `RuleBuilder`/`RuleList`/`RuleSwitch`/`TemplateGallery`. _(FR-012, FR-002; AC-002, AC-003)_
- [x] **T4.2 — Add the automations page.** `client/src/pages/AutomationsPage.tsx`: list with descriptions, enable toggle, delete with confirmation, builder and template gallery. _(FR-012; AC-012)_
- [x] **T4.3 — Build the audit feature module.** `client/src/features/audit`: api (`exportCsv`, `downloadBlob`), `useAuditLog`, `lib/filters`, `lib/format` (labels, change descriptions, day grouping, entry links) and the table/list/filter-bar/sheet/pagination/skeleton components. _(FR-010, FR-012; AC-010, AC-012)_
- [x] **T4.4 — Add the audit log page with CSV download.** `client/src/pages/AuditLogPage.tsx`: URL-persisted filters, day grouping, entry sheet, older/newer paging, Blob download, phone layout via `useIsPhone`. _(FR-011, FR-012; AC-011, AC-012)_

## Verification

```bash
pnpm --filter server test automationEngine activity
pnpm --filter server test:integration automations activity
pnpm --filter client test features/automations
pnpm --filter client test features/audit AuditLogPage
pnpm --filter server typecheck && pnpm --filter client typecheck && pnpm --filter client lint && pnpm --filter client build
```

Test-id legend: see `spec.md → Verification (retroactive)` (`TEST-001` … `TEST-006`).
