> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Tasks — Importing tasks from CSV, Trello and Jira exports

- **Feature:** `import-export`
- **Version:** v1
- **Machine-readable tasks:** `.sdrive/governance/import-export/v1/tasks.json`

Every task below is already implemented, so all boxes are checked. Requirements in brackets are the
`FR-###` / `NFR-###` ids from `.sdrive/governance/import-export/v1/spec.json`.

## P1 — Parsers and shared helpers

- [x] **T1.1 — Define the neutral import shape.** `server/src/utils/importers/types.ts`: `IMPORT_SOURCES`, `MAX_IMPORT_ITEMS`, `MAX_IMPORT_CONTENT`, `IMPORT_LIMITS`, `ImportItem`/`ParsedImport`, `ImportParseError`. _(FR-002, NFR-003; AC-002)_
- [x] **T1.2 — Write the CSV reader and sheet helpers.** `csv.ts` (delimiter detection, quoted fields, `headerKey`) and `sheet.ts` (`readSheet`, `columnsOf` aliases, `firstCell`/`allCells`, `WarningBag`, `uniqueExternalId`). _(FR-002, FR-003; AC-001, AC-002)_
- [x] **T1.3 — Write the text and suggestion helpers.** `text.ts`: `cleanText`, `parseCalendarDate`, `parseDateTime`, `normalizePriority`, `parseStoryPoints`, `splitList`, `looksLikeEmail`, `suggestStatus`, `suggestType`. _(FR-003, NFR-002; AC-001, AC-005)_
- [x] **T1.4 — Write the three source parsers.** `genericCsv.ts`, `trello.ts`, `jira.ts`, plus `links.ts` and the `parseImport` dispatcher in `index.ts`. _(FR-002, FR-003; AC-002)_
- [x] **T1.5 — Cover the parsers with unit tests.** `server/src/__tests__/importers/{csv,helpers,jira,trello}.test.ts` with `fixtures.ts`. _(FR-002, FR-003; AC-001, AC-002)_

## P2 — Preview API (depends on P1)

- [x] **T2.1 — Implement the preview endpoint.** `validatePreviewImport` and `previewImport`: parse, load members, tally statuses/types/people/labels/sprints, expose the workflow stages, preview 20 items, collect ≤ 50 warnings (item-limit warning first), write nothing. _(FR-001, FR-003, NFR-001, NFR-003; AC-001, AC-002)_
- [x] **T2.2 — Declare the import routes and the body limit.** `server/src/routes/importRoutes.ts` behind `protect` + `tasks:write`, mounted at `/:slug/import`, with the 3 MB JSON parser in `server/src/app.ts`. _(FR-001, NFR-001, NFR-003; AC-001)_

## P3 — Commit API (depends on P1, P2)

- [x] **T3.1 — Read and validate the mapping.** `readMapping` with `entriesOf` (own entries as plain data), the 2000-entry limit, project existing-by-name or new, `statusMap` against stage keys, `userMap` against members (or `null`), `typeMap` against task types. _(FR-004, NFR-004; AC-003)_
- [x] **T3.2 — Resolve and check the target project.** `projects:write` for a new project, existence and archive state for an existing one, 409 for a taken name, and refusal of an empty/oversized file before any write. _(FR-004, FR-005, NFR-001; AC-003, AC-004)_
- [x] **T3.3 — Create the tasks in batches.** Reserve task numbers, map statuses through `stageFor`/`workflowOf`, normalise labels, write calendar-day dates, limit assignees to mapping members, carry comments/checklists/links within caps, count dropped values, insert in batches of 500. _(FR-006, FR-008, NFR-002; AC-005)_
- [x] **T3.4 — Handle sprints.** Match existing sprint names or create the missing ones (≤ 30, 14 days each) only when asked and permitted, with a warning when the role cannot create them. _(FR-007, NFR-001; AC-006)_
- [x] **T3.5 — Make the commit atomic and audited.** Collect created ids (tasks, sprints, a new project), delete them on failure, map `ConflictError` to 409, record `import.completed`, answer the result payload. _(FR-009, NFR-004; AC-006)_
- [x] **T3.6 — Cover the import API with integration tests.** `server/src/__integration__/import.test.ts`: preview, commit from CSV/Jira/Trello, rules and limits, permissions and isolation. _(FR-001, FR-004…FR-009, NFR-001, NFR-003; AC-001, AC-003, AC-004, AC-005, AC-006)_

## P4 — Client wizard (depends on P2, P3)

- [x] **T4.1 — Build the import API, types and wizard hook.** `client/src/features/import/{api,types,index}.ts` and `hooks/useImportWizard.ts` with `WIZARD_STEPS` (source, upload, map, review, import), file reading, preview, navigation, import and result state. _(FR-010; AC-007)_
- [x] **T4.2 — Write the sources, template and mapping helpers.** `lib/sources.ts` (guidance, `formatBytes`, `checkImportFile`, `readFileText`), `lib/template.ts` (`CSV_TEMPLATE_HEADERS`, `csvTemplate`, `downloadTextFile` with BOM) and `lib/mapping.ts` (`stageForGroup`, `initialMapping`, `mappingProblems`, `hasMappingProblems`, `buildCommitMapping`, `projectNameFromFile`, `peopleSummary`). _(FR-011, FR-012; AC-008, AC-009)_
- [x] **T4.3 — Build the wizard steps and the page.** `SourceStep`, `UploadStep`, `MapStep`, `ReviewStep`, `ResultStep`, `ImportWizard`, `MapSelect` and `client/src/pages/ImportPage.tsx` with `useAuthGuard`, the workspace projects and the caller's project permission. _(FR-010, FR-012; AC-007, AC-009)_
- [x] **T4.4 — Cover the wizard with tests.** `client/src/features/import/__tests__/lib.test.ts` and `ImportWizard.test.tsx`. _(FR-010, FR-011, FR-012; AC-007, AC-008, AC-009)_

## Verification

```bash
pnpm --filter server test importers
pnpm --filter server test:integration import
pnpm --filter client test features/import
pnpm --filter server typecheck && pnpm --filter client typecheck && pnpm --filter client lint && pnpm --filter client build
```

Test-id legend: see `spec.md → Verification (retroactive)` (`TEST-001` … `TEST-006`).
