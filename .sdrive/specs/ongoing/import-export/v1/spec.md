> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Importing tasks from CSV, Trello and Jira exports

- **Feature:** `import-export`
- **Version:** v1
- **Status:** implemented (documented after the fact from `server/src` and `client/src`)

## Overview

### Problem

Teams arriving from another tool had to retype their backlog: a board could not be brought into a
workspace without losing lists, labels, checklists, comments, sprints or parent relationships, and
there was no safe way to try an import — a half-finished one left the workspace with duplicated,
unmapped tasks.

### Solution

A two-step import.

1. **Preview** — `POST /api/workspaces/:slug/import/preview` parses the uploaded text with the
   parser for the chosen source (`server/src/utils/importers/{csv,genericCsv,trello,jira}.ts`) and
   answers a description of the file — counts, columns/lists, statuses with a suggested stage, types
   with a suggested type, people with member matches, labels, sprints, parent/epic counts, a first
   page of items and warnings — **without writing anything**.
2. **Commit** — `POST /api/workspaces/:slug/import/commit` creates the tasks in the mapped project
   using the workspace's own workflow stages, in batches, all-or-nothing, and records
   `import.completed` in the activity log.

Both live in `server/src/controllers/importController.ts`, are mounted by
`server/src/routes/importRoutes.ts` at `/:slug/import` (body limit 3 MB in `server/src/app.ts`), and
are driven by the client wizard in `client/src/features/import` hosted by
`client/src/pages/ImportPage.tsx`, which reads the file in the browser so nothing is uploaded until
the review step.

### Target audience

Workspace administrators and members migrating a backlog from Jira, Trello or a spreadsheet, and
teams that keep a spreadsheet as the source of truth for upcoming work.

### Assumptions

- Only three source formats exist (`IMPORT_SOURCES` = `csv`, `trello`, `jira`); any other tool must be
  exported into one of them first. `assumption: true`
- Sprint dates are synthesised: a sprint created during an import is given `SPRINT_DAYS` (14) days
  from the import date, because the export formats do not carry sprint dates. `assumption: true`
- Comments written by someone who is not a member of the target workspace are attributed to the
  member running the import, and the count is reported as a warning
  (`counters.commentsAsImporter`). `assumption: true`

### Out of scope

- **Exporting tasks out of TaskMan as CSV.** The only CSV this feature produces is the download
  template; the audit-log CSV export and the timesheet CSV export belong to their own features
  (`server/src/controllers/activityController.ts`, `timeController.ts`).
- Importing into a project of another workspace, or matching a project by id (projects match by name
  through `nameKey`).
- Importing workspace settings, roles, members or attachments; the import only creates tasks (and
  optionally a project and sprints).

## User stories and acceptance criteria

### US-001 — See what a file contains before anything is created

- **Role:** workspace member
- **Want:** to upload an export and be told what is in it
- **Benefit:** I can judge an import before it touches the workspace

| AC | Acceptance criterion |
| --- | --- |
| AC-001 | `POST …/import/preview` validates `source` (`csv|trello|jira`) and `content` (1..2 000 000 characters) and answers source, total, limit, skipped, columns with counts and a suggested stage, types with a suggested type, people with `isMember`/`memberId`/`memberName`, labels, sprints, `withParent`, `withEpic`, comments, the workspace members and workflow stages, the first 20 parsed items and up to 50 warnings — writing nothing. |
| AC-002 | A file the parser cannot read answers with the parser's readable message (`ImportParseError`) rather than a server error, and a file above the item limit gets a warning placed before the parser's own warnings. |

### US-002 — Map the file onto the workspace

- **Role:** workspace member
- **Want:** to choose the project, map lists to stages, people to members, types, and decide about
  sprints and comments
- **Benefit:** the imported backlog follows our workflow, not the other tool's vocabulary

| AC | Acceptance criterion |
| --- | --- |
| AC-003 | The commit accepts `mapping { project (existing name or { name, key }), statusMap, userMap, typeMap, createSprints, includeComments }` where every status value must be a workspace workflow stage key and every user value a member id or `null`; entries are read as plain data (never through the object prototype) and more than 2000 entries in one map is refused with a readable error. |

### US-003 — Import the backlog into a project

- **Role:** workspace member
- **Want:** tasks, labels, dates, assignees, sprints, checklists and comments to arrive in one project
- **Benefit:** we start working without retyping anything

