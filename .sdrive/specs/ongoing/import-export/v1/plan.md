> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Plan — Importing tasks from CSV, Trello and Jira exports

- **Feature:** `import-export`
- **Version:** v1
- **Machine-readable plan:** `.sdrive/governance/import-export/v1/plan.json`

## Architecture

**Approach.** Split the risky part from the writing part. **Preview** parses the uploaded text and
answers a description plus suggestions, so a user can judge the file before anything exists.
**Commit** takes the same text plus a mapping and creates the tasks in one project. All parsing lives
under `server/src/utils/importers/` as pure modules over text (CSV reader, sheet/alias helpers, text
cleaning and suggestions, one parser per source), producing one neutral shape (`ImportItem`) so the
controller never knows which tool the file came from. The controller resolves the workspace's own
vocabulary — workflow stages for statuses, members for people, task types, labels — writes in
batches with reserved task numbers and keeps the request all-or-nothing by deleting what it created
if anything fails. The client wizard mirrors the two calls and reads the file in the browser.

**Referenced requirements:** `FR-001`–`FR-012`, `NFR-001`–`NFR-004`.

### Components

| Component | Action | Role |
| --- | --- | --- |
| `server/src/utils/importers/types.ts` | create | Neutral shape, `IMPORT_SOURCES`, caps (`MAX_IMPORT_ITEMS`, `MAX_IMPORT_CONTENT`, `IMPORT_LIMITS`), `ImportParseError`. |
| `server/src/utils/importers/csv.ts` | create | Delimiter detection, quoted-field CSV reader, `headerKey`. |
| `server/src/utils/importers/sheet.ts` | create | `readSheet`, `columnsOf` aliases, `firstCell`/`allCells`, `WarningBag`, `uniqueExternalId`. |
| `server/src/utils/importers/text.ts` | create | `cleanText`, `parseCalendarDate`, `parseDateTime`, `normalizePriority`, `parseStoryPoints`, `splitList`, `looksLikeEmail`, `suggestStatus`, `suggestType`. |
| `server/src/utils/importers/genericCsv.ts` | create | Generic spreadsheet parser + the template. |
| `server/src/utils/importers/trello.ts` | create | Trello board JSON parser. |
| `server/src/utils/importers/jira.ts` | create | Jira CSV parser. |
| `server/src/utils/importers/links.ts` | create | Parent/epic external ids → link references. |
| `server/src/utils/importers/index.ts` | create | `parseImport` dispatcher (BOM strip, empty-file guard) and re-exports. |
| `server/src/controllers/importController.ts` | create | Validators, `previewImport`, `commitImport`, `readMapping`. |
| `server/src/routes/importRoutes.ts` | create | `POST /preview`, `POST /commit` behind `protect` + `tasks:write`. |
| `server/src/app.ts` | modify | `express.json({ limit: '3mb' })` for the import path. |
| `server/src/routes/workspaceRoutes.ts` | modify | Mounts `/:slug/import`. |
| `client/src/features/import/` | create | api/types/hook (five steps), `lib/sources`, `lib/template`, `lib/mapping`, step components. |
| `client/src/pages/ImportPage.tsx` | create | Hosts the wizard. |

## Data model

The import introduces **no new collections**: it writes existing fields of existing models, which is
why every entity below is recorded as `no_change`.

### `Task` (no_change)

`title` (≤ 140), `description` (≤ 2000), `status` (mapped via the workflow), `type` (mapped),
`priority`, `labels` (`normalizeLabels`, ≤ 10), `assignees` (members present in `userMap`),
`dueDate`/`startDate` (calendar days), `storyPoints`, `parent`, `sprint`, `project` (target name),
`comments` (when asked), `checklist` (≤ 50 items), `links`, `number` (from `reserveTaskNumbers`).

### `Project` (no_change)

`name` (1..60), `nameKey` (lower-cased, unique per workspace), `key` (`/^[A-Z0-9]{2,6}$/`, given or
derived by `projectKeyFrom`).

### `Sprint` (no_change)

`name` (≤ `MAX_SPRINT_NAME`), `startDate` (import date), `endDate` (+ 14 days), `status` (`planned`),
`project` (target name).

### `Activity` (no_change)

`import.completed` already exists in `ACTIVITY_ACTIONS`; the commit writes it with source, created,
skipped and sprint counts.

### Flow

Preview → validate → `parseImport` → `loadMembers` → tally statuses/columns, types, people
(`matchMember` by email or name), labels, sprints → offer the workspace stages → answer the first 20
items and ≤ 50 warnings (item-limit warning first).
Commit → parse → refuse > 2000 items → `readMapping` (plain-data entries, validated values) →
permission and project checks → reserve numbers → batches of 500 inserts (workflow-mapped status,
normalised labels, calendar-day dates, capped comments/checklists/links, warning counters) → sprints
matched or created → `import.completed` → result payload; on error, delete tasks, then sprints, then a
project created by this request.

## API contracts

| Method | Path | Action | Auth | Requirements |
| --- | --- | --- | --- | --- |
| POST | `/api/workspaces/:slug/import/preview` | create | required (`tasks:write`) | FR-001, FR-002, FR-003, NFR-001, NFR-003 |
| POST | `/api/workspaces/:slug/import/commit` | create | required (`tasks:write`; `projects:write` for a new project or sprints) | FR-004…FR-009, NFR-001, NFR-002, NFR-004 |

Bodies: `{ source: 'csv'|'trello'|'jira', content: string }` for preview, and the same plus
`mapping` for commit (`server/src/controllers/importController.ts` documents both in its route
comments). Mount: `server/src/routes/workspaceRoutes.ts:248`, body limit `server/src/app.ts:83`.
Both routes are called by the logged-in client wizard, never by an external system.

## Security considerations

`plan.json → securityConsiderations`: `tasks:write`/`projects:write` gating with
`req.workspace._id` scoping (CON-106, CON-512); `cleanText` sanitising and capping every imported
string; the bounded request surface (items, characters, body size, batches, mapping entries); and
mapping objects read as plain data with validated values plus the atomic rollback (CON-516).

## Performance considerations

`plan.json → performanceConsiderations`: linear, capped parsing with a small preview response;
batched writes (500) with numbers reserved once and ≤ 30 sprints; text cleaned once while parsing; and
member/project/stage lookups loaded once per request instead of per item.

## Dependencies

`utils/workflow.ts`, `utils/taskNumbers.ts`, `utils/taskQuery.ts`, the path-specific JSON parser and
the Trello/Jira/spreadsheet exports themselves — see `plan.json → dependencies`.

## Risks

Large or hostile files (caps + rollback), silent data loss (counters and warnings), mapping keys
reaching the prototype (`entriesOf` + validated values) and concurrent imports (reserved numbers and
the unique project name index). Details in `plan.json → risks`.
