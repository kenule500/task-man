---
title: Upload a document and turn it into a project plan with AI
status: ongoing
version: v1
created: 2026-10-20
updated: 2026-10-23
---

# Upload a document and turn it into a project plan with AI

- **Feature:** `upload-document`
- **Version:** v1
- **Branch:** `feature/upload-document`
- **Base:** `main`

## Overview

### Problem Statement

A requirements document arrives as a PDF, DOCX, TXT or Markdown file, and the team still has to
translate it into a project by hand: project details, sprints, epics, tasks, subtasks and acceptance
criteria. The shipped "create a project with AI" flow removes that work, but it only knows how to
create a **new** project. When the work belongs to a project the team already uses, the person is
forced to create a duplicate project (and later merge or abandon it) or re-enter the backlog by hand.
The flow never asks where the plan should go, so the wrong destination is only discovered after the
project exists.

### Proposed Solution

Keep the existing four-step flow — upload, analyze, review, create — and add an explicit
**destination choice** on the upload step:

1. **Create a new project** (the default, current behaviour): the AI proposes the project name, key,
   description and colour alongside the plan, and creating writes the project and everything in it.
2. **Add to an existing project:** the person picks a non-archived project in the workspace from a
   searchable selector. The AI still reads the document and produces sprints, epics, tasks, subtasks
   and acceptance criteria, but the plan's project block is ignored; creating adds only those records
   to the chosen project and leaves the project itself, its existing sprints/tasks and its settings
   untouched.

The choice is stored on the plan (`targetProjectId`, `null` for a new project), is shown on the review
step, and can be changed there without regenerating the plan. Creation stays all-or-nothing on both
paths: the existing project is never deleted, and only records created by the failed request are
rolled back.

The image's flow is the baseline: drag-and-drop upload, a file chip with size, "Analyze with AI", AI
reading the document, generated project details, sprints, tasks and subtasks, acceptance criteria,
preview tabs (Sprints, Tasks, Subtasks, Acceptance Criteria) and a sprint accordion. Those parts are
already implemented in `client/src/features/ai-plan` and `server/src/utils/ai/plan`; this spec governs
them and adds the destination decision. No new third-party dependency is expected.

In addition, this version makes the installation's AI provider a configuration choice rather than
hard-coded Qwen: an operator selects a preset (Qwen, DeepSeek, OpenAI, OpenRouter or a custom
OpenAI-compatible endpoint), supplies the key and may override the base URL and model. The existing
`DASHSCOPE_*` variables keep working as Qwen aliases. Per-workspace provider choice and
bring-your-own keys are not part of this version.

### Target Audience

Workspace members who hold `projects:write` and `tasks:write` and receive product requirements as
documents: product owners, scrum masters, tech leads and developers setting up delivery work. The
existing-project path is aimed at teams that already run a project in TaskMan and want the new scope
to land in its backlog instead of a parallel project.

### Assumptions

- The baseline described above is already shipped; this version specifies it so it is governed, and
  treats it as `reuse` when planning. The genuinely new scope is the destination choice and the
  existing-project creation path.
- Permission requirements do not change: the flow remains limited to people with `projects:write` and
  `tasks:write`, because a plan always contains sprints (project structure) as well as tasks.
- A target project must belong to the same workspace. Moving work between workspaces is out of scope.
- The plan's generated project block stays in the stored plan (the schema requires it) but is ignored
  when the destination is an existing project; no project name/key conflict applies on that path.
- Existing sprints and tasks in the target project are never edited, reordered, completed or deleted;
  generated sprints are added alongside them, and duplicate sprint names are suffixed.
- The final destination is decided when the person presses the create action; the create request may
  override the destination stored at upload, so a mistake is recoverable without paying for another
  generation.
- The document is untrusted input and may contain prompt injection; the existing fencing and
  data-only declaration remain in force.
- The installation selects one AI provider for every workspace in this version; a workspace cannot
  override the provider, endpoint or model.

### Out of Scope

- Multiple documents, pasting raw text, importing from a URL, OCR for scanned PDFs/images or
  spreadsheet intake. This version keeps one PDF/DOCX/TXT/Markdown file.
- Collaborative review (share links, comments, approvals), plan diffing, confidence scoring,
  duplicate detection, capacity warnings beyond the current team-size hint, PII redaction and
  token/cost estimates.
- Editing or replacing the target project's name, key, description, colour, icon, members, settings,
  existing sprints or existing tasks.
- Previewing workflow statuses (Done, In Progress) in the generated plan: nothing exists yet, so all
  created tasks start at the workspace workflow's starting stage. Status badges appear only after
  creation, in the project views.
- Choosing a target outside the workspace, cross-workspace moves, or creating a project and then
  moving the generated records into it.
- Deleting, archiving or merging the target project when a plan is discarded.
- Per-workspace or per-user provider/model selection, bring-your-own keys, provider fallback or
  routing, cost/quota dashboards, and native Anthropic/Gemini adapters (Claude is usable through
  OpenRouter) — the installation chooses one provider for everyone.
- Changing the prompt, plan schema, destination behaviour, limits or the four-step flow; this update
  only changes which provider and model answer the requests.

## Scope of This Version