| AC | Acceptance criterion |
| --- | --- |
| AC-004 | A new project requires `projects:write` (403 otherwise) and a free name (409 when a project with that name exists); an existing project must exist and not be archived; a name is at most `MAX_PROJECT_NAME` (60) characters. |
| AC-005 | Tasks are created in batches of 500 with task numbers reserved up front, statuses mapped through `stageFor`/`workflowOf`, labels normalised, dates as `YYYY-MM-DD` calendar days, unparsable dates counted as warnings, assignees limited to mapping members, and comments/checklists/links carried within caps with a warning for every dropped value. |
| AC-006 | Sprints are created only when asked and permitted (≤ 30, each 14 days, otherwise a warning explains the skip); the commit is all-or-nothing — a failure deletes the tasks, sprints and a newly created project it already wrote — and success records `import.completed` with source/created/skipped/sprints and answers created, skipped, `sprintsCreated`, warnings and the target project. |

### US-004 — Do it in the app

- **Role:** workspace member
- **Want:** a wizard that explains each source, takes my file, shows the mapping and review steps and
  reports the result
- **Benefit:** no command line and no hand-written mapping JSON

| AC | Acceptance criterion |
| --- | --- |
| AC-007 | The wizard has five steps (source, upload, map, review, import); the file is read in the browser and sent as text, nothing is stored until the last step, and an empty, oversized (> 2 MB) or wrong-extension file is refused before upload (`checkImportFile`). |
| AC-008 | The source step explains what each source exports, how to obtain it and what carries over, and offers the CSV template download (header row + two example rows, CRLF, saved with a UTF-8 BOM). |

### US-005 — Be guided through the mapping

- **Role:** workspace member
- **Want:** the mapping pre-filled, told what blocks the import, and a people summary
- **Benefit:** I finish the mapping quickly and catch problems before committing

| AC | Acceptance criterion |
| --- | --- |
| AC-009 | `initialMapping` pre-fills status/type/person mappings from the preview's suggestions, `mappingProblems` reports what blocks the import (no project chosen, a new name already used, a person not mapped), `buildCommitMapping` produces the request body and `peopleSummary` reports mapped vs unassigned. |

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | A preview endpoint parses the text and describes the file (counts, columns, statuses, types, people, labels, sprints, parents, comments, workflow stages, first items, warnings) without writing. |
| FR-002 | Three parsers (generic CSV/TSV, Trello board JSON, Jira CSV) produce one neutral item shape with warnings and a skipped count, dispatched by `parseImport` and reporting failures as `ImportParseError`. |
| FR-003 | Parsing uses shared helpers: delimiter-detecting CSV reader, sheet abstraction with column aliases, `cleanText`, calendar/date-time parsing, priority and story-point parsing, list splitting, status/type suggestions and unique external ids. |
| FR-004 | A commit endpoint takes the same text plus a mapping, reads every mapping entry as plain data, refuses a map with more than 2000 entries and refuses an empty file. |
| FR-005 | The target project is existing (must exist, not archived) or new (needs `projects:write`, a free name and a valid key); a taken name answers 409. |
| FR-006 | Tasks are created in batches with reserved numbers, workflow-mapped statuses, normalised labels, calendar-day dates, mapping-limited assignees, checklists and links, and counted warnings for every dropped value. |
| FR-007 | Sprints are matched or created (≤ 30, 14 days each) and creation is refused without project permissions, with a warning explaining the skip. |
| FR-008 | Comments are imported only when asked, capped, attributed to the importing member when the source author cannot be matched, with the count reported. |
| FR-009 | The commit is all-or-nothing (rollback of created tasks/sprints/project) and success records `import.completed` with source, created, skipped and sprint counts. |
| FR-010 | The client wizard runs five steps, reads the file in the browser (with a `FileReader` fallback) and sends its text only from the review step. |
| FR-011 | The wizard explains each source and can download the CSV template. |
| FR-012 | The map/review steps pre-fill from the suggestions, block the import while a problem remains and summarise the mapping before it is sent. |

## Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-001 | Both endpoints need `tasks:write` and scope queries to `req.workspace._id`; creating a project or sprints additionally needs `projects:write`. *(CON-106, CON-512)* |
| NFR-002 | Imported text is sanitised and capped before storage: `cleanText` removes control, zero-width and bidirectional characters and cuts each value to its limit. |
| NFR-003 | One request is bounded: 2 000 items, 2 000 000 characters (3 MB JSON body on this path), batches of 500, ≤ 30 new sprints, ≤ 2000 mapping entries, 50 warnings, 20 previewed items. |
| NFR-004 | Mapping keys are read as data (not through the prototype), no value is interpolated into a query, and the commit is atomic with rollback, so a rejected import leaves no partial state. *(CON-516)* |

