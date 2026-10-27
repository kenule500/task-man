# Releases: version planning, progress, the release action and generated release notes

> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `releases`
- **Version:** 1
- **Governance:** `.sdrive/governance/releases/v1/spec.json`
- **Status:** complete — every requirement below is implemented and covered by tests

## Overview

**Problem.** A team finishes work continuously but ships it in versions, and nothing represented that boundary: there
was no way to say which work is planned for the next version, how far that version is, when it is due, or what will be
in the notes when it goes out. Release notes were written by hand from memory, and an unfinished item was either
shipped silently or left in a list nobody owned.

**Solution.** A `Release` document (`server/src/models/releaseModel.ts`) belongs to a project and carries a version
label, optional start and release dates and a status of unreleased, released or archived. Tasks point at a release
through `task.release`, with the rules that a task joins an unreleased release of its own project, subtasks follow
their parent and epics cannot be assigned. `server/src/controllers/releaseController.ts` manages the versions and
computes progress from the tasks with the pure helpers in `server/src/utils/releaseNotes.ts`, including what happens
to unfinished work on release. Release notes are generated from the completed tasks grouped by type, and the roadmap
shows dated releases as milestones.

**Target audience.** Product owners and project managers planning version by version, release managers shipping a
version, and anyone reading the notes afterwards.

### Assumptions

1. *assumption: true* — a release belongs to exactly one project and its name is unique inside that project; there is
   no workspace-wide release train.
2. *assumption: true* — overdue is a UTC calendar-day comparison: a release is overdue only while it is unreleased and
   its release day is before today's UTC day.
3. *assumption: true* — progress counts top-level non-epic tasks only, because subtasks are part of their parent's
   estimate and epics are containers.
4. *assumption: true* — removing a task from a release leaves the task untouched otherwise; there is no separate
   "cut" state.

### Out of scope

- Release trains and coordination across several projects.
- Deployment or pipeline integration; marking a release as released is a manual action.
- Changelog aggregation over several releases, or sign-off approvals.
- Editing the generated notes (the panel lets you copy the Markdown out).

## User stories

### US-001 — Plan a version in a project
As a **product owner** I want **to create a release with a version label, a description and dates** so that **the team
knows which version is being prepared and when it is due**.

- **AC-001** A release is created in a project the caller can write to, with a name of at most 60 characters, an
  optional description of at most 2000 characters and optional dates; it starts as `unreleased`.
  (`validateCreateRelease`, `createRelease`)
- **AC-002** The release date must be on or after the start date, otherwise HTTP 400 "The release date must be on or
  after the start date"; the project must belong to the same workspace, otherwise "Project not found in this
  workspace". (`assertDates`, `resolveProject`)

### US-002 — See how far each release is
As a **project manager** I want **the progress of every release and which open ones are overdue** so that **I can tell
which version needs attention**.

- **AC-003** Each release reports counts and story points per status group (pending, in-progress, completed and the
  total) over its top-level non-epic tasks. (`summarizeProgress`, `progressTasks`)
- **AC-004** A release still unreleased whose release day is before today (UTC) is flagged overdue, and the UI shows
  the remaining or elapsed days next to the progress. (`isReleaseOverdue`, `describeReleaseDue`)
- **AC-005** The list can be limited to one project and is ordered unreleased, then released, then archived; inside a
  status, dated releases come first in date order, undated ones last, alphabetical by name. (`listReleases`)

### US-003 — Ship a release and decide about the unfinished work
As a **release manager** I want **to mark a release as released and choose what happens to unfinished tasks** so that
**the version closes honestly**.

- **AC-006** Only an unreleased release can be released; the status becomes `released` with `releasedAt` stamped, and
  a second attempt losing the race is refused with HTTP 409 "This release was changed by someone else".
  (`releaseRelease`)
- **AC-007** Unfinished top-level tasks stay in the release when no move is requested, leave the release when `null`
  is passed, or move to another unreleased release of the same project when an id is passed; subtasks follow their
  parent and each moved task is recorded in the activity log.
- **AC-008** A release can be archived, and reopening it (status `unreleased`) clears `releasedAt` so it can be
  released again. (`validateUpdateRelease`, `updateRelease`)
- **AC-009** Deleting a release keeps its tasks and removes their release, recording how many were unassigned.
  (`deleteRelease`)

### US-004 — Read the generated release notes
As a **product owner** I want **release notes that group the finished work by type, with task keys** so that **the
notes are ready when the version ships**.

- **AC-010** Notes are generated from the completed tasks, grouped as Features (story), Fixes (bug), Tasks (task) and
  Spikes (spike), each line led by its task key, with a heading carrying the name, a Released or Planned date and the
  description; the response has both the Markdown and the groups, and `?format=markdown` returns the Markdown alone as
  `text/markdown`. (`buildReleaseNotes`, `getReleaseNotes`)
