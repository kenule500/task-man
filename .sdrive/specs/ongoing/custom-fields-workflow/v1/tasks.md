> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# custom-fields-workflow — execution tasks

| | |
|---|---|
| Feature | `custom-fields-workflow` |
| Version | 1 |
| Governance | `.sdrive/governance/custom-fields-workflow/v1/tasks.json` |

Every task below is already implemented and verified, so each line is checked. Test ids refer to `spec.md` §7.

## P1 — Definitions and pure rules

- [x] **T1.1 Model the custom field document** — `server/src/models/customFieldModel.ts` (FR-002, FR-003; AC-001, AC-002; TEST-001)
- [x] **T1.2 Write the custom value rules** — `server/src/utils/customFields.ts` (FR-002, FR-006, FR-007, NFR-003; AC-005, AC-007, AC-009; TEST-001)
- [x] **T1.3 Load the field definitions for a request** — `server/src/utils/customFieldsDb.ts` (FR-006, NFR-001; AC-005, AC-007; TEST-006)
- [x] **T1.4 Write the workflow stage rules** — `server/src/utils/workflow.ts` (FR-008, FR-009, FR-010, NFR-002, NFR-003; AC-011, AC-012, AC-013, AC-014; TEST-002)
- [x] **T1.5 Store the stages and the task-side fields** — `server/src/models/workspaceModel.ts`, `server/src/models/taskModel.ts` (FR-009, FR-010, NFR-002; AC-012, AC-014; TEST-002)

## P2 — Definitions API

- [x] **T2.1 Declare the field router and its permissions** — `server/src/routes/fieldRoutes.ts` (FR-001, FR-002, FR-004, NFR-004; AC-016; TEST-006)
- [x] **T2.2 List and create fields** — `listFields`, `createField` (FR-001, FR-002; AC-001, AC-002, AC-003, AC-016; TEST-006, TEST-012)
- [x] **T2.3 Update a field and clear the removed options** — `updateField`, `clearRemovedOptions` (FR-003; AC-003, AC-004; TEST-006, TEST-012)
- [x] **T2.4 Reorder and delete fields** — `reorderFields`, `deleteField` (FR-004, FR-005; AC-017, AC-018; TEST-006, TEST-012)
- [x] **T2.5 Validate custom values on task writes** — `taskController` + `planRequestCustom` (FR-006; AC-005, AC-006, AC-007, AC-008; TEST-001, TEST-008)
- [x] **T2.6 Filter the task list by custom values** — `taskQuery.parseCustomFilters`/`buildTaskFilter` (FR-007; AC-009; TEST-005, TEST-001)
- [x] **T2.7 Serve and replace the workflow stages** — `workflowController` (FR-008, FR-009, NFR-002; AC-011, AC-012, AC-013; TEST-002, TEST-007)
- [x] **T2.8 Keep stage and status in sync on task writes** — `workflow.stageFor`, `taskController`, `resolveStage` (FR-010, NFR-002; AC-014; TEST-002, TEST-004, TEST-008)

## P3 — Client modules and settings surfaces

- [x] **T3.1 Build the fields feature module** — `features/fields/{types,api}.ts`, `lib/fields.ts`, `lib/fieldFilters.ts`, `hooks/useCustomFields.ts`, `hooks/useFieldMembers.ts` (FR-001, FR-002, FR-003, NFR-003; AC-016; TEST-010, TEST-011)
- [x] **T3.2 Show custom fields on tasks** — `CustomFieldInput`, `CustomFieldValue`, `TaskCustomFields`, `TaskFormCustomFields`, `TaskCustomChips`, `listColumns.customColumns` (FR-011; AC-007, AC-008; TEST-012, TEST-017, TEST-018)
- [x] **T3.3 Add the custom field filters to the toolbar** — `fieldFilters.filterableFields`/`filterOptions`/`withCustomFilter` with `lib/filters.matchesCustom` (FR-007; AC-010; TEST-011, TEST-016)
- [x] **T3.4 Build the workflow feature module** — `features/workflow/{types,api}.ts`, `lib/stages.ts`, `hooks/useWorkflow.ts`, `components/StageBadges|StageRow|BoardPreview|DeleteStageDialog` (FR-008, FR-010, FR-012, NFR-003; AC-011, AC-014, AC-015; TEST-013, TEST-014)
- [x] **T3.5 Build the settings pages** — `pages/CustomFieldsPage.tsx`, `pages/WorkflowSettingsPage.tsx` (FR-002, FR-003, FR-004, FR-005, FR-009, FR-012; AC-001, AC-004, AC-012, AC-017, AC-018; TEST-012, TEST-015)

## P4 — Verification

- [x] **T4.1 Unit test the rules on both sides** — `server/src/__tests__/{customFields,workflow}.test.ts`, `client/src/features/fields/__tests__/{fields,fieldFilters}.test.ts`, `client/src/features/workflow/__tests__/stages.test.ts` (NFR-003; TEST-001, TEST-002, TEST-010, TEST-011, TEST-013)
- [x] **T4.2 Integration test the definitions end to end** — `server/src/__integration__/{customFields,workflow}.test.ts` against a real MongoDB (NFR-001; AC-004, AC-013, AC-018; TEST-006, TEST-007)
- [x] **T4.3 Test the client surfaces** — `fieldsUi.test.tsx`, `workflowBoard.test.tsx`, `WorkflowSettingsPage.test.tsx`, `customFilters.test.ts`, `listColumns.test.ts` (NFR-002, NFR-004; AC-008, AC-010, AC-015; TEST-012, TEST-014, TEST-015, TEST-016, TEST-017)
- [x] **T4.4 Pass the repository quality gates** — `pnpm --filter server typecheck && pnpm --filter server test`; `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`; `pnpm --filter client build` (CON-402)
