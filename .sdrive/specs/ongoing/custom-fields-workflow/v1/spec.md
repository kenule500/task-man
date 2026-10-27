> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# custom-fields-workflow — functional specification

| | |
|---|---|
| Feature | `custom-fields-workflow` |
| Version | 1 |
| Status | Retroactive (behaviour already shipped and verified by the tests listed below) |
| Governance | `.sdrive/governance/custom-fields-workflow/v1/{spec,plan,tasks,traceability}.json` |

## 1. Overview

### Problem statement

Every team tracks something the generic task form does not know (a budget, an environment, an external ticket) and every team splits its work
differently (Ready, In review, Blocked). Hard-coding those columns or adding ad-hoc task fields would break the reports that depend on the three
canonical statuses, and would leave the extra data unvalidated and unfilterable.

### Proposed solution

Two workspace-level definitions with one set of rules on both sides of the wire:

- **Custom fields** — `server/src/models/customFieldModel.ts` plus `server/src/utils/customFields.ts` describe a typed value that a task stores
  under `task.custom[key]`; `server/src/utils/customFieldsDb.ts` validates a request against the workspace's definitions.
- **Workflow stages** — `server/src/utils/workflow.ts` describes board columns, each mapped to one of the three status groups, and resolves
  `task.stage` together with `task.status` on every write.

The client mirrors both in `client/src/features/fields` and `client/src/features/workflow`, each cached per workspace and shared by every view.

### Target audience

Workspace administrators who define fields and stages, and workspace members who fill, filter and move work with them.

### Assumptions

- The reports that consume the canonical status groups (flow analytics, burndown, sprint report) were not opened; the rule that a stage change
  never alters a report's meaning comes from the constitution (CON-108) and the comments in `server/src/utils/workflow.ts`. `assumption: true`
- `FieldDialog`, `CustomFieldInput` and `StageRow` were read at behaviour level; visual rules follow `DESIGN.md` and are not restated here. `assumption: true`
- Which project names a workspace has is owned by the projects feature; this feature only stores up to 50 project names per field and compares
  them as written. `assumption: true`

### Out of scope

- Saved views and the filter URL machinery (`client/src/features/views`, `features/tasks/lib/filters.ts`) — reused here.
- Project and release administration — this feature only names projects on a field.
- The burndown, velocity, cumulative flow and sprint reports themselves; they only consume the status groups.

## 2. User stories and acceptance criteria

### US-001 — Define custom fields for a workspace
*As a* workspace administrator *I want* to add, rename, restyle, reorder, archive and delete typed fields a task can carry,
*so that* the team can track its own information without touching the generic task form.

- **AC-001** Creating a field needs a name (1–40 chars) and one of the eight types (`FIELD_TYPES` in
  `server/src/models/customFieldModel.ts`: text, number, date, select, multiselect, checkbox, url, user); the key is slugged from the name
  (`slugFromName`, pattern `^[a-z][a-z0-9_]{0,29}$`) or taken from `key` when it matches and is unused.
- **AC-002** Only select and multiselect accept options: at most 30, labels unique and ≤40 characters with a colour from the shared palette
  (slate, blue, violet, amber, emerald, rose, cyan); `projects` limits the field to ≤50 project names (empty = every project), `required` marks
  it mandatory (checkboxes excluded) and a new field is appended to the order (`Math.max(order) + 1`).
- **AC-003** A workspace holds at most 30 active fields (`MAX_ACTIVE_FIELDS`); renaming, recolouring, adding or removing options, changing
  projects or required and archiving are allowed, while the key and the type never change (`CustomFieldPatch` in
  `client/src/features/fields/types.ts` has no key or type).
- **AC-004** Removing an option clears that choice from the tasks that stored it (`clearRemovedOptions`: `$unset` for a select, `$pull` plus
  `$size: 0` cleanup for a multiselect); an archived field keeps its values but rejects new ones (clearing with `null` is still accepted);
  unarchiving is refused while 30 fields are active.
- **AC-016** Fields are listed in display order (archived included) with key, name, type, options, projects, required, order and archived state;
  reading needs `tasks:read`.