- **AC-011** A release with no completed work says so (`_No finished work in this release yet._`) instead of an empty
  list, and the client renders the notes as parsed plain data so nothing in a task title can become markup.
  (`parseNotesMarkdown`, `ReleaseNotesPanel`)

### US-005 — See releases on a task and on the roadmap
As a **team member** I want **to assign my task to a release and to see release dates on the roadmap** so that **the
work I do is tied to the version it ships in**.

- **AC-012** The release select offers the unreleased releases of the task's project plus the release it already has
  (even a released or archived one), with "No release" first (`releaseOptionsFor`); a task can only join an unreleased
  release of its project, epics cannot join any, and subtasks follow their parent. (`resolveRelease`,
  `reconcileRelease`)
- **AC-013** Dated, non-archived releases of the selected project appear as milestone markers on the roadmap in date
  order, each with a text alternative, and choosing one opens the release page. (`releaseMarkers`,
  `describeReleaseMarker`)

## Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | `Release` stores workspace, project, name (1–60), lower-cased `nameKey`, description (≤2000), `startDate`/`releaseDate` (nullable), status (unreleased/released/archived) and `releasedAt`; the unique index `{ workspace, project, nameKey }` allows one release per name and project. | AC-001 |
| FR-002 | `validateCreateRelease` requires a Mongo id project and a non-empty name; `createRelease` resolves the project inside the workspace, asserts the date order, records `release.created` and answers 201 with the release and its (empty) progress. | AC-001, AC-002 |
| FR-003 | `updateRelease` edits name, description and dates and accepts only `archived` (archive) and `unreleased` (reopen, clearing `releasedAt`), refusing `released` with a message pointing at the release action; the date order is re-asserted and the change diffed into `release.updated`. | AC-002, AC-008 |
| FR-004 | `listReleases` returns the workspace releases (optionally one project) with their progress, sorted unreleased, released, archived and inside a status by date with undated last and ties by name. | AC-003, AC-005 |
| FR-005 | `getRelease` returns one release with its project (name, key, color, icon) and its top-level tasks with keys built from the project key and the task number, plus progress over the non-epic tasks. | AC-003 |
| FR-006 | `summarizeProgress` counts tasks and story points per status group (completed and in-progress keep their group, everything else counts as pending) and `isReleaseOverdue` flags an unreleased release whose release day has passed (UTC). | AC-003, AC-004 |
| FR-007 | `releaseRelease` requires `unreleased` (400 otherwise), validates `moveOpenTo` when present, changes the status with a conditional update (409 on a lost race), moves the unfinished top-level tasks and their subtasks to the target or to no release, records one `task.updated` per moved task and answers `{ release, movedTasks }`. | AC-006, AC-007 |
| FR-008 | `deleteRelease` clears `release` on all of the release's tasks, deletes it and records `release.deleted` with how many tasks were unassigned. | AC-009 |
| FR-009 | `buildReleaseNotes` writes a level-1 heading with the name, a Released (using `releasedAt` or `releaseDate`) or Planned date line, the description, then one section per type (story→Features, bug→Fixes, task→Tasks, spike→Spikes) listing completed tasks sorted by number with keys, or the italic placeholder; `getReleaseNotes` returns `{ markdown, groups }` or the Markdown alone with `?format=markdown`. | AC-010, AC-011 |
| FR-010 | The client releases module exposes types, api, hooks (`useReleases`, `useRelease`, `useReleaseStatus`) and helpers through `index.ts` and renders the project's Releases tab plus the release page; helpers live in `lib/progress.ts` (`releasePercent`, `describeReleaseProgress`, `formatReleaseDates`, `describeReleaseDue`, `suggestReleaseDates`, `suggestReleaseName`, `releaseOptionsFor`, `groupReleaseTasks`, `upcomingReleases`) and `lib/notesMarkdown.ts`. | AC-005, AC-011 |
| FR-011 | Task endpoints accept `release`: `resolveRelease` requires the release to be in the workspace, unreleased and of the task's project (a task without a project adopts the release's project) and refuses epics; `reconcileRelease` drops the release when the task moves to another project and subtasks follow their parent. | AC-012 |
| FR-012 | `releaseMarkers` places the dated, non-archived releases of the selected project on the roadmap axis in date order, `describeReleaseMarker` gives each marker a text alternative, selecting one navigates to the release page, and `TaskReleaseLabel` links a task's release to that page. | AC-013 |

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-001 | Every release query is scoped to one workspace (CON-106): `findRelease` looks up the id together with `workspace: req.workspace._id`, the project and tasks of a release are resolved with the same id, and the release of a task is validated against the caller's workspace. |
| NFR-002 | Routes are permission scoped (CON-512): `projects:read` for list, detail and notes; `projects:write` for create, update, delete and the release action; the client mirrors this with `can('projects:write')`. |
| NFR-003 | The rules that need neither HTTP nor the database are pure and unit tested (CON-109, CON-202, CON-402): `server/src/utils/releaseNotes.ts` and the client helpers `lib/progress.ts`, `lib/notesMarkdown.ts` and the roadmap marker helper. |
| NFR-004 | Generated notes cannot become markup (CON-517): the client parses the Markdown into plain data blocks and React renders them as text; no `dangerouslySetInnerHTML` exists in the module. |