| Area | Status in v1 |
| --- | --- |
| Drag-and-drop upload, accepted formats, file chip, option fields, AI analysis, review tabs, sprint accordion, inline editing/undo, create-new-project path, rollback, 30-day retention, en/fr/ar copy | Already shipped — reused and governed by this spec (the image's flow) |
| Destination prompt (new vs existing), searchable target selector, target persistence and change, add-to-existing creation, sprint-name deduplication, confirmation dialog, target error codes | New in this version |
| Install-level AI provider presets (`AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`), legacy `DASHSCOPE_*` aliases, provider/model disclosure in settings and on upload | New in this version |

## User Stories

### US-001 — Upload a requirements document and set the planning options

As a workspace member, I want to drag a requirements document in and set how the plan should be
shaped, so that the AI has what it needs to produce a plan that fits our team.

**Acceptance Criteria:**

- AC-001: The upload step accepts one PDF, DOCX, TXT or Markdown (`.md`/`.markdown`) file by
  drag-and-drop or the file picker; it refuses `.doc`, other extensions, empty files and files above
  the configured limit (4 MB by default) with a readable reason before upload, shows the chosen file's
  name and formatted size with a remove action, and disables "Analyze with AI" while no valid file is
  chosen, AI is off for the workspace, or the daily plan limit is reached.
- AC-002: The upload step sends project name (at most 60 characters), project key (2–6 letters or
  digits), sprint length (1–4 weeks), start date (today or later), team size (1–200), language
  (English, French or Arabic) and notes (at most 500 characters) as multipart fields; invalid values
  are refused in the form and again by the server, and the same file and options are kept for a retry
  after a failure.

### US-002 — Choose where the generated plan goes

As a workspace member, I want to be asked whether the plan should create a new project or be added to
an existing one, and to pick the target, so that I do not end up with a duplicate project when the
work belongs in a project we already have.

**Acceptance Criteria:**

- AC-003: The upload step presents a labelled, keyboard-operable choice between "Create a new
  project" (default) and "Add to an existing project"; choosing the latter reveals a searchable
  selector of the workspace's non-archived projects showing name and key, excludes archived
  projects, explains when there are none while keeping "Create a new project" available, and blocks
  submission until a target is selected.
- AC-004: The destination is stored on the plan (`targetProjectId`, `null` for a new project) and
  survives a reload/resume; the plan detail returns the resolved target (`_id`, `name`, `key`,
  `archived`) or `null`; the review step names the destination, and the person can switch between a
  new project and another active project before creating without regenerating the plan.

### US-003 — Review and edit the generated plan

As a workspace member, I want to inspect the plan by sprints, tasks, subtasks and acceptance criteria,
fix anything wrong, and see where it will land, so that what gets created matches the document and our
standards.

**Acceptance Criteria:**

- AC-005: The review step shows the generated project, sprints, epics, items (type, priority, story
  points) and counts, with tabs for Sprints, Tasks, Subtasks and Acceptance Criteria; the Sprints tab
  lists each sprint's name, goal, date range and items in an accordion; titles, descriptions, goals
  and criteria can be edited inline, items can be removed with an undo toast, and validation problems
  block creation; for a new project the project name/key/description/colour are editable, while for
  an existing target they are replaced by a read-only "Adding to <name> (<key>)" summary.
- AC-006: While generating, the screen reports queued/running, polls until ready, offers cancel, and
  explains a timeout; a ready plan offers regenerate (same file and options, when the browser still
  holds the file) and discard (with confirmation when there are unsaved edits); the 30-day retention
  of the plan and the fact that the document itself is not stored are stated before upload.

### US-004 — Create a new project from the plan

As a workspace member, I want the whole plan created in one step, so that the project is ready to work
in without retyping.

**Acceptance Criteria:**

- AC-007: Creating with "new project" writes the project, its sprints, epics, tasks, subtasks and
  acceptance criteria atomically, reserves task numbers, uses the workspace workflow's starting stage,
  records `project.created`, `sprint.created` per sprint and `ai.plan_created`, rolls everything back
  on failure, refuses a taken name or key with 409 plus a suggestion, and returns
  `{ project, counts, destination: "new" }`; a second submit cannot create twice.

### US-005 — Add the generated plan to an existing project

As a workspace member, I want the sprints, tasks, subtasks and criteria added to a project we already
use, without changing that project, so that the AI plan lands in the right place and we keep our
existing work.

**Acceptance Criteria:**

- AC-008: The server validates a target project at upload and again at create: the id must be a valid
  ObjectId, the project must exist in the caller's workspace and must not be archived; failures answer
  400 `TARGET_INVALID`, 404 `TARGET_NOT_FOUND` or 409 `TARGET_ARCHIVED`/`TARGET_UNAVAILABLE`, write
  nothing, and leave the plan ready so another target can be chosen.
- AC-009: Creating with an existing target writes only the plan's sprints (with names deduplicated
  against the target's existing sprint names), epics, tasks, subtasks and acceptance criteria into
  that project; it does not create or modify a project, its name/key/description/colour/icon/members/
  settings, or any existing sprint or task; tasks carry the target project's name, the workspace's
  starting stage and reserved workspace task numbers; the plan's own project block is ignored;
  `plan.projectId` becomes the target and the response is `{ project, counts, destination:
  "existing" }` with `ai.plan_created` and `sprint.created` activity entries.
- AC-010: Creating into an existing project labels the primary action with the target and item count
  and asks for confirmation naming the target and the sprint/task/subtask/criteria counts; the create
  claim still prevents a double submit; a failure deletes only the tasks and sprints created by that
  request and never the target project or its pre-existing records; if the target became unavailable
  or the caller lost `projects:write`/`tasks:write`, the request fails with a readable code and the
  plan stays ready.

### US-006 — Use the flow safely in any language and with a keyboard

As a workspace member using a keyboard, a screen reader, French or Arabic, I want the new destination
step to work in my language and input method, so that I can use the feature without a mouse and
understand exactly where the plan goes.

**Acceptance Criteria:**

- AC-011: The destination choice and project selector are reachable and operable by keyboard, have
  visible focus and programmatic labels, announce errors, meet the touch-target rules on small
  screens, read correctly in RTL, and all new copy exists in English, French and Arabic.
- AC-012: The uploaded document's text is held in memory for generation only; the stored plan keeps
  the filename, MIME type, size, character count, truncation flag and at most a 2,000-character
  preview, never the document; the preview is cleared when the plan is deleted or cancelled; plans
  expire after 30 days; document text, prompts and model output are not written to logs or activity
  entries.

### US-007 — Choose the AI provider at installation level

As a self-hosting administrator, I want to choose the AI provider and model through documented
environment presets, so that the installation can use DeepSeek, OpenAI, Claude through OpenRouter,
Qwen or another compatible endpoint without code changes or sending data to a vendor my organisation
has not approved.

**Acceptance Criteria:**

- AC-013: Given only `AI_PROVIDER` and `AI_API_KEY` (with optional `AI_BASE_URL` and `AI_MODEL`),
  when the server resolves its AI settings, then the preset supplies the endpoint and model defaults,
  both AI code review and document plans use that single resolved configuration, and an unknown
  provider, missing key, missing model or non-HTTPS endpoint leaves AI unavailable with a readable
  reason instead of crashing or attempting a request.
- AC-014: Given an existing installation that sets only `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL` and
  `DASHSCOPE_MODEL`, when it upgrades, then Qwen remains the provider with the same behaviour and no
  new variable is required; when both families are set, `AI_*` wins deterministically, and no API
  response, server log or client bundle contains the key.
- AC-015: The workspace AI settings card and the document upload notice name the configured provider
  and model (for example "DeepSeek · deepseek-chat"), the unavailable notice tells an administrator
  which variables to check, and all changed copy exists in English, French and Arabic.

## Requirements

### Functional Requirements

- FR-001: The upload step MUST accept one PDF, DOCX, TXT or Markdown file by drag-and-drop or picker,
  enforce the extension/MIME allow-list, the non-empty rule and the configured size limit, show the
  file chip with name and formatted size, allow removal, and disable submission while the file is
  invalid, AI is unavailable or the daily limit is reached.
- FR-002: The upload step MUST collect project name (at most 60 characters), project key (2–6
  alphanumeric), sprint length (1–4 weeks), start date (today or later), team size (1–200), language
  (en/fr/ar) and notes (at most 500 characters), validate them on the client and server, and keep the
  file and options for retry.
- FR-003: The upload step MUST prompt for a destination with "Create a new project" as the default and
  "Add to an existing project" requiring a target chosen from the workspace's non-archived projects
  (name and key, searchable), with an empty state that keeps the new-project path available.
- FR-004: The chosen destination MUST be stored with the plan (`targetProjectId`, `null` for new),
  returned resolved in the plan detail (`_id`, `name`, `key`, `archived`), shown on the review step,
  and changeable before creation without regenerating the plan.
- FR-005: Uploading MUST queue a background generation (202) with one active plan per person and
  workspace, the daily workspace limit, the configured character budget and timeout; the document MUST
  be fenced as untrusted data in the prompt; the client MUST poll, allow cancellation and explain
  stale/timeout states.
- FR-006: The review step MUST preview the plan in Sprints/Tasks/Subtasks/Acceptance Criteria tabs with
  counts, a sprint accordion (name, goal, dates, items), inline editing, removal with undo and
  blocking validation; it MUST show project fields only for a new project and a read-only target
  summary for an existing one.
- FR-007: Creating a new project MUST write the project, sprints, epics, tasks, subtasks and criteria
  atomically, reserve task numbers, apply the workspace's starting stage, record activity, roll back
  on failure, refuse a taken name/key with 409 and a suggestion, and guard against a double submit.
- FR-008: The server MUST validate an existing target at upload and at create for ObjectId shape,
  membership in the caller's workspace and non-archived state, with distinct 400/404/409 codes, no
  writes on failure and the plan left ready.
- FR-009: Creating into an existing project MUST add only the plan's sprints, epics, tasks, subtasks
  and criteria to that project, deduplicate sprint names against the target's existing names, leave
  all project fields, members, settings and existing sprints/tasks untouched, ignore the plan's
  project block, set `plan.projectId` to the target and return the target with counts and
  `destination: "existing"`.
- FR-010: Both creation paths MUST claim the plan atomically, create records in batches, and on failure
  delete only the records created by that request (including a newly created project on the new path)
  while never deleting a pre-existing target or its records; a created plan cannot be created again.
- FR-011: Creating into an existing project MUST label the primary action with the target and item
  count and ask for confirmation listing the target and the sprint/task/subtask/criteria counts, with
  a cancel that writes nothing.
- FR-012: The destination controls and all new copy MUST be keyboard operable, labelled,
  focus-visible, screen-reader friendly, RTL-correct and available in English, French and Arabic.
- FR-013: The server MUST resolve the AI configuration from `AI_PROVIDER` (`qwen`, `deepseek`,
  `openai`, `openrouter` or `custom`), `AI_API_KEY`, optional `AI_BASE_URL` and optional `AI_MODEL`;
  each preset MUST supply a base URL and default model, the explicit overrides MUST win, and `custom`
  MUST require a base URL and a model. Every model call — code review and document plans — MUST use
  the one resolved configuration.
- FR-014: The server MUST keep `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL` and `DASHSCOPE_MODEL`
  working as Qwen aliases, and `AI_*` MUST take precedence when both families are set, so an existing
  installation upgrades without configuration changes.
- FR-015: Invalid provider configuration MUST NOT stop the API or reach the network: an unknown
  provider, an absent key (unless a `custom` endpoint is keyless), an absent model or an unsupported
  base URL MUST mark AI unavailable and expose a non-secret reason an administrator can act on.
- FR-016: The AI settings response and the workspace settings card MUST expose the resolved provider
  id/label and model; the upload notice MUST name that provider instead of a hard-coded vendor; and
  the unavailable copy MUST list the accepted `AI_PROVIDER` values and the variables to set, in
  English, French and Arabic.
- FR-017: A provider change MUST take effect for both AI code review and document plans on the next
  request after a server restart, with no database migration, workspace setting change or change to
  existing plans and reviews.

### Non-Functional Requirements

- NFR-001: Every route MUST keep `protect` and `requirePermission('projects:write')` plus the
  `tasks:write` check, and every target lookup MUST be scoped to `req.workspace._id`; a target outside
  the workspace MUST be indistinguishable from a missing one. *(CON-512)*
- NFR-002: File uploads MUST enforce the MIME/extension allow-list, pass the stored name through
  `sanitizeFilename`, apply multer file/field limits, and validate `targetProjectId` as an ObjectId
  through express-validator before it reaches a query; no user value may be interpolated into a raw
  query. *(CON-507, CON-515, CON-516)*
- NFR-003: The document MUST remain fenced with a random boundary and declared as data in the prompt;
  generated text MUST be rendered as React text (no `dangerouslySetInnerHTML`), and secrets that
  appear in the document MUST not be echoed into the plan. *(CON-517)*
- NFR-004: The document text MUST NOT be persisted; only filename, MIME type, size, character count,
  truncation flag and a preview of at most 2,000 characters are stored; the preview MUST be cleared on
  delete/cancel and the plan MUST expire after 30 days. *(CON-501, CON-504)*
- NFR-005: The feature MUST reuse the platform's Helmet headers, API rate limiting, HTTPS/HSTS and
  validated environment configuration; CSRF remains not applicable because authentication is
  header-based with no cookies. *(CON-513, CON-514, CON-519, CON-520; CON-518 not applicable)*
- NFR-006: The flow MUST follow `DESIGN.md`'s accessibility and i18n rules: keyboard alternatives,
  visible focus, at least 40px touch targets below `md` (44px for the tab bar, disclosure triggers and
  menu rows), all strings through i18next in en/fr/ar, and logical direction utilities for RTL.
  *(DESIGN.md §Interaction & accessibility, §Internationalization; CON-703)*
- NFR-007: One generation MUST stay bounded: 4 MB upload by default, 60,000 characters to the model,
  at most 8 sprints, 12 epics, 120 items, 300 subtasks and 6 criteria per item, 20 generations per
  workspace per UTC day, and a 200-second generation timeout; the request MUST answer 202 and the
  client polls about every 2 seconds.
- NFR-008: Creation MUST be atomic and idempotent on both paths: the plan is claimed before writes,
  inserts run in batches, the created records are tracked, and a rollback removes only those records;
  a pre-existing target and its records are never part of the rollback.
- NFR-009: The API key MUST remain server-side only: it MUST NOT be returned by any endpoint, written
  to logs or activity, embedded in client code, or committed; `.env.example` MUST document every new
  variable with empty placeholders, and the existing `.env` ignore rules MUST stay in force.
  *(CON-501, CON-504, CON-505, CON-519)*
- NFR-010: Preset defaults and validation MUST live in one pure server module that can be unit tested
  without network access; provider calls MUST keep the existing zod validation, single repair retry,
  timeout, output-token and daily-limit bounds, so a weaker JSON model cannot bypass validation or
  create a retry loop.
- NFR-011: The provider/model disclosure MUST be readable text rather than colour alone, meet contrast
  rules, read correctly in RTL, and be keyboard reachable where it is actionable; all new copy MUST be
  available in English, French and Arabic. *(CON-305, CON-703)*

## UI/UX & Data Requirements

### UI/UX

- **Upload step** (`UploadStep`): above the document card, a destination fieldset with two radio
  cards — "Create a new project" (default) and "Add to an existing project". The existing option
  expands a searchable project selector (name + key, archived excluded, empty state with a link to
  create a project). The document card keeps the drag-and-drop area, accepted-format hint, file chip
  (name, formatted size, remove) and the "Analyze with AI" primary action.
- **Project options**: when "Create a new project" is selected, the existing name/key/sprint
  length/start date/team size/language/notes fields stay as they are. When "Add to an existing
  project" is selected, the name/key fields are hidden; the planning fields remain, and the selected
  target is shown as a summary chip with a "Change" action.
- **Review step** (`ReviewStep`): a destination banner above the project header — "New project:
  <name>" or "Adding to <name> (<key>)" with a "Change destination" action that opens the same choice
  inline. For an existing target the project name/key/description/colour controls are replaced by the
  read-only summary; the plan's tabs, sprint accordion, inline editing, undo, assumptions/risks and
  validation stay unchanged.
- **Create action**: for a new project, the existing "Create project" button. For an existing target,
  "Add <n> items to <project>" followed by a confirmation dialog that names the target and lists
  sprints, tasks (including epics), subtasks and criteria counts; cancelling writes nothing.
- **States**: AI off, AI unavailable, daily limit reached, no active projects, target archived or
  deleted during generation, target renamed, generation failed/timed out/cancelled, create refused.
  Each has a readable message in en/fr/ar and an action that makes sense (retry, choose another
  target, create a new project, open settings).
- **Small screens and RTL**: the destination cards stack, the selector is full width, controls meet
  the touch-target rules, and the layout uses logical spacing utilities so Arabic mirrors correctly.
- **Provider disclosure**: the workspace AI settings card shows the configured provider and model as
  read-only text (for example "DeepSeek · deepseek-chat"); the upload notice names the same provider
  instead of a fixed vendor. When AI is unavailable, administrators see which variables to check and
  the accepted `AI_PROVIDER` values; other members see the existing "ask an administrator" message.

### Data

- **`PlanUploadOptions`** (client) gains `destination: 'new' | 'existing'` and
  `targetProjectId: string | null`.
- **AiPlan `options`** (server) gains `targetProjectId: ObjectId | null`. Existing fields keep their
  limits: project name 60, project key 6, sprint length 1–4, start date `YYYY-MM-DD`, team size
  1–200, notes 500, language `en|fr|ar`.
- **Plan detail response** gains `targetProject: { _id, name, key, archived } | null`, resolved from
  `targetProjectId`; `null` when the project no longer exists. The list response may omit it.
- **Create request** accepts an optional JSON body `{ targetProjectId: string | null }`: absent means
  "use the plan's stored destination", `null` means "create a new project", a string means "add to
  that project". The server re-validates it and it wins over the stored value.
- **Create response** keeps `{ project, counts }` and adds `destination: 'new' | 'existing'`.
- **Activity entries**: `project.created` and `sprint.created` only on the new path; `ai.plan_created`
  on both, with the target project name and counts in `changes`.
- **Sprint names** for an existing target: deduplicated case-insensitively against the target's
  existing sprint names by appending ` (2)`, ` (3)`, … while keeping within the 60-character limit.
- **Error codes**: `TARGET_INVALID` (400), `TARGET_NOT_FOUND` (404), `TARGET_ARCHIVED` (409),
  `TARGET_UNAVAILABLE` (409 at create), plus the existing `FILE_TOO_LARGE`, `NO_FILE`, `BAD_UPLOAD`,
  `AI_DISABLED`, `AI_DAILY_LIMIT`, `PLAN_IN_PROGRESS`, `PLAN_NOT_READY`, `PLAN_ALREADY_CREATED`,
  `PROJECT_NAME_TAKEN`, `PROJECT_KEY_TAKEN` and `PLAN_INVALID`.
- **AI configuration** (server, resolved per request): `provider` id (`qwen`, `deepseek`, `openai`,
  `openrouter` or `custom`), display label, base URL, model, key presence and an `available` flag with
  an optional non-secret `problem` (`PROVIDER_UNKNOWN`, `KEY_MISSING`, `MODEL_MISSING`,
  `BASE_URL_INVALID`). `AI_*` wins over `DASHSCOPE_*`; the default provider stays Qwen when only the
  legacy variables are set.
- **AI settings response**: `GET /api/workspaces/:slug/ai` keeps `available`, `enabled`,
  `autoReview`, `model`, `dailyLimit`, `usedToday`, `githubTokenSet` and `plan`, and adds
  `provider: { id, label }` and `problem` when unavailable. It MUST NOT return the key or the base
  URL.

## Edge Cases & Error States

- EC-001: The workspace has no active project to add to. → The existing-project option explains there
  are none and offers a link to create one; "Create a new project" stays selected so the flow is not
  blocked.
- EC-002: The target is archived or deleted between upload and creation. → The create request answers
  `TARGET_ARCHIVED`/`TARGET_UNAVAILABLE`, writes nothing, and the plan stays ready; the review step
  shows which target failed and lets the person pick another or switch to a new project.
- EC-003: The target is renamed after upload. → The plan detail resolves the current name and key; the
  review banner and confirmation show the current values, and creation uses the current name.
- EC-004: The target already has a sprint with the same name as a generated one. → The new sprint is
  created with a numeric suffix; the existing sprint is untouched.
- EC-005: The target already has many sprints/tasks, or the plan hits the item/subtask limits. → The
  existing records are untouched; the normal plan limits still apply; the confirmation shows exactly
  how many records will be added.
- EC-006: The caller loses `projects:write` or `tasks:write` between upload and create. → 403 with a
  readable message; no writes; the plan stays ready for someone who still has access (or the owner
  after the permission is restored).
- EC-007: AI is disabled or the workspace daily limit is reached. → Upload is disabled with the
  existing notices; an in-flight generation that loses AI fails with `AI_DISABLED`; the plan can be
  discarded without creating anything.
- EC-008: The person changes the destination twice, then double-submits. → The first create claims the
  plan; the second answers `PLAN_ALREADY_CREATED` and cannot write a second set of records.
- EC-009: Both `AI_*` and `DASHSCOPE_*` are set with different values. → `AI_*` wins for the whole
  resolved configuration; the effective provider and model appear in settings so the operator can
  confirm what is in use.
- EC-010: `AI_PROVIDER` is unknown or a required value is empty. → AI is unavailable; the API still
  starts; settings and the upload page name the accepted providers and variables; no provider request
  is made.
- EC-011: The key and endpoint belong to different regions (for example a Qwen key against the wrong
  DashScope region), or the account cannot use the configured model. → The existing `AI_AUTH` or
  `AI_BAD_REQUEST` message is returned, nothing is created, the plan stays ready, and the
  administrator copy points at the base URL and model.
- EC-012: `AI_BASE_URL` uses plain HTTP. → It is rejected unless the provider is `custom` and the host
  is loopback (`localhost`, `127.0.0.1`, `::1`), so the key is never sent unencrypted.
- EC-013: `AI_MODEL` names a model the account does not have. → The provider's refusal maps to a
  readable error; the job fails without partial creation, and the operator can retry after changing
  the model.

## Security Baseline

The feature touches file upload, user input and an HTTP surface, so the constitution's Security
Baseline applies. Existing controls are reused; no new security dependency is introduced.

| Control | Status for this feature | How it is satisfied |
| --- | --- | --- |
| CON-511 Authentication | REQUIRED — reused | `protect` on the plan router; JWT + database sessions already cover every route. |
| CON-512 Authorization | REQUIRED — extended | `projects:write` + `tasks:write` remain; every target lookup is scoped to `req.workspace._id`, and a foreign target is reported as not found. |
| CON-513 Security Headers | REQUIRED — reused | `helmet()` is already applied in `server/src/app.ts`; no change. |
| CON-514 Rate Limiting | REQUIRED — reused | The existing API limiter covers `/api/workspaces/:slug/ai/plans`; the daily plan limit adds a domain-level cap. |
| CON-515 Input Validation | REQUIRED — extended | `express-validator` validates the new `targetProjectId` and the create body; upload options keep their existing chains. |
| CON-516 NoSQL / Injection | REQUIRED — extended | `targetProjectId` is validated as an ObjectId and cast before the Mongoose query; no raw query interpolation. |
| CON-517 XSS | REQUIRED — reused | AI output and document text render as React text; the document stays fenced and declared data-only in the prompt. |
| CON-518 CSRF | NOT APPLICABLE | Authentication is header-based (no cookies) and CORS is allow-listed, so there is no credential for a cross-site request to ride on. |
| CON-519 Environment Security | REQUIRED — extended | The new optional AI variables follow the same rules: only `.env.example` is tracked, placeholders carry no secrets, HTTPS is enforced for provider endpoints (loopback excepted for `custom`), and invalid AI configuration degrades to "unavailable" instead of logging the key. |
| CON-520 HTTPS / HSTS | REQUIRED — reused | Deployment remains HTTPS-only with Helmet HSTS and the existing trust-proxy setting. |

## Dependencies & Risks

### Dependencies

| Name | Type | Notes |
| --- | --- | --- |
| Existing AI plan service (`server/src/utils/ai/plan/{service,prompt,schema,create}.ts`) | internal | Reused for generation, validation, finalisation and creation; the existing-project branch extends `createProjectFromPlan`. |
| Existing AI provider (`server/src/utils/ai/provider.ts`) and config | internal | Reused; no new provider or model. |
| `unpdf` / `jszip` extraction (`utils/ai/plan/extract.ts`) | internal | Reused for PDF/DOCX text extraction; TXT/Markdown are read directly. |
| `multer` + `express-validator` | internal | Already installed; the new field is validated with them. |
| Project directory (`client/src/features/projects`, `useProjectDirectory`) | internal | Reused to list searchable, non-archived targets; server validates again. |
| Existing plan UI (`client/src/features/ai-plan`) | internal | Upload/review/create components are modified, not duplicated. |
| AI provider API | external | The selected OpenAI-compatible provider (Qwen, DeepSeek, OpenAI, OpenRouter or custom) and its key, shared by AI review and document plans; no new SDK. |
| Provider presets (`AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`) | internal | One resolved configuration for both AI features; Qwen, DeepSeek, OpenAI, OpenRouter (Claude, Gemini, Mistral) and custom endpoints. `DASHSCOPE_*` stays as an alias; no new dependency. |

### Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-001 | The plan is added to the wrong project, polluting a real backlog. | A visible destination choice, a review banner naming the target, an action label that includes the target and count, and a confirmation dialog listing exactly what will be added. |
| RISK-002 | A failure mid-creation leaves partial sprints/tasks, or a rollback deletes pre-existing work. | Claim the plan first, track only the ids created by this request, delete only those on failure, never include the target project or its existing records in the rollback, and batch inserts. |
| RISK-003 | A hostile document injects instructions or secrets into the plan. | Keep the random boundary, data-only declaration and secret-suppression rules in the prompt; render output as text; never echo credentials. |
| RISK-004 | The target changes between upload and creation (renamed, archived, deleted) or the person loses permission. | Re-validate at create, return distinct codes, leave the plan ready, and show the current target name from the detail response. |
| RISK-005 | A large plan overwhelms an existing project or duplicates sprint names. | Keep the plan limits, deduplicate sprint names against existing ones, show counts in the confirmation, and leave existing records untouched. |
| RISK-006 | A misconfigured preset makes the feature look broken or sends data to an unapproved vendor. | Resolve presets in one module, show the effective provider and model in settings, keep the API up with a readable unavailable reason, and document every value in `.env.example`. |
| RISK-007 | A custom base URL leaks the key over plain HTTP or points at an internal service. | Accept only HTTPS, with a loopback-only exception for keyless local `custom` endpoints; never accept the URL from the client and never return it. |
| RISK-008 | A provider with weaker JSON adherence or a smaller output limit degrades plans. | Keep zod validation and the single repair retry, keep output-token/timeout overrides, and document a recommended model per preset. |

## Verification (planned)

The Test Agent will map tests to AC-001…AC-015 during `/sdrive:test`. Expected coverage:

- Client unit tests for destination options, target filtering, changed-destination state, file
  validation, option validation and error copy.
- Client component tests for the upload destination fieldset, review banner/change action,
  confirmation dialog, keyboard operation and RTL rendering.
- Server unit/integration tests for target validation (invalid/foreign/missing/archived), creation
  into an existing project (records, project untouched, sprint dedupe, activity, response), rollback
  on both paths, idempotency and permission refusals.
- Server unit tests for preset resolution (each preset, overrides, legacy aliases and precedence,
  unknown provider, missing key/model, HTTP rejection, key never exposed) and for the settings
  response carrying the provider label.
- Client tests for provider/model disclosure in settings and on upload, including the unavailable
  administrator copy and en/fr/ar key parity.
- Browser check at 320px/768px/1024px, keyboard only, en/fr/ar, empty/loading/error states
  (CON-703).

> No external research was required: the architecture, limits, permissions and error vocabulary are
> taken from the existing implementation and the constitution. No new library or external standard is
> introduced.

---

## Update (2026-10-20) — OpenCode preset and Projects page actions

> **Superseding note.** This update replaces the `openrouter` member of the provider list in FR-013,
> the OpenRouter references in US-007, the Out of Scope note that says Claude is usable through
> OpenRouter, and the Dependencies and Risks rows that name OpenRouter. Those earlier rows are kept
> unchanged for history; FR-019 and the requirements below take precedence for this version. The
> first-class OpenRouter preset is removed; the generic `custom` preset remains available for any
> HTTPS OpenAI-compatible endpoint, including OpenRouter if an administrator configures it
> explicitly. The installation-wide default provider stays Qwen when `AI_PROVIDER` is unset.

### User Stories

#### US-008 — Create projects from the Projects page header

As a workspace member who can create projects, I want the Projects page to show only real project
folders and to offer both creation actions in the header, so that I can scan the grid quickly and
start a blank project or a document-based plan from the same place on any screen size.

**Acceptance Criteria:**

- AC-016: Given a workspace with at least one project, when a member with `projects:write` opens the
  Projects page, then the header shows "New project" and "Create with AI"; the project grid lists
  only real project folders and no dashed "New project" or "Create with AI" card; activating
  "Create with AI" opens `/{workspaceSlug}/projects/new/ai`; a member without `projects:write` sees
  neither action, and a member with `projects:write` but without `tasks:write` sees "New project"
  only.
- AC-017: Given no projects, a search with no matches, a loading state, an error, or archived
  projects, when the page renders, then no dashed creation card appears; the header actions remain
  available according to permission; the existing empty, no-match, loading and error messages still
  explain the state; and archived projects keep using the same grid.
- AC-018: At 320, 360, 768, 1024 and 1280 px, the page has no horizontal scroll; the header actions
  stack vertically below `sm` and sit side by side from `sm`; the project grid is one column below
  640 px, two columns from 640 px, three from 768 px and four from 1280 px; the search and sort
  controls stack below `sm`; every action is keyboard operable with visible focus, touch targets are
  at least 40 px below `md`, and the layout and copy read correctly in English, French, Arabic and
  RTL.

#### US-009 — Use OpenCode Console as an AI provider

As a self-hosting administrator, I want an `opencode` provider preset that defaults to OpenCode
Console and DeepSeek V4.1 Flash Free, so that I can use a free OpenAI-compatible model with one
provider value and without the first-class OpenRouter preset.

**Acceptance Criteria:**

- AC-019: Given `AI_PROVIDER=opencode` and a non-empty `AI_API_KEY`, when the server resolves its AI
  settings, then the provider id is `opencode`, the label is "OpenCode Console", the base URL is
  `https://opencode.ai/inference/openai/v1`, the model is `deepseek-v4.1-flash-free`, both AI code
  review and document plans use that configuration, and explicit `AI_BASE_URL`/`AI_MODEL` values
  still win; with a missing key, AI is unavailable with `KEY_MISSING`, no provider request is made,
  and the API still starts.
- AC-020: Given `AI_PROVIDER=openrouter`, when the server resolves its AI settings, then the provider
  is unknown, AI is unavailable with `PROVIDER_UNKNOWN`, and no request is made; the accepted
  provider list, settings and unavailable copy, `.env.example`, client provider type and
  documentation no longer contain `openrouter`; the `custom` preset remains available for any HTTPS
  OpenAI-compatible endpoint, including OpenRouter when an administrator configures it explicitly;
  no response, log or client bundle contains a key.
- AC-021: When `opencode` is active, the workspace AI settings card and the document upload notice
  name "OpenCode Console" and `deepseek-v4.1-flash-free`; the unavailable copy lists `qwen`,
  `deepseek`, `openai`, `opencode` and `custom`; all changed copy exists in English, French and
  Arabic and reads correctly in RTL.

### Requirements

#### Functional Requirements

- FR-018: The server MUST add an `opencode` preset with the label "OpenCode Console", base URL
  `https://opencode.ai/inference/openai/v1`, default model `deepseek-v4.1-flash-free` and a required
  API key; `AI_PROVIDER` MUST accept `qwen`, `deepseek`, `openai`, `opencode` and `custom`; explicit
  `AI_BASE_URL` and `AI_MODEL` MUST win; and both AI code review and document plans MUST use the same
  resolved configuration.
- FR-019: The server MUST remove the first-class `openrouter` preset and every OpenRouter-specific
  default, copy and documentation reference; `AI_PROVIDER=openrouter` MUST resolve as an unknown
  provider with `PROVIDER_UNKNOWN` and MUST NOT reach the network. The generic `custom` preset MUST
  remain for any HTTPS OpenAI-compatible endpoint, including OpenRouter if an administrator
  configures it explicitly.
- FR-020: The Projects page MUST show only real project folders in its grid and MUST NOT render the
  dashed "New project" or "Create with AI" cards; the page header MUST offer "New project" to members
  with `projects:write` and "Create with AI" to members with both `projects:write` and `tasks:write`;
  "Create with AI" MUST open `/{workspaceSlug}/projects/new/ai`; the empty, no-match, loading, error
  and archived states MUST keep their existing behaviour.

#### Non-Functional Requirements

- NFR-012: The Projects page MUST be responsive and accessible from 320 px upward: no horizontal
  scroll; header actions stack below `sm`; the grid is 1/2/3/4 columns at <640/640/768/1280 px;
  search and sort stack below `sm`; controls keep at least 40 px touch targets below `md`; every
  action is keyboard operable with visible focus; and all copy and layout work in English, French,
  Arabic and RTL. *(CON-305, CON-306, CON-703)*

### Edge Cases & Error States

- EC-014: `AI_PROVIDER=opencode` is set without `AI_API_KEY`, or the free model is rate-limited or
  unavailable. → A missing key reports `KEY_MISSING` with no request; a provider refusal maps to the
  existing readable AI error, the plan stays ready, and no partial project or task is created.
- EC-015: An existing installation still sets `AI_PROVIDER=openrouter` after the upgrade. → The
  provider is unknown, AI is unavailable with `PROVIDER_UNKNOWN`, the API still starts, and the
  administrator copy tells the operator to use `opencode` or a `custom` OpenAI-compatible endpoint;
  no request is made and no key is exposed.
- EC-016: The Projects page is opened at 320 px with no projects, long project names or a search with
  no matches. → The header actions stack without overflow, the grid is one column (or the
  empty/no-match state), the dashed creation cards are absent, and the page keeps its existing
  messages and keyboard access.

### Dependencies & Risks (update)

- **OpenCode Console API** (external): OpenAI-compatible endpoint
  `https://opencode.ai/inference/openai/v1`; `deepseek-v4.1-flash-free` is free for a limited time
  and requires an OpenCode Console API key. No new SDK; the existing `openai` client is reused.
  Source: <https://opencode.ai/docs/zen/> (accessed 2026-10-20).
- **`openai` SDK** (library): Already installed; reused unchanged for the new preset. No new
  dependency.
- **OpenRouter** (external): No longer a first-class preset. An administrator may still target it
  through `custom`; no project dependency is removed.

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-009 | The OpenCode free model is promotional, may be rate-limited, or may be retired or repriced. | Pin `deepseek-v4.1-flash-free` in the preset but document the overrides; require a key; show the effective provider/model; keep `custom` or another preset as a fallback; do not promise free availability. |
| RISK-010 | Removing the OpenRouter preset removes the first-class Claude path. | Document that `custom` can target an OpenAI-compatible gateway for Claude if the administrator chooses; do not claim first-class Claude support; keep the generic HTTPS endpoint validation. |
| RISK-011 | A free model retains or trains on TaskMan documents or code. | Document that the operator must choose a model with acceptable terms; OpenCode documents DeepSeek V4.1 Flash Free as zero-retention/no-training; keep AI off until a workspace opts in. |

### Verification (update)

The Test Agent will additionally map AC-016…AC-021 during `/sdrive:test`. Expected coverage:

- Projects page component tests for the header actions by permission, the absent dashed cards, the
  `/{workspaceSlug}/projects/new/ai` destination, and the empty/no-match/loading/error/archived
  states.
- Provider resolver tests for the `opencode` defaults, overrides, missing key, the removed
  `openrouter` value, the `custom` fallback, and the accepted-list copy.
- Browser checks at 320/360/768/1024/1280 px, keyboard only, en/fr/ar, on both the Projects page and
  the AI settings/upload surfaces.

---

## Update (2026-10-21) — Workspace-level BYOK and dashboard setup

> **Superseding note.** This update changes where AI credentials are configured. US-007, US-009,
> FR-013..FR-019 and NFR-009 describe the installation-level `AI_*` configuration and are kept for
> history. US-010, US-011, FR-021..FR-029 and NFR-013..NFR-016 below are authoritative for workspace
> AI. The installation environment no longer supplies provider credentials to a workspace; it still
> supplies daily limits and size bounds. No migration copies a server-wide key into a workspace, and
> there is no environment fallback: every workspace starts unconfigured until a member with
> `settings:manage` saves a provider and key. The OpenCode preset and the other presets remain, but
> the workspace administrator selects them and supplies the key.

> **Decision record.** One workspace configuration powers both AI code review and document plans.
> The configuration is workspace-only; `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` and the
> legacy `DASHSCOPE_*` aliases do not authorize workspace AI. `settings:manage` is the write
> authority. Presets are `qwen`, `deepseek`, `openai`, `opencode` and a validated `custom` HTTPS
> endpoint. The key is encrypted with the existing `secretBox` helper (CON-112), bound to the
> workspace id. External security guidance: OWASP
> [Server Side Request Forgery Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
> and [Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
> cheat sheets (accessed 2026-10-21).

### User Stories (update)

#### US-010 — Configure workspace AI with our own provider key

**As a** workspace administrator with `settings:manage`  
**I want** to choose the AI provider and save our own API key in Workspace Settings  
**So that** our workspace controls which vendor processes its code and documents, without the server
operator holding a shared key.

**Acceptance Criteria**

- **AC-022:** Given a member with `settings:manage`, when they open Workspace Settings → AI, then
  they can choose `qwen`, `deepseek`, `openai`, `opencode` or `custom`, see the preset endpoint and
  model, enter a new key, replace the saved key or remove it, optionally override the model and, for
  `custom`, provide an HTTPS base URL and model, save the configuration and run a connection test; a
  member without `settings:manage` cannot read the key, change the provider, save or remove it, and
  the settings form is not mounted for them.
- **AC-023:** Given a saved workspace configuration, when a member runs AI code review or creates a
  project from a document, then both features use that workspace's provider, model, base URL and
  decrypted key; a provider or model change takes effect on the next request without a server
  restart; and a workspace with no configuration returns `AI_NOT_CONFIGURED` without making a
  provider request, even when installation `AI_*` variables are present.
- **AC-024:** Given an absent key, a rejected key, a provider rate limit, a timeout or an invalid
  `custom` endpoint, when an administrator saves or tests the configuration or a member starts an
  AI action, then the response is a readable, non-secret error, no partial review, plan, project,
  sprint or task records are created, and the previously saved configuration remains unless the
  administrator explicitly replaced or removed it.
- **AC-027:** Given an existing installation that sets `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`,
  `AI_MODEL` or the legacy `DASHSCOPE_*` aliases, when this version is deployed, then workspace AI
  does not use those variables and no key is copied into any workspace; every workspace starts
  unconfigured until a `settings:manage` member saves a configuration; server-level daily limits,
  diff-size limits and upload limits still apply.
- **AC-030:** At 320 px, with keyboard only and in English, French, Arabic and RTL, the AI settings
  form is operable with visible focus, programmatic labels and announced validation errors; the key
  field is write-only and masked with a show/hide control; controls have at least 40 px touch targets
  below `md`; configured, unconfigured, testing, success and failure states are distinguishable
  without colour alone; and all new copy exists in all three locales.

#### US-011 — Trust workspace AI credentials and custom endpoints

**As a** workspace administrator or security reviewer  
**I want** the key to be write-only and encrypted, the endpoint to be safe, and the configuration
status to be visible  
**So that** I can verify the setup without exposing the credential or turning the server into a
proxy for internal services.

**Acceptance Criteria**

- **AC-025:** Given a saved key, when the settings response is read, then it contains only `keySet`,
  a last-four-character hint and non-secret metadata; the full key is never returned by any endpoint,
  written to logs or activity, embedded in the client bundle, or stored in plaintext; the encrypted
  value is bound to the workspace id so ciphertext copied to another workspace fails authentication.
- **AC-026:** Given an administrator removes the workspace AI configuration, when the removal
  succeeds, then the encrypted key and provider settings are cleared, AI code review and automatic
  review are turned off for that workspace, existing reviews and plans remain readable, and the
  activity entry records the action, provider and model but not the key or endpoint.
- **AC-028:** Given a saved or unsaved configuration, when the administrator activates "Test
  connection", then the server sends a minimal request that contains no workspace code, document
  text, task data or prompts; it returns success or a readable non-secret failure and records the
  result and time; the test is rate-limited and subject to the same endpoint validation as a real
  request.
- **AC-029:** Given a `custom` base URL, when it is saved, tested or used, then only an HTTPS URL
  without credentials, query or fragment is accepted; loopback, private, link-local, multicast,
  reserved and cloud-metadata destinations are rejected before any key is sent, redirects are not
  followed, and the resolved address is bound to the connection to prevent DNS rebinding. HTTP
  endpoints are rejected.

### Functional Requirements (update)

- **FR-021:** The server MUST store one AI configuration per workspace, containing the provider id
  (`qwen`, `deepseek`, `openai`, `opencode` or `custom`), the effective base URL and model, an
  encrypted API key, a non-secret key hint, the configuring user and timestamps, and the last test
  result; the configuration MUST be readable only within its workspace.
- **FR-022:** `settings:manage` MUST authorize saving, replacing, testing and removing the workspace
  AI configuration; other workspace members MUST see only availability, provider label and model;
  no route, log, activity entry or error MAY return the key, and the client MUST never receive it
  after submission.
- **FR-023:** The workspace administrator MUST select the existing presets; each preset MUST supply
  its endpoint and default model; explicit model overrides MUST be allowed; `custom` MUST require an
  HTTPS base URL, a model and an API key; no new provider SDK or third-party dependency is
  introduced.
- **FR-024:** The workspace configuration MUST be the sole source for AI code review and document
  plans; installation `AI_*` and legacy `DASHSCOPE_*` provider variables MUST NOT authorize or
  supply a fallback key for workspace AI; no server key is migrated into a workspace; a missing
  configuration MUST return `AI_NOT_CONFIGURED` before any provider request.
- **FR-025:** Both AI features MUST resolve the workspace configuration on each request; a saved
  change MUST apply to the next request without a restart; in-flight reviews and plans keep the model
  they started with; existing reviews and plans remain readable.
- **FR-026:** The key MUST be encrypted with `server/src/utils/secretBox.ts`, bound to the workspace
  id, and MUST NOT be stored in plaintext; replacing a key MUST overwrite the previous ciphertext;
  removing the configuration MUST delete it; a saved key is never prefilled into the form.
- **FR-027:** Removing the workspace AI configuration MUST atomically clear the encrypted key and
  provider settings and set `ai.enabled` and `ai.autoReview` to false; it MUST NOT delete existing
  reviews or plans; the activity entry MUST record the action, provider and model but no secret or
  endpoint.
- **FR-028:** The server MUST provide a rate-limited connection test that sends no workspace content
  and returns a non-secret result; `custom` endpoints MUST pass HTTPS, credential-free URL,
  private/reserved/metadata address and DNS-rebinding checks, redirects MUST NOT be followed, and
  HTTP endpoints MUST be rejected.
- **FR-029:** The Workspace Settings AI card MUST provide provider selection, endpoint/model
  disclosure, a write-only key field, save, test and remove actions, key-set and last-test status,
  and readable errors; it MUST NOT render for members without `settings:manage`.

### Non-Functional Requirements (update)

- **NFR-013:** Workspace AI keys MUST follow the existing secret-handling baseline: AES-256-GCM via
  `secretBox`, context-bound to the workspace, never in logs, activity, errors or client bundles,
  and never committed; key replacement and removal MUST be auditable without recording the secret.
  (CON-112, CON-501, CON-505, CON-519, NFR-009)
- **NFR-014:** Outbound AI requests to workspace-configured endpoints MUST be resistant to SSRF and
  DNS rebinding, use HTTPS, disable redirects, apply timeouts and size bounds, and send the key only
  in the provider authorization header to the validated destination. (OWASP SSRF Prevention Cheat
  Sheet)
- **NFR-015:** The settings card MUST meet CON-305/CON-306: keyboard operable, visible focus,
  programmatic labels, announced errors, 40 px touch targets below `md`, no horizontal scroll from
  320 px, English/French/Arabic and RTL.
- **NFR-016:** The change MUST NOT add a third-party dependency, MUST keep the existing daily limits
  and document/diff bounds, MUST keep the API bootable with legacy `AI_*` variables present, and
  MUST not require a data migration.

### Edge Cases & Error States (update)

- **EC-017:** A workspace has no AI configuration while the installation still sets `AI_API_KEY`.
  → AI is unavailable with `AI_NOT_CONFIGURED`, no provider request is made, the enable/auto-review
  controls are disabled, and the settings card tells a `settings:manage` member to configure a
  provider.
- **EC-018:** The saved key is rejected (401/403), the provider is rate-limited (429), the request
  times out, or the custom endpoint is malformed. → The admin or member sees a readable, non-secret
  error; no partial review, plan, project, sprint or task is created; the saved configuration remains
  for correction and can be replaced or removed.
- **EC-019:** An administrator removes the configuration while a review or plan is running. → The
  in-flight operation may finish or fail independently; the next request is `AI_NOT_CONFIGURED`;
  automatic review is off; existing records remain readable.
- **EC-020:** A custom URL uses HTTP, resolves to a private, link-local or cloud-metadata address, or
  redirects to one. → The URL is rejected before the key is sent, no provider request is made, and the
  admin sees a safe validation error.
- **EC-021:** Two workspaces use different keys and one changes or removes its configuration. → The
  other workspace is unaffected; a ciphertext copied from one workspace to another fails
  authentication because the context does not match.
- **EC-022:** A member's `settings:manage` permission is revoked while the form is open. → The save,
  test and remove calls return 403, no configuration changes, and the unsaved key is discarded by the
  client.
- **EC-023:** The key field is empty, whitespace-only or over the maximum accepted length. → The
  client and server reject it with a field error; the previous key is not replaced and the value is
  never echoed back.
- **EC-024:** Reviews or plans created under the previous provider remain in the workspace. → They
  remain readable with their stored model and results; no record is rewritten by the provider change.

### Dependencies & Risks (update)

- **Workspace AI provider configuration** (internal): one encrypted configuration per workspace,
  consumed by both AI code review and document plans.
- **`openai` SDK** (library): Already installed; reused unchanged for every preset. No new
  third-party dependency.
- **OWASP SSRF Prevention Cheat Sheet** (external guidance): URL validation, private-address
  rejection, redirect handling and DNS-rebinding guidance.
- **OWASP Secrets Management Cheat Sheet** (external guidance): secret storage, redaction, rotation
  and least-privilege guidance.

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-012 | A workspace administrator enters a custom endpoint that targets an internal service, cloud metadata or a redirect chain (SSRF). | Require HTTPS, reject credentials/query/fragment and private/reserved/metadata addresses, disable redirects, bind the resolved address to the connection, rate-limit tests, and reject HTTP entirely. |
| RISK-013 | The workspace key leaks through a response, log, activity entry, error message, client bundle or database backup. | Encrypt with `secretBox`, keep the key select:false and server-only, return only `keySet`/last four, redact provider errors, never log request bodies or headers, and add a secret scan to verification. |
| RISK-014 | The administrator who saved the key leaves the workspace, or the key is lost, so AI becomes unavailable. | Let any `settings:manage` member replace or remove the key; show the configuring user and last-test time; do not attempt key recovery; keep AI off until a new key is saved. |
| RISK-015 | Different providers have different retention, training and residency terms, and members may not know which one processes their code or documents. | Name the provider and model in the settings card and upload notice, keep AI off by default, require an explicit admin save, and make the admin responsible for the provider terms. |
| RISK-016 | Existing installations expect `AI_*` to keep working and are surprised when workspace AI is unconfigured after upgrade. | Keep the API bootable, mark the variables as legacy in `.env.example` and release notes, show an actionable `AI_NOT_CONFIGURED` state, and do not copy a server key into workspaces without consent. |

### Verification (update)

The Test Agent will map AC-022…AC-030 during `/sdrive:test`. Expected coverage:

- Server tests for workspace-scoped encryption, key replacement/removal, last-four hints, tenant
  isolation, `settings:manage` refusals, no key in responses/logs/activity, and no environment
  fallback.
- Server tests for preset resolution, custom URL validation, SSRF/private-address rejection,
  redirect refusal, DNS-rebinding defence, rate-limited connection tests, readable provider errors,
  and no partial review/plan/project records.
- Client tests for the AI settings card, write-only key field, provider/model disclosure, test and
  remove flows, permission gating, loading/error/empty states, and the `AI_NOT_CONFIGURED` copy.
- Browser checks at 320/360/768/1024/1280 px, keyboard only, en/fr/ar and RTL, plus a secret scan of
  the changed files.


## Update (2026-10-23) — The AI settings card covers every AI feature

> **Superseding note.** This update changes copy only. The card titled "AI code review" is the single
> provider and key configuration for all workspace AI: it powers pull-request reviews, document
> plans, and any AI feature added later. US-012, FR-030, NFR-017, AC-031..AC-033 and EC-025 below
> are authoritative for the card's label, description and switch. The stored settings shape, the API
> contract, the permission gate and the behavior of both features do not change.

### User Stories (update)

#### US-012 — Recognise the AI settings as the home for every AI feature

**As a** workspace owner or administrator  
**I want** one clearly named AI assistant section that lists what AI is used for in this workspace  
**So that** I configure the provider once without assuming it only affects pull-request reviews, and
future AI features do not need a new settings area.

**Acceptance Criteria**

- **AC-031:** Given a member with `settings:manage` opening Workspace Settings, when the AI card
  renders, then its heading reads "AI assistant", a bulleted list names the capabilities that exist
  (pull-request code review; creating a project from a requirements document) and the enable switch
  reads "Enable AI features"; the card does not describe itself as code review only.
- **AC-032:** Given the AI card, when the workspace has no provider configured, then the heading,
  the capability bullets and the enable switch still render with their normal copy, the bullets name
  only capabilities that exist, and no empty placeholder, variable name or review-only wording is
  shown.
- **AC-033:** Given English, French or Arabic, when the card renders at 320, 375, 768, 1024 or
  1280 px, then the heading, bullets and switch label are translated, the Arabic layout is RTL
  without horizontal overflow, and the keyboard focus order and accessible names are unchanged.

### Functional Requirements (update)

- **FR-030:** The Workspace Settings AI card MUST title itself "AI assistant", present its current
  capabilities as a bulleted list that includes pull-request code review and creating a project from
  a requirements document, and label the `ai.enabled` switch "Enable AI features". Its copy MUST NOT
  state or imply that the settings apply only to code review, and MUST stay generic enough that a
  future AI capability is added as a bullet without renaming the card.

### Non-Functional Requirements (update)

- **NFR-017:** The renamed copy MUST exist in English, French and Arabic and MUST keep CON-305/
  CON-306: keyboard operable, visible focus, programmatic labels, announced errors, 40 px touch
  targets below `md`, no horizontal scroll from 320 px, and RTL. The change MUST NOT add a
  dependency, alter the stored settings shape or the settings/test/save/remove API contract, or
  change who may see the card.

### Edge Cases & Error States (update)

- **EC-025:** A new AI capability is added later and reuses the same provider. Expected: it appears
  as an additional bullet in the same card; the "AI assistant" heading and the "Enable AI features"
  switch label stay unchanged, and no settings field or migration is added unless that capability
  needs its own toggle.

### Verification (update)

The Test Agent will map AC-031..AC-033 during `/sdrive:test`. Expected coverage:

- Component tests for the heading, the capability bullets and the switch label in English, French
  and Arabic, the permission gate, and the unconfigured state.
- Browser checks at 320/375/768/1024/1280 px, keyboard only, en/fr/ar and RTL, confirming no
  review-only wording remains on the card.

## Update (2026-10-23) — Document plans from a project page, and folder cards back on Projects

> **Superseding note.** This update reverses the P8 placement decision for the Projects page and
> narrows the new-project page. It supersedes FR-020, AC-016, AC-017 and EC-016 (which forbade the
> dashed cards and required header buttons) and removes the destination choice from the
> new-project page. US-013..US-015, FR-031..FR-033, NFR-018, AC-034..AC-042 and EC-026..EC-031 below
> are authoritative. The plan API keeps its optional `targetProjectId`; the stored plan shape, the
> create contract, the permission gates and the AI settings do not change.

### User Stories (update)

#### US-013 — Create a project from a document without choosing a destination

**As a** member who can create projects and tasks  
**I want** the document-to-project page to always create a new project  
**So that** I do not answer a destination question when the work is new.

**Acceptance Criteria**

- **AC-034:** Given the create-with-AI page, when the upload step renders, then no destination
  choice or existing-project picker is shown, the project name and key fields are always present,
  and the AI notice, file picker, options and recent plans keep their current behaviour.
- **AC-035:** Given a ready plan on that page, when the person creates it, then the create request
  targets a new project, the toast says the project was created, and the browser opens it.

#### US-014 — Add a document plan to the project I am looking at

**As a** member who can create projects and tasks  
**I want** to upload a requirements document from a project's page  
**So that** the plan's sprints, tasks, subtasks and criteria are added to that project without
creating a duplicate.

**Acceptance Criteria**

- **AC-036:** Given an active project, when a member with `projects:write` and `tasks:write` opens
  the project page, then the header shows an "Add from document" action beside the existing actions;
  the action is absent for a member missing either permission and for an archived project.
- **AC-037:** Given that action, when it is activated, then the four-step wizard opens on a
  project-scoped page; the upload step shows a read-only "Adding to <name> <key>" line where the
  destination choice used to be, no project name/key fields are shown, and the review step names the
  project and offers no way to change the destination.
- **AC-038:** Given a reviewed plan on the project-scoped page, when the person creates it, then the
  create request sends that project's id, the toast says the plan was added, the browser returns to
  the project, and the project's existing sprints and tasks are unchanged.
- **AC-039:** Given a project-scoped page opened with a plan id that was stored for another project
  or was already created, when the page loads, then it does not add that plan to the current project:
  it shows the plan's own destination and lets the person return to the project, and no write is
  sent to the wrong project.

#### US-015 — Start work from the Projects grid

**As a** member who can create projects  
**I want** the New project and Create with AI cards at the start of the project grid  
**So that** starting a project is the first thing I see and the grid keeps its folder design.

**Acceptance Criteria**

- **AC-040:** Given at least one active project, when a member with `projects:write` opens Projects,
  then the first items of the grid are the dashed "New project" card and, when the member also has
  `tasks:write`, the dashed "Create with AI" card, followed by the project folders in the chosen
  sort order; the header shows no duplicate creation buttons.
- **AC-041:** Given a search query, then the action cards are hidden and only matching folders remain;
  with no projects, the empty state offers both actions according to permission; archived projects
  are listed without action cards.
- **AC-042:** At 320, 375, 768, 1024 and 1280 px, the cards come first in DOM and visual order, keep
  40 px touch targets and visible focus, cause no horizontal scroll, are translated in English,
  French and Arabic, and work RTL; the AI card opens `/{workspaceSlug}/projects/new/ai`.

### Functional Requirements (update)

- **FR-031:** The create-from-document page MUST always create a new project. It MUST NOT render a
  destination choice, the existing-project picker, or destination-change controls; the project name
  and key fields MUST always be shown; the create request MUST target a new project.
- **FR-032:** The project details page MUST offer "Add from document" to members holding both
  `projects:write` and `tasks:write` when the project is active. The action MUST open a
  project-scoped version of the same four-step wizard whose destination is fixed to that project:
  no destination choice, no project name/key fields, the project named in the upload and review
  steps, the create request carrying that project's id, and success returning to the project.
- **FR-033:** The Projects page MUST render the dashed "New project" and "Create with AI" cards as
  the first items of the active project grid, New project first, gated by `projects:write` and by
  `projects:write` plus `tasks:write` respectively, and MUST NOT render duplicate creation buttons
  in the page header. The cards MUST be hidden while a search query is active, MUST not appear in the
  archived grid, and the zero-project empty state MUST offer both actions according to permission.

### Non-Functional Requirements (update)

- **NFR-018:** The new copy MUST exist in English, French and Arabic and MUST keep CON-305/CON-306:
  keyboard operable, visible focus, programmatic labels, 40 px touch targets below `md`, no
  horizontal scroll from 320 px, and RTL. The change MUST NOT add a dependency, alter the plan
  upload/create API contract, stored plan shape, permission model or AI settings, and MUST NOT store
  document text. The project-scoped route MUST apply the same permission gate as the create-with-AI
  page and MUST NOT trust a plan id from another project.

### Edge Cases & Error States (update)

- **EC-026:** The project is archived or deleted while the project-scoped wizard is open. Expected:
  create answers 404/409, the review step shows the target problem, the plan stays ready, and no
  partial sprint or task is written.
- **EC-027:** AI is unconfigured, turned off, or over the daily limit on the project page. Expected:
  the same notice as the new-project page, Analyze is disabled, and no request is sent.
- **EC-028:** A member loses `projects:write` or `tasks:write`, or opens the project-scoped URL
  directly without them. Expected: the header action disappears and the page shows the no-access
  state; no plan is started.
- **EC-029:** The project-scoped route is opened with a `?plan=` id from another project or one that
  was already created. Expected: the page does not add it to the current project; it shows the
  plan's own destination and offers return/discard, and no cross-project write is sent.
- **EC-030:** The Projects page has zero projects, only archived projects, a search with no matches,
  or 320 px width with long names. Expected: both actions in the empty state, no cards in the
  archived grid, cards hidden while searching, and no horizontal scroll.
- **EC-031:** A member has `projects:write` but not `tasks:write`, or is read-only. Expected: they see
  only the New project card/action, or no action cards at all, and the header stays free of
  duplicate buttons.

### Verification (update)

The Test Agent will map AC-034..AC-042 during `/sdrive:test`. Expected coverage:

- Component tests for the new-project page without a destination choice, the project-scoped wizard
  (fixed target, no name/key fields, create payload), the project-page action's permission and
  archived gates, and the two grid cards (order, permissions, search, empty state).
- Browser checks at 320/375/768/1024/1280 px, keyboard only, en/fr/ar and RTL, for both wizard
  modes and the Projects page.