- **AC-017** `PUT /fields/order` puts the listed ids first in that order, refuses an id that is not a field of the workspace, and keeps the
  remaining fields after them in their relative order.
- **AC-018** Deleting a field unsets its value on every task of the workspace (`$exists` filter per workspace) and is audited with the key and
  the number of cleared values (`field.deleted`).

### US-002 — Fill custom values on tasks
*As a* workspace member *I want* to set, change and clear a task's custom values with an editor that matches the field's type,
*so that* the extra information is captured where the work happens and stays valid.

- **AC-005** On create, `custom` may only name fields that apply to the task's project (`fieldAppliesTo`); an unknown key, a value for an
  archived field or a missing required field is refused with the field's name (`planCustomValues` in `server/src/utils/customFields.ts`).
- **AC-006** On update, `custom` merges: only the named keys change, `null` (or an empty text/list) clears a value, and required fields are not
  re-checked (`mode: 'update'`).
- **AC-007** Values are coerced per type and rejected with the field name: text trimmed to 500 chars, number finite, date a real `YYYY-MM-DD`
  day, select one of the stored option ids, multiselect ≤20 unique ids, checkbox a boolean, url `http(s)` ≤500 chars, user an id of a workspace
  member (`coerceFieldValue`).
- **AC-008** A changed value is written to the task history as `custom.<key>` with option labels (`describeCustomChanges`), and the UI renders
  an editor per type in the form and the detail dialog (`CustomFieldInput`, `TaskCustomFields`, `TaskFormCustomFields`) plus chips in the views
  (`TaskCustomChips`).

### US-003 — Filter the task list by custom values
*As a* workspace member *I want* to filter the list by a field value, including "no value", without writing a query,
*so that* I can slice the work by the team's own attributes.

- **AC-009** The list query accepts at most five `cf.<key>` filters (`MAX_CUSTOM_FILTERS`; key matched against the field slug, value a plain
  text ≤100 chars); the server matches the stored value exactly, `none` matches tasks without a value, numbers and checkboxes compare as text
  and a multiselect matches when it contains the value (`parseCustomFilters`, `customFilterMatch` in `server/src/utils/taskQuery.ts`).
- **AC-010** The toolbar offers one filter per active, filterable field (select, multiselect, checkbox, user — `filterableFields`), with the
  field's own choices plus "any", "none" and the current value even when the field no longer has it (`filterOptions`), keeps the value in the
  URL and matches in memory with `matchesCustom` (`client/src/features/tasks/lib/filters.ts`).

### US-004 — Configure the workflow stages
*As a* workspace administrator *I want* to name, colour and limit the board columns and to move the tasks of a removed column somewhere known,
*so that* the board mirrors how the team works while the reports keep working.

- **AC-011** `GET /workflow` answers the workspace's stages in board order, or `defaultWorkflow()` (To do / In progress / Done) when none were
  configured; a stage with no limit that is alone in its group inherits the legacy per-status `boardSettings.wipLimits` value (`workflowOf`).
- **AC-012** `PUT /workflow` validates 1–12 stages with unique slug keys (≤30 chars, `STAGE_KEY_PATTERN`), unique names (≤30), a palette colour,
  a whole-number limit 0–999 and at least one stage per status group, then stores them on the workspace.
- **AC-013** Tasks of a removed stage move to `moves[key]` when that target exists, else to the first stage of the removed stage's group
  (`planStageMoves`); a stage that changed group takes its tasks' status with it (setting `completedAt` when landing in a completed group,
  clearing it otherwise); a stale stage that does not match its status is reset (`stage: ''`).

### US-005 — Move tasks between stages
*As a* workspace member *I want* a card or a select to put a task in a stage and have its status follow,
*so that* the board and the reports never disagree about where a task is.

- **AC-014** An explicit `stage` wins and sets the status to that stage's group; a status-only change keeps the current stage when it belongs to
  the group and otherwise takes the group's first stage; an unknown stage writes nothing and answers `Unknown stage` (`stageFor`,
  `UNKNOWN_STAGE_MESSAGE`).
