> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# custom-fields-workflow — technical plan

| | |
|---|---|
| Feature | `custom-fields-workflow` |
| Version | 1 |
| Governance | `.sdrive/governance/custom-fields-workflow/v1/plan.json` |

> **How to read `action`** — retroactive plan: `create` = this feature owns (and introduced) the file, `modify` = the feature changed an
> existing file, `reuse` = the feature depends on it without owning it. `assumption: true` — no feature-level commit history exists to prove
> which change introduced which line.

## 1. Approach

**Two definitions, one rule set, mirrored on both sides.**

- **Custom fields.** A `CustomField` document per workspace with an immutable slug key (`server/src/models/customFieldModel.ts`). The whole
  rule set is pure (`server/src/utils/customFields.ts`): `coerceFieldValue` per type, `planCustomValues` (merge semantics, required on create,
  archived fields, unknown keys), `slugFromName`, `describeCustomChanges`. `customFieldsDb.planRequestCustom` loads the definitions for a
  workspace and validates a request against them; `task.custom[key]` is where the value lands.
- **Workflow stages.** The stage list lives on the workspace document (`workflow.stages`) and is validated by `server/src/utils/workflow.ts`:
  every stage belongs to one of the three canonical status groups (CON-108), and `stageFor` resolves `stage` + `status` together on every task
  write. Removing a stage plans where its tasks go before anything is saved (`planStageMoves`); a group keeps at least one stage.

Both definitions are workspace scoped in every query (CON-106) and read through `requirePermission` (CON-105): `tasks:read` to read,
`settings:manage` to change. Cascading effects (clearing a removed option, deleting a field, moving tasks off a removed stage) happen inside the
same request, so a caller never has to clean up afterwards.

**Client.** `features/fields` and `features/workflow` each keep one cache per workspace behind `useSyncExternalStore`, so a change saved in the
settings pages reaches every view on screen without a refetch. The pure rules are mirrored (`fields/lib/fields.ts`, `fields/lib/fieldFilters.ts`,
`workflow/lib/stages.ts`) so the form can validate before saving, and the API message is still shown when the server disagrees.

## 2. Components

| Path | Action | Notes |
|---|---|---|
| `server/src/models/customFieldModel.ts` | create | Key, name, type, options, projects, required, order, archived; the eight types, the palette and the caps. |
| `server/src/utils/customFields.ts` | create | `fieldPath`, `fieldAppliesTo`, `coerceFieldValue`, `planCustomValues`, `plainCustom`, `describeCustomChanges`, `slugFromName`, `newOptionId`. |
| `server/src/utils/customFieldsDb.ts` | create | `loadFieldDefs`, `planRequestCustom`. |
| `server/src/controllers/customFieldController.ts` | create | `listFields`, `createField`, `updateField` (+ `clearRemovedOptions`), `reorderFields`, `deleteField` and the validation chains. |
| `server/src/routes/fieldRoutes.ts` | create | `/api/workspaces/:slug/fields`, `tasks:read` to list, `settings:manage` to change, `/order` before `/:id`. |
| `server/src/utils/workflow.ts` | create | `defaultWorkflow`, `validateWorkflow`, `firstStageOf`, `stageFor`, `workflowOf`, `planStageMoves`, `UNKNOWN_STAGE_MESSAGE`. |
| `server/src/controllers/workflowController.ts` | create | `getWorkflow`, `updateWorkflow` (validation, moves, status/`completedAt` resync, stale-stage reset, audit diff). |
| `server/src/routes/workflowRoutes.ts` | create | `/api/workspaces/:slug/workflow`: `tasks:read` to read, `settings:manage` to replace. |
| `server/src/models/workspaceModel.ts` | modify | Adds `workflow.stages` next to the legacy `boardSettings.wipLimits`. |
| `server/src/models/taskModel.ts` | modify | Adds `stage` and the `custom` map. |
| `server/src/controllers/taskController.ts` | reuse | Applies `stageFor`, calls `planRequestCustom`, audits `custom.<key>` changes and rejects an unknown stage. |
| `server/src/utils/taskQuery.ts` | reuse | Parses `cf.<key>` into the list filter (≤5). |
| `server/src/controllers/boardSettingsController.ts` | reuse | The legacy per-status limits `workflowOf` still honours. |
| `server/src/utils/activity.ts` | reuse | `field.created`/`field.updated`/`field.deleted`, `workflow.updated` audit entries. |
| `client/src/features/fields/{types,api}.ts` | create | Field shapes and the five endpoints. |
| `client/src/features/fields/lib/fields.ts` | create | Mirror of the server rules (applicability, value text, `diffCustom`, `createCustom`, `missingRequired`, `validateFieldDraft`, `optionsPayload`). |
| `client/src/features/fields/lib/fieldFilters.ts` | create | `filterableFields`, `filterOptions`, `withCustomFilter`, `canAddCustomFilter`. |
| `client/src/features/fields/hooks/useCustomFields.ts` | create | Per-workspace cache with `create`/`update`/`remove`/`reorder`. |
| `client/src/features/fields/hooks/useFieldMembers.ts` | create | Members for the user fields. |
| `client/src/features/fields/components/*.tsx` | create | `CustomFieldInput`, `CustomFieldValue`, `TaskCustomFields`, `TaskFormCustomFields`, `TaskCustomChips`, `FieldDialog`, `FieldListItem`. |
| `client/src/features/workflow/{types,api}.ts` | create | Stage shapes and `GET`/`PUT` on the workflow endpoint. |
| `client/src/features/workflow/lib/stages.ts` | create | Mirror of the server rules (`resolveStage`, `groupByStage`, `quickMoveFor`, `stagePatch`, `validateStages`, `stageKeyFor`). |
| `client/src/features/workflow/hooks/useWorkflow.ts` | create | Per-workspace cache, `save`, `cachedWorkflow`. |
| `client/src/features/workflow/components/*.tsx` | create | `StageBadges`, `StageRow`, `BoardPreview`, `DeleteStageDialog`. |
| `client/src/pages/CustomFieldsPage.tsx` | create | Field administration with reorder, archive and a delete confirmation that warns about the values. |
| `client/src/pages/WorkflowSettingsPage.tsx` | create | Stage editor with a preview, limits and save. |
| `client/src/features/tasks/lib/listColumns.ts` | reuse | One column per active field; sorting by a number or date column. |
| `client/src/features/tasks/lib/filters.ts` | reuse | `matchesCustom` and the `cf.<key>` URL parameters. |
| `client/src/features/tasks/views/BoardView.tsx` | reuse | Renders the stage columns and sends the stage patch. |
| `client/src/features/tasks/components/TaskSelects.tsx` | reuse | Status selects grouped by status group with stage names. |
| `server/src/utils/flow/register.ts` | reuse | Records the status transition a stage change causes (registered in `app.ts`). |