Non-functional requirements carry no acceptance criteria of their own: they are enforced by the constitution rules
above and verified by the suites listed in *Verification*.

## Edge cases

| ID | Situation | Expected behaviour |
|---|---|---|
| EC-001 | Two releases of one project get the same name, including different casing. | The unique index on `{ workspace, project, nameKey }` rejects it and the API answers 409 "A release with this name already exists in the project". |
| EC-002 | A release is created or edited with a release date before its start date. | HTTP 400 "The release date must be on or after the start date"; clearing a date is allowed because the rule compares them only when both are set (`optional({ values: 'null' })`). |
| EC-003 | The release action is used on an already released or archived release. | HTTP 400 "Only an unreleased release can be released"; archive and reopen are the ways to change the status of a closed release. |
| EC-004 | `moveOpenTo` names the release itself, a released release, one of another project or an unknown id. | HTTP 400 "Open tasks can only move to another unreleased release of this project"; without `moveOpenTo` the unfinished tasks simply stay. |
| EC-005 | Two people release the same version at the same moment. | Only the first conditional update matches; the loser receives 409 "This release was changed by someone else" and no task is moved twice. |
| EC-006 | Notes are requested for a release with nothing completed. | The Markdown keeps the heading and dates and contains `_No finished work in this release yet._`; the groups array is empty and the panel shows the empty state. |
| EC-007 | The suggested next version label. | `suggestReleaseName` bumps the minor part of the highest parsable `vX.Y[.Z]` name (`v2.4.1` → `v2.5.0`) and falls back to `v1.0.0`; a name that is not a version is ignored. |
| EC-008 | A task already in a released release is opened in the task form. | The select still shows that release, labelled with its status, so the value is not silently lost, but only unreleased releases of the task's project can be chosen; the server refuses a released or archived target for a new assignment. |

## Dependencies

| Name | Type | Notes |
|---|---|---|
| `server/src/utils/activity.ts` | internal | `recordActivity`/`diffFields` supply the release lifecycle entries and one entry per moved task. |
| `server/src/controllers/taskController.ts` | internal | `resolveRelease`, `reconcileRelease` and `PUBLIC_USER_FIELDS` are shared with the release rules. |
| `client/src/features/tasks` | internal | The task list and detail host the release field and label; `lib/date` for the calendar-day handling of dates. |
| `client/src/features/planning` | internal | The roadmap axis and placement helpers are reused to draw release markers. |
| mongoose | library | Release documents and the unique `{ workspace, project, nameKey }` index. |

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| RISK-001 | Releasing moves tasks server-side while the client task list is a separate cache. | The releases tab and the release page call `onTasksChanged` after a release or a delete, reloading the task list as a sprint completion does. |
| RISK-002 | Notes are generated from the release's current tasks, so a task removed after shipping disappears from them. | Removing is an explicit, audited action; the panel shows the live state and lets you copy the Markdown out. |
| RISK-003 | A release can end up with no tasks after deletions or project moves. | `reconcileRelease` drops the release when a task changes project, deleting reports how many tasks were unassigned, and the notes show the empty placeholder. |

## Verification (retroactive)

| Test id | File | Command |
|---|---|---|
| TEST-001 | `server/src/__tests__/releaseNotes.test.ts` | `pnpm --filter server test` |
| TEST-002 | `server/src/__integration__/releases.test.ts` | `pnpm --filter server test:integration` |
| TEST-003 | `client/src/features/releases/__tests__/lib.test.ts` | `pnpm --filter client test` |
| TEST-004 | `client/src/features/releases/__tests__/components.test.tsx` | `pnpm --filter client test` |
| TEST-005 | `client/src/features/releases/__tests__/roadmapMarkers.test.ts` | `pnpm --filter client test` |
| TEST-006 | `server/src/__integration__/rbac.test.ts` | `pnpm --filter server test:integration` |

Integration tests need a local MongoDB (`MONGO_URI=mongodb://127.0.0.1:27017/task-man`, CON-407). Full gate:
`pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter
client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402). Browser check: the Releases tab at
`/{workspace}/projects/:projectId?tab=releases`, the release page at
`/{workspace}/projects/:projectId/releases/:releaseId`, the release select and label in a task, and the release
markers on `/{workspace}/roadmap` (empty, loading and error states; keyboard; narrow screens — CON-703).