- **AC-015** The board renders one column per stage with its name, colour dot and limit; a move sends `stage` once the workflow is loaded and
  only the status otherwise (`stagePatch`), and the status controls and badges show the stage's name when the workflow is loaded
  (`TaskStageBadge`, `stagesByGroup`).

## 3. Functional requirements

| ID | Requirement | Evidence in the repository |
|---|---|---|
| FR-001 | List a workspace's fields in display order, archived included (`tasks:read`). | `customFieldController.listFields`, `routes/fieldRoutes.ts` |
| FR-002 | Create a field with name, type, slug key, options, projects, required and appended order, respecting the 30-active cap. | `createField`, `slugFromName`, `customFieldModel.ts` |
| FR-003 | Update a field (name, options, projects, required, archived) without changing key or type, clearing removed option values. | `updateField`, `clearRemovedOptions`, `normalizeOptions` |
| FR-004 | Replace the field order from a list of ids, refusing ids that are not fields of the workspace. | `reorderFields` |
| FR-005 | Delete a field and unset its value on every task, auditing the count. | `deleteField` |
| FR-006 | Validate and persist `custom` on task create/update against the workspace's definitions (applicable fields, per-type coercion, required on create, merge with `null` to clear). | `customFields.planCustomValues`, `customFieldsDb.planRequestCustom`, `taskController.createTask`/`updateTask` |
| FR-007 | Filter the task list by custom values on the server (≤5 `cf.<key>`) and mirror the same rules on the client. | `taskQuery.parseCustomFilters`, `features/tasks/lib/filters.ts` (`matchesCustom`), `fields/lib/fieldFilters.ts` |
| FR-008 | Serve the workflow stages with the default fallback and the legacy per-status limit. | `workflowController.getWorkflow`, `workflow.workflowOf`, `defaultWorkflow` |
| FR-009 | Replace the stages with full validation and move the tasks of removed stages while resynchronising status and `completedAt`. | `workflowController.updateWorkflow`, `planStageMoves` |
| FR-010 | Keep stage and status consistent on every write and reject an unknown stage. | `workflow.stageFor`, `taskController` (`UNKNOWN_STAGE_MESSAGE`), `workflow/lib/stages.resolveStage` |
| FR-011 | Show fields on tasks: editor per type in form and detail, chips in views, one list column per active field, required validation in the form. | `features/fields/components/*`, `features/tasks/lib/listColumns.ts` |
| FR-012 | Show the workflow in the UI: board columns with name/colour/WIP badge, stage badges in status controls, settings editor with a preview. | `features/workflow/components/*`, `pages/WorkflowSettingsPage.tsx`, `features/tasks/views/BoardView.tsx` |

## 4. Non-functional requirements

| ID | Requirement | Constitution |
|---|---|---|
| NFR-001 | Field definitions, stages and every value query are filtered by `req.workspace._id`; clearing removed options or deleting a field only touches the current workspace. | CON-106 |
| NFR-002 | A stage refines one of the three canonical status groups, no configuration may add a group, and every group keeps at least one stage so reports stay meaningful. | CON-108 |
| NFR-003 | The rules live in pure modules with unit tests on both sides (`utils/customFields.ts` / `utils/workflow.ts` and `features/fields/lib` / `features/workflow/lib`). | CON-109, CON-202 |
| NFR-004 | Reading needs `tasks:read`; every definition change needs `settings:manage`, enforced by `requirePermission` on the routes. | CON-105 |

## 5. Edge cases