## Edge cases

| ID | Case | Expected behaviour |
| --- | --- | --- |
| EC-001 | A file that does not match the chosen source (Trello JSON as CSV, a CSV with no usable title column). | The parser throws `ImportParseError` with a readable message and the preview answers that message; nothing is written. |
| EC-002 | More items than the limit. | The preview answers normally with a top warning ("split the file"); the commit refuses with a rule error before writing. |
| EC-003 | Rows or cards that cannot become tasks (no title, archived Trello cards). | Counted in `skipped` and simply not imported. |
| EC-004 | A person in the file who is not a member. | The preview marks `isMember: false` with no `memberId`, and the mapping decides (assign to a member or leave unassigned via `userMap` `null`). |
| EC-005 | A target project name already used in the workspace. | 409 naming the conflict, so the user picks the existing project or another name. |
| EC-006 | A failure in the middle of a commit. | Everything this request created (tasks, sprints, a project created by this import) is deleted again and the error is reported. |

## Dependencies

| Name | Type | Notes |
| --- | --- | --- |
| Trello board JSON export | external | Produced by the user (Menu → Print, export and share → Export as JSON); archived cards are skipped. |
| Jira CSV export | external | `Export Excel CSV (all fields)`; the parser reads the standard type/status/assignee/sprint/story-point/parent columns. |
| `utils/workflow.ts` | internal | `workflowOf`/`stageFor` map a source list onto the workspace's stages. |
| `utils/taskNumbers.ts` | internal | `reserveTaskNumbers` allocates the numbers used in the batch inserts. |
| `utils/taskQuery.ts` | internal | `normalizeLabels` keeps imported labels within the workspace rules. |
| `express.json({ limit: '3mb' })` | internal | Path-specific parser before the general 100 kB parser. |

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-001 | A large or malformed export exhausting memory or leaving half a backlog. | Hard caps, parse-before-write, batches of 500 and a rollback of everything the request created. |
| RISK-002 | Imported text carrying invisible characters or markup tricks. | `cleanText` strips control/zero-width/bidi characters and cuts to limits; the client renders imported text as React text only. |
| RISK-003 | A crafted mapping key reaching the object prototype. | `entriesOf` reads own entries as plain data and every value is validated (member, stage key, task vocabulary). |
| RISK-004 | Silent data loss while mapping an unfamiliar export. | Counters and warnings (`skipped`, `noDue`, `badDates`, `invalid`, `commentsAsImporter`) surfaced in the preview, the review step and the result. |

## Verification (retroactive)

| Test id | Test file | What it covers |
| --- | --- | --- |
| TEST-001 | `server/src/__tests__/importers/csv.test.ts` | Delimiter detection, quoted fields, header normalisation. |
| TEST-002 | `server/src/__tests__/importers/helpers.test.ts` (with `fixtures.ts`) | Sheet/alias helpers, `cleanText`, date and priority parsing, suggestions, warning bag. |
| TEST-003 | `server/src/__tests__/importers/jira.test.ts`, `server/src/__tests__/importers/trello.test.ts` | Jira CSV and Trello JSON mapping to the neutral item shape (including skipped rows and comments). |
| TEST-004 | `server/src/__integration__/import.test.ts` | Preview, commit from CSV/Jira/Trello, rules and limits, permissions and isolation. |
| TEST-005 | `client/src/features/import/__tests__/lib.test.ts` | `checkImportFile`/`formatBytes`, the CSV template, `initialMapping`/`mappingProblems`/`buildCommitMapping`/`peopleSummary`. |
| TEST-006 | `client/src/features/import/__tests__/ImportWizard.test.tsx` | Wizard steps, file validation, preview, mapping, import and result rendering. |

Commands

```bash
pnpm --filter server test importers                              # TEST-001, TEST-002, TEST-003
pnpm --filter server test:integration import                     # TEST-004
pnpm --filter client test features/import                        # TEST-005, TEST-006
```

> Test names in these files do not carry `AC-###` ids; the mapping above was produced by reading the
> tests during onboarding, so CON-405 remains an unmet convention rather than a verified claim.