## 3. Data model

| Entity | Action | Notes |
|---|---|---|
| `CustomField` | create | `workspace`, `key` (unique per workspace, immutable), `name` (≤40), `type`, `options` (≤30, id/label/colour), `projects` (≤50), `required`, `order`, `archived` (≤30 not archived per workspace). |
| `Task` | update | `stage` (workflow stage key, ≤30) and `custom` (`Map<string, mixed>` keyed by field key) were added. |
| `Workspace` | update | `workflow.stages` (1–12, one stage per group at least); `boardSettings.wipLimits` unchanged but still honoured. |
| `StatusTransition` | no_change | Written by the flow tracking hook, not by this feature; the feature's status changes feed it. |

### Flow

**Field definition** → `validateCreateField`/`validateUpdateField` → controller slugs the key and enforces the 30-active cap → `CustomField`
document saved + audited → removing an option or deleting a field runs `updateMany` with the `custom.<key>` path over the workspace's tasks.

**Task value** → `planRequestCustom(workspace, body.custom, mode, project)` → `planCustomValues` (applicable fields, coercion, required on
create, merge) → `task.set('custom.<key>', …)` or `task.custom.delete(key)` → `describeCustomChanges` writes `custom.<key>` audit entries with
option labels.

**Stage change** → `PUT /workflow` → `validateWorkflow` → `planStageMoves` → tasks of removed stages and of stages that changed group are
updated (status + `completedAt`), stale stages reset, legacy limits cleared, diff audited → `GET /workflow` returns the stored list (or the
default) and the client cache is replaced by the server's answer.

## 4. API contracts

All routes are mounted under `/api/workspaces/:slug` (`server/src/routes/workspaceRoutes.ts`) and require authentication.

| Method | Path | Permission | Requirement |
|---|---|---|---|
| GET | `/api/workspaces/:slug/fields` | `tasks:read` | FR-001, NFR-001 |
| POST | `/api/workspaces/:slug/fields` | `settings:manage` | FR-002, NFR-004 |
| PUT | `/api/workspaces/:slug/fields/order` | `settings:manage` | FR-004, NFR-001 |
| PATCH | `/api/workspaces/:slug/fields/:id` | `settings:manage` | FR-003, NFR-004 |
| DELETE | `/api/workspaces/:slug/fields/:id` | `settings:manage` | FR-005, NFR-001 |
| GET | `/api/workspaces/:slug/workflow` | `tasks:read` | FR-008, NFR-002 |
| PUT | `/api/workspaces/:slug/workflow` | `settings:manage` | FR-009, NFR-002, NFR-004 |
| GET / PUT | `/api/workspaces/:slug/board-settings` | `tasks:read` / `settings:manage` | FR-008 (legacy limits) |
| GET | `/api/workspaces/:slug/tasks` | `tasks:read` | FR-007 |
| POST / PATCH | `/api/workspaces/:slug/tasks[/:id]` | `tasks:write` | FR-006, FR-010 |
| PATCH | `/api/workspaces/:slug/tasks/bulk` | `tasks:write` | FR-010 |

## 5. Security, performance, dependencies and risks

- **Security** — every definition and value query is workspace scoped (NFR-001); `reorderFields` verifies each id belongs to the workspace, and
  `buildTaskFilter` only writes `custom.<key>` paths whose key matched the slug pattern, so a request cannot address foreign data.
  Definition changes need `settings:manage` (NFR-004); the settings pages hide the actions as a courtesy, not as the boundary.
- **Performance** — values are stored on the task document (no join), definitions are loaded once per request and cached per workspace on the
  client, stages travel with the workspace `requirePermission` already loads, and clearing values is one `updateMany` per change.
- **Dependencies** — `mongoose`, `express-validator`, `react`, the internal `taskModel`/`taskQuery`/`listColumns`/`features/tasks` pieces and the
  flow tracking hook.
- **Risks** — see `spec.md` §6 (mirrored validation, stranded tasks, silent data loss, unbounded definitions).

## 6. Retroactive validation

Confirmed by the tests listed in `spec.md` §7 and by `node .sdrive/scripts/validate-governance.js`. The repository quality gates (CON-402) are
`pnpm --filter server typecheck && pnpm --filter server test` and
`pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint` plus `pnpm --filter client build`.