| ID | Case | Expected behaviour |
|---|---|---|
| EC-001 | A requested key is already used in the workspace. | 400 `This key is already used by another field`; a derived key is made unique (`story_size`, `story_size_2`, …). |
| EC-002 | Options are sent for a type that does not take them. | 400 `Only select fields have options`; on update an empty list on such a type is ignored. |
| EC-003 | A user field receives a non-member id. | 400 `<field name>: must be a member of this workspace`. |
| EC-004 | A `cf.<key>` filter uses a non-slug key, more than five keys, or an empty value. | The parameter is ignored; an explicit `none` still matches tasks without a value. |
| EC-005 | A workflow update leaves a status group without stages. | 400 `Every group needs at least one stage (<group> has none)`; nothing is saved. |
| EC-006 | The stage a task sits in is removed by an update. | The task moves to `moves[key]` or the first stage of its group; a stale stage is reset to `''` and re-derived from the status. |
| EC-007 | An archived field is reactivated while 30 fields are active. | 400 `A workspace can have at most 30 fields. Archive or delete one first.` |
| EC-008 | A value is written for an archived field. | 400 `<field name>: this field is archived`; sending `null` to clear the old value is still accepted. |
| EC-009 | A task moves between status groups through a stage change. | The status follows the stage's group, `completedAt` is set when it lands in a completed group and cleared otherwise. |

## 6. Dependencies and risks

Dependencies: `mongodb (mongoose 9)`, `express-validator`, `react 19` (the caches use `useSyncExternalStore`), the internal `taskModel`,
`taskQuery`, `listColumns`, `features/tasks` filters, and the flow tracking hook registered in `app.ts`.

| Risk | Mitigation |
|---|---|
| RISK-001 Client and server validation can drift. | Mirrored pure modules with mirrored tests, the UI shows the API message on rejection, and key/type are immutable. |
| RISK-002 A workflow change can strand tasks. | `planStageMoves` runs before the save, stale stages are reset, status/`completedAt` resynchronised, and `resolveStage` repairs the display. |
| RISK-003 Removing an option or a field loses task data. | Values are cleared in the same request, the audit records how many, and the settings UI warns before deleting a field. |
| RISK-004 Unbounded definitions would bloat task documents. | Caps in the model and the validators (30 fields, 30 options, 50 projects, 500-char text, 20 multiselect values, 5 filters). |

## 7. Verification (retroactive)

Commands:

```
pnpm --filter server test              # unit tests
pnpm --filter server test:integration  # real MongoDB
pnpm --filter client test              # jsdom + Testing Library
```

| TEST id | Test file | Command |
|---|---|---|
| TEST-001 | `server/src/__tests__/customFields.test.ts` | `pnpm --filter server test` |
| TEST-002 | `server/src/__tests__/workflow.test.ts` | `pnpm --filter server test` |
| TEST-003 | `server/src/__tests__/boardSettings.test.ts` | `pnpm --filter server test` |
| TEST-004 | `server/src/__tests__/taskController.test.ts` | `pnpm --filter server test` |
| TEST-005 | `server/src/__tests__/taskQuery.test.ts` | `pnpm --filter server test` |
| TEST-006 | `server/src/__integration__/customFields.test.ts` | `pnpm --filter server test:integration` |
| TEST-007 | `server/src/__integration__/workflow.test.ts` | `pnpm --filter server test:integration` |
| TEST-008 | `server/src/__integration__/tasks.test.ts` | `pnpm --filter server test:integration` |
| TEST-009 | `server/src/__integration__/bulk.test.ts` | `pnpm --filter server test:integration` |
| TEST-010 | `client/src/features/fields/__tests__/fields.test.ts` | `pnpm --filter client test` |
| TEST-011 | `client/src/features/fields/__tests__/fieldFilters.test.ts` | `pnpm --filter client test` |
| TEST-012 | `client/src/features/fields/__tests__/fieldsUi.test.tsx` | `pnpm --filter client test` |
| TEST-013 | `client/src/features/workflow/__tests__/stages.test.ts` | `pnpm --filter client test` |
| TEST-014 | `client/src/features/workflow/__tests__/workflowBoard.test.tsx` | `pnpm --filter client test` |
| TEST-015 | `client/src/pages/__tests__/WorkflowSettingsPage.test.tsx` | `pnpm --filter client test` |
| TEST-016 | `client/src/features/tasks/__tests__/customFilters.test.ts` | `pnpm --filter client test` |
| TEST-017 | `client/src/features/tasks/__tests__/listColumns.test.ts` | `pnpm --filter client test` |
| TEST-018 | `client/src/features/tasks/__tests__/taskForm.test.ts` | `pnpm --filter client test` |
