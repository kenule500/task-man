> **Status:** Ongoing — Gate 1 approved for the provider-preset update; Gate 2 pending. Destination implementation remains on `feature/upload-document`; browser verification is still pending.

# Plan — Upload a document and turn it into a project plan with AI

- **Feature:** `upload-document`
- **Version:** v1
- **Machine-readable plan:** `.sdrive/governance/upload-document/v1/plan.json`
- **Branch:** `feature/upload-document` (base `main`)

## Architecture

**Approach.** Make the destination a first-class property of the plan instead of an implicit
consequence of creation.

- The upload endpoint resolves an optional `targetProjectId` against the caller's workspace
  (ObjectId shape, existence, non-archived) and stores it on `AiPlan.options`. The detail response
  returns a resolved summary `{ _id, name, key, archived }`, so the review step can show where the
  plan will land and notice a target that changed.
- The create endpoint accepts an optional `{ targetProjectId }` body that wins over the stored value:
  absent uses the stored destination, `null` creates a new project, and a string adds to that
  project. Both values are validated again before the plan is claimed.
- Creation is split into one shared record writer — sprints, epics, items, subtasks, criteria,
  reserved task numbers, batches — and two thin orchestrators. The new-project path also creates the
  project and records `project.created`; the existing-project path skips project creation and
  name/key conflict checks, uses the target's id and name, deduplicates generated sprint names
  against the target's existing names, and records `ai.plan_created` plus `sprint.created`. Both
  paths track every id they write and roll back only those records.
- The client stores the destination in `PlanUploadOptions`, sends it with the upload, shows a
  destination banner on review, and lets the person switch targets before creation without
  regenerating. A confirmation dialog names the target and the exact counts.
- No new dependency is introduced: generation, extraction, validation, permissions and the security
  baseline are reused.

### Components

| Component | Action | Purpose |
| --- | --- | --- |
| `server/src/models/aiPlanModel.ts` | Modify | Add `options.targetProjectId` (`ObjectId`, ref `Project`, default `null`); keep retention and active-plan indexes. |
| `server/src/utils/ai/plan/target.ts` | Create | Parse an ObjectId, resolve a project inside the workspace and not archived, return a summary, throw `TARGET_INVALID` / `TARGET_NOT_FOUND` / `TARGET_ARCHIVED`. |
| `server/src/utils/ai/plan/sprints.ts` | Create | `dedupeSprintName` / `dedupeSprintNames`: case-insensitive `(2)`, `(3)` suffixes within the 60-character limit. |
| `server/src/utils/ai/plan/create.ts` | Modify | Extract the shared record writer; branch between `createProjectFromPlan` and `createIntoProjectFromPlan`; track ids and roll back per path. |
| `server/src/controllers/aiPlanController.ts` | Modify | Accept/validate the upload field, store it, resolve the target for the detail response, accept and validate the create override, return `destination`. |
| `server/src/routes/aiPlanRoutes.ts` | Modify | Add the create-body validator chain; keep `protect` + `projects:write` + `tasks:write`. |
| `server/src/utils/ai/plan/service.ts` | Modify | Add `targetProjectId` to `PlanOptionsInput` and `createQueuedPlan`; keep the feature-off, one-active-plan, daily-limit and stale-plan checks. |
| `server/src/utils/ai/plan/prompt.ts` | Modify | Tell the model when the plan is added to an existing project; the project block is ignored and the JSON shape is unchanged. |
| `client/src/features/ai-plan/types.ts` | Modify | Add `PlanTarget`, destination fields on `PlanUploadOptions`/`PlanOptions`, `AiPlan.targetProject` and `CreatedFromPlan.destination`. |
| `client/src/features/ai-plan/api.ts` | Modify | Send `targetProjectId` with upload fields; accept an optional override on create. |
| `client/src/features/ai-plan/lib/options.ts` | Modify | Default to `destination: 'new'`, `targetProjectId: null`. |
| `client/src/features/ai-plan/lib/destination.ts` | Create | Pure helpers: `activeTargets`, `targetOf`, `targetProblem`, `targetLabel`, destination change state. |
| `client/src/features/ai-plan/lib/plan.ts` | Modify | Let `planProblems` skip the generated project name/key when the destination is existing. |
| `client/src/features/ai-plan/lib/errors.ts` | Modify | Map the four target codes to readable copy. |
| `client/src/features/ai-plan/components/ProjectPicker.tsx` | Create | Searchable, keyboard-operable project selector with name + key, loading/empty states and listbox semantics. |
| `client/src/features/ai-plan/components/DestinationPicker.tsx` | Create | Two radio cards (new default, existing) with the picker revealed for existing. |
| `client/src/features/ai-plan/components/UploadStep.tsx` | Modify | Render the destination choice, hide project name/key for an existing target, require a target, keep file/option errors. |
| `client/src/features/ai-plan/components/PlanHeader.tsx` | Modify | Add a read-only target mode with an "Adding to …" summary. |
| `client/src/features/ai-plan/components/ReviewStep.tsx` | Modify | Destination banner/change action, read-only header, target-aware validation, confirmation with counts. |
| `client/src/features/ai-plan/hooks/useAiProjectPlan.ts` | Modify | Accept a create override and keep the destination in `PlanRequest` for retry/regenerate. |
| `client/src/pages/AiProjectPage.tsx` | Modify | Pass projects/loading/reload, create with the chosen target, toast created vs added, reload the directory. |
| `client/src/features/ai-plan/index.ts` | Modify | Export the new helpers and pickers. |
| `client/src/i18n/locales/{en,fr,ar}/aiPlan.json` | Modify | Destination, selector, banner, change, confirmation, added toast and target error copy in all three languages. |
| `client/src/features/projects/context/ProjectsContext.ts` | Reuse | `useProjectDirectory` supplies workspace projects and the archived flag; the server validates again. |
| `server/src/utils/ai/plan/schema.ts` | Reuse | `editedPlanSchema`/`finalizePlan`/limits validate both paths; the project block is simply not applied. |
| `server/src/utils/ai/plan/extract.ts` | Reuse | PDF/DOCX/TXT/Markdown extraction, size limits and document error codes are unchanged. |
| `server/src/utils/workflow.ts`, `server/src/utils/taskNumbers.ts` | Reuse | Starting stage and reserved task numbers for the target project. |
| `server/src/utils/activity.ts` | Reuse | `ai.plan_created`, `project.created` and `sprint.created` already exist. |

### Flow

1. **Upload.** Validate the file and options as today. If `targetProjectId` is present, validate it as
   an ObjectId, resolve it inside `req.workspace._id`, refuse a missing or archived project, store
   the id in `AiPlan.options`, and include the resolved target in the response.
2. **Generate.** Unchanged, except the prompt is told when the plan will be added to an existing
   project. The plan's project block remains but is not applied.
3. **Detail.** Resolve `options.targetProjectId` to `{ _id, name, key, archived }` or `null`, so a
   reload renders the banner and notices a deleted or archived target.
4. **Create.** Read the optional body override (absent = stored, `null` = new, string = target),
   resolve and validate it before claiming, claim the plan atomically, validate the edited plan, then
   branch.
5. **New path.** Create the project, check name/key conflicts, write sprints and task drafts in
   batches with reserved numbers, record `project.created`, `sprint.created` and `ai.plan_created`,
   set `plan.projectId`, and return `destination: "new"`.
6. **Existing path.** Skip project creation and the name/key checks, load the target's sprint names,
   create the plan's sprints with deduplicated names, write the same task drafts with the target's id
   and name, leave every existing project/sprint/task field untouched, record `sprint.created` and
   `ai.plan_created` with the target, set `plan.projectId` to the target, and return
   `destination: "existing"`.
7. **Failure.** Both paths delete only the ids they created (plus the new project on the new path).
   The claim is released and the plan stays ready.

## Data Model

| Entity | Action | Changes |
| --- | --- | --- |
| `AiPlan` | Update | Add `options.targetProjectId` (`ObjectId \| null`, ref `Project`, default `null`). Existing options, `plan`, `projectId` and retention fields are unchanged. |
| `Project` | No change | `name`, `key`, `archived`, `description`, `color`, `icon`, `members` are read for validation, never written on the existing path. |
| `Sprint` | No change | `name` is deduplicated against the target's existing names (`(2)`, `(3)`, …); `startDate`, `endDate`, `status: 'planned'`, `project` use existing fields. |
| `Task` | No change | Existing title/description/type/priority/storyPoints/labels/status/stage/project/sprint/epic/parent/acceptanceCriteria/position/number fields; `project` is the target name on the existing path. |
| `Activity` | No change | Existing `ai.plan_created`, `project.created`, `sprint.created` actions; the target name and counts go in `changes`. |

No collection is added. The only schema change is one nullable reference on `AiPlan.options`.

## API Contracts

| Method | Path | Action | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/workspaces/:slug/ai/plans` | Modify | Multipart upload gains optional `targetProjectId`; response gains `targetProject`. |
| `GET` | `/api/workspaces/:slug/ai/plans/:id` | Modify | Resolves and returns `targetProject` (`null` when deleted). |
| `POST` | `/api/workspaces/:slug/ai/plans/:id/create` | Modify | Optional body `{ targetProjectId: string \| null }`; response gains `destination`. |
| `PATCH` | `/api/workspaces/:slug/ai/plans/:id` | Reuse | Plan editing is unchanged; changing destination uses the create body or a new upload. |
| `DELETE` | `/api/workspaces/:slug/ai/plans/:id` | Reuse | Discard/cancel and preview clearing are unchanged. |
| `GET` | `/api/workspaces/:slug/projects` | Reuse | Supplies the active-target list; the server validates the chosen id again. |

All routes keep `protect`, `requirePermission('projects:write')` and the `tasks:write` check. A target
outside the workspace answers as a missing one.

**Create semantics.** Absent `targetProjectId` uses the stored destination; `null` forces a new
project; a string adds to that project. The override is validated before the plan is claimed and is
never persisted over the stored value unless a create succeeds.

**Create response.** `{ project: { _id, name, key }, counts, destination: 'new' | 'existing' }`.

## Security

| Requirement | Control |
| --- | --- |
| NFR-001 / CON-512 | Every route keeps `protect` and the two permissions. `resolveTargetProject` always queries `{ _id, workspace: req.workspace._id }`; a foreign target is `TARGET_NOT_FOUND`. Creation re-validates before claiming. |
| NFR-002 / CON-507, CON-515, CON-516 | `targetProjectId` is validated by `express-validator` and `mongoose.isValidObjectId` before Mongoose. Multer file/field/part limits and `sanitizeFilename` are unchanged; no raw query interpolation. The create body is validated before claiming. |
| NFR-003 / CON-517 | The document stays fenced by a random boundary and declared data-only. The target name is requester-controlled and is defanged before it enters the user prompt. Output renders as React text, with no `dangerouslySetInnerHTML`. |
| NFR-004 / CON-501, CON-504 | Document text is never persisted. The plan keeps filename, MIME type, size, character count, truncation flag and a 2,000-character preview; delete/cancel clears `plan` and `preview`; the existing TTL index expires plans after 30 days. No document text, prompt or model output goes to logs or activity. |
| NFR-005 / CON-513, CON-514, CON-519, CON-520 | Reuses `helmet()`, the API/auth rate limiters, HTTPS/HSTS with `trust proxy`, and `config/env.ts` validation. CSRF (CON-518) remains not applicable: authentication is a bearer header, not a cookie, and CORS is allow-listed. |
| NFR-008 | The plan is claimed with one `findOneAndUpdate` before any write. Both paths collect inserted ids and delete only those; the existing path never includes the target project or its pre-existing records in the rollback; a failed create releases the claim. |

No new security dependency is needed.

## Performance

- **NFR-007.** Generation stays asynchronous: 202 after queueing, client polling about every 2 s,
  existing timeout and character budget. The destination adds no work to the model call.
- **NFR-008.** Inserts run in batches of 200 with task numbers reserved once. The existing path adds
  one query for the target's sprint names and one project lookup, not one per sprint or task.
- **NFR-001.** Target validation is a single indexed lookup by `_id` and workspace. The detail route
  resolves the target only when `targetProjectId` is set; the list endpoint does not do the extra
  lookup.

## Dependencies

No new third-party dependency. All of the following are reused:

| Name | Type | Action | Notes |
| --- | --- | --- | --- |
| `helmet` | Library | No change | Already applied in `server/src/app.ts`; CON-513. |
| `express-rate-limit` | Library | No change | Existing API/auth limiters; CON-514. |
| `express-validator` | Library | No change | Existing chains; the new field and body use the same library. |
| `multer` | Library | No change | Existing memory upload and limits. |
| `mongoose` | Library | No change | Models and `isValidObjectId`; one schema field. |
| `zod` | Library | No change | `editedPlanSchema`/`finalizePlan` validate both paths. |
| `unpdf`, `jszip` | Library | No change | Existing PDF/DOCX extraction; no OCR or new formats. |
| `useProjectDirectory` | Internal | No change | Supplies workspace projects and the archived flag. |
| AI provider API | Service | No change | The selected OpenAI-compatible provider (Qwen, DeepSeek, OpenAI, OpenRouter or custom) and its key; the SDK and contract stay the same. |

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-001 | The plan is added to the wrong project. | Explicit destination at upload, a review banner, an action label with the target and count, and a confirmation dialog listing what will be added. |
| RISK-002 | A mid-create failure leaves partial records or deletes existing work. | Claim first; track only this request's ids; delete only those; never include the target or its records; batch inserts. |
| RISK-003 | A hostile document injects instructions or secrets. | Keep the random boundary, data-only declaration and secret-suppression rules; render as text; never echo credentials. |
| RISK-004 | The target is renamed, archived or deleted between upload and create, or permission is lost. | Re-validate at create, return distinct codes, leave the plan ready, and show the current target from the detail response. |
| RISK-005 | A large plan overwhelms an existing project or duplicates sprint names. | Keep plan limits, deduplicate sprint names, show counts in the confirmation, and leave existing records untouched. |

## Provider Presets (update)

**Approach.** Keep the OpenAI-compatible client and replace the hard-coded DashScope settings with one
pure resolver. A new `server/src/utils/ai/providers.ts` owns the preset table, default endpoint, default
model and validation; `readAiConfig()` delegates to it and keeps its current contract plus `provider`
and an optional `problem`. `provider.ts`, both AI features and the settings controller consume the
resolved values, so there is no new route, SDK or database field. `DASHSCOPE_*` stays the Qwen alias and
`AI_*` wins when both are set.

| `AI_PROVIDER` | Label | Default base URL | Default model |
| --- | --- | --- | --- |
| `qwen` (default) | Qwen (Alibaba Cloud Model Studio) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4` |
| `custom` | Custom endpoint | required from `AI_BASE_URL` | required from `AI_MODEL` |

The defaults are documented examples, not a closed list: `AI_MODEL` and `AI_BASE_URL` always win.

**Resolution order.**

1. `providerId` = lower-cased `AI_PROVIDER`, else `qwen` (including legacy-only installs).
2. Unknown id → `available: false`, `problem: PROVIDER_UNKNOWN`; the accepted ids are listed for the
   administrator. No request is attempted.
3. Key = `AI_API_KEY`, else `DASHSCOPE_API_KEY` for `qwen`, else empty. A hosted preset with no key is
   `KEY_MISSING`; a `custom` endpoint may be keyless (the client receives a placeholder key).
4. Base URL = `AI_BASE_URL`, else `DASHSCOPE_BASE_URL` for `qwen`, else the preset default. Only HTTPS
   is accepted, except `custom` with a loopback host (`localhost`, `127.0.0.1`, `::1`) over HTTP.
5. Model = `AI_MODEL`, else `DASHSCOPE_MODEL` for `qwen`, else the preset default. Empty →
   `MODEL_MISSING`.
6. `available` is true only when a key (hosted) and a valid endpoint/model exist. Both AI review and
   document plans read this same result, so a restart flips both together.

### Components (update)

| Component | Action | Purpose |
| --- | --- | --- |
| `server/src/utils/ai/providers.ts` | Create | Pure preset table + resolver: ids, labels, defaults, precedence, HTTPS/loopback validation, `available` and `problem`; no network, no `process.env` outside the passed source. |
| `server/src/utils/ai/config.ts` | Modify | Delegate to the resolver; keep `baseURL`, `model`, `dailyLimit`, `maxDiffChars`; add `provider: { id, label }` and `problem`. |
| `server/src/utils/ai/provider.ts` | Modify | Build the client from the resolved key/base URL and call the resolved model; keep zod validation, one repair retry, timeout and token limits unchanged. Use a placeholder key only for a keyless `custom` endpoint. |
| `server/src/controllers/aiReviewController.ts` | Modify | `settingsView` adds `provider` and `problem`; it still returns only `available`, `model`, limits and `githubTokenSet`, never the key or base URL. |
| `client/src/features/ai-review/types.ts` | Modify | Add `provider: { id, label }` and the optional `problem` union to `AiSettings`. |
| `client/src/features/ai-review/components/AiReviewSettingsCard.tsx` | Modify | Replace the hard-coded "Alibaba Cloud Model Studio" heading with `settings.provider.label`; the unavailable copy names `AI_PROVIDER`/`AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL`. |
| `client/src/features/ai-plan/components/UploadStep.tsx` | Modify | Render the document notice with the resolved provider label; keep a neutral fallback while settings load or are unavailable. |
| `client/src/i18n/locales/{en,fr,ar}/ai.json` | Modify | Provider-neutral notice and unavailable copy with a `{{provider}}` interpolation; same keys in all three languages. |
| `client/src/i18n/locales/{en,fr,ar}/aiPlan.json` | Modify | `notice.body` takes `{{provider}}`; the unavailable body points to server configuration without naming a vendor. |
| `server/.env.example` | Modify | Document `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, the preset defaults and the legacy `DASHSCOPE_*` alias; placeholders only. |
| `server/src/config/env.ts` | No change | AI remains optional and is resolved per request by the dedicated config module; no route or controller reads `process.env`, preserving CON-206's separation and the existing test override. |
| `openai` SDK | Reuse | Already installed; the OpenAI-compatible client covers every preset. No Anthropic/Gemini adapter in this version. |

### Flow (update)

1. **Resolve.** On each request, `readAiConfig()` asks the resolver for the effective provider, base
   URL, model, key and availability. A legacy-only install resolves to Qwen exactly as today.
2. **Reject early.** Unknown provider, missing hosted key, missing model or a disallowed URL returns
   `available: false` with a `problem`; the route answers the existing `AI_DISABLED` shape and nothing
   is sent to a provider.
3. **Call.** `provider.ts` creates the OpenAI client from the resolved key/base URL and calls the
   resolved model. Validation, repair retry and limits are unchanged.
4. **Expose.** `GET /api/workspaces/:slug/ai` adds `provider: { id, label }` and `problem`; the settings
   card shows the label and model, and the upload notice interpolates the same label.
5. **Switch.** The operator edits `.env` and restarts; the next review or plan uses the new provider.
   No migration, workspace update or plan rewrite is involved.

### Configuration & API (update)

- **Environment:** `AI_PROVIDER` (`qwen|deepseek|openai|openrouter|custom`), `AI_API_KEY`,
  `AI_BASE_URL`, `AI_MODEL`. Legacy `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `DASHSCOPE_MODEL` are
  read only when `AI_*` is absent for that value.
- **Problems:** `PROVIDER_UNKNOWN`, `KEY_MISSING`, `MODEL_MISSING`, `BASE_URL_INVALID`; these are safe
  codes, never the key or URL.
- **`GET /api/workspaces/:slug/ai`** (modify): adds `provider: { id, label }` and `problem`. No other
  route changes; the upload/create/detail routes keep their contracts.
- **No database change:** the provider is installation configuration, not workspace state.

### Security (update)

| Requirement | Control |
| --- | --- |
| NFR-009 / CON-501, CON-504, CON-505, CON-519 | The key is read only by the server config module, never returned by `GET /ai`, never written to logs/activity, and never bundled into the client. `.env.example` carries empty placeholders; `.env` stays ignored. |
| FR-015 / NFR-009 | HTTPS is required for every endpoint, with a loopback-only HTTP exception for keyless `custom`; an invalid URL reports `BASE_URL_INVALID` and no request is made. |
| NFR-010 / CON-202 | Preset resolution is a pure module with a passed-in environment, so it is unit-testable without network and cannot drift between review and plan. |
| CON-206 | The only reader of the AI variables is the dedicated `utils/ai` config module; routes and controllers keep receiving a resolved config, and no new required startup variable is introduced. |

No new security dependency is needed.

### Performance (update)

- Resolution is an in-memory lookup per request, with no extra database query or network call.
- The provider call keeps the existing timeout, output-token and one-repair-retry bounds, so a slower or
  weaker model cannot extend a job beyond the current NFR-007 limits.
- Switching providers requires only a process restart; no backfill or re-generation of stored plans.

## Verification

Gate 2 is followed by implementation and then the Test Agent. This plan does not author tests.
Before the implementation gate, run server and client typecheck, client lint, the governance
validator, and the CON-703 browser check at 320/375/768/1024 px with keyboard-only operation and
en/fr/ar copy, covering empty, loading and error states. Test authoring and test execution are the
Test Agent's responsibility.

Provider-preset checks: resolve each preset and the legacy Qwen alias, confirm `AI_*` precedence and
the unknown/missing/HTTP cases, confirm `GET /ai` exposes the label and model but never the key or base
URL, and check the settings card and upload notice in en/fr/ar at 320/375/768/1024 px with the
keyboard.

## Update — OpenCode preset and Projects page actions

**Approach.** P8 is additive and reuses P7's resolved-provider boundary and the existing Projects page
components. On the server, `providers.ts` replaces the `openrouter` preset with `opencode` and keeps
the same resolver contract; `readAiConfig()`, `provider.ts`, the route and both AI features need no
structural change. The client provider type and the accepted-provider copy follow the new list. On the
Projects page, `PageHeader` carries both creation actions, the two dashed cards leave the grid, and
`ProjectFolderCard` remains the only card. The grid and action group get explicit responsive classes.
No route, database field, SDK, design-system primitive or new package is introduced.

| `AI_PROVIDER` | Label | Default base URL | Default model | Key |
| --- | --- | --- | --- | --- |
| `qwen` (default) | Qwen (Alibaba Cloud Model Studio) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Required |
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | Required |
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Required |
| `opencode` | OpenCode Console | `https://opencode.ai/inference/openai/v1` | `deepseek-v4.1-flash-free` | Required, even for the free model |
| `custom` | Custom endpoint | required from `AI_BASE_URL` | required from `AI_MODEL` | Optional only for keyless loopback HTTP |

The `openrouter` preset is removed. `AI_PROVIDER=openrouter` is an unknown provider:
`available: false`, `problem: PROVIDER_UNKNOWN`, no network request. `custom` remains the documented
escape hatch for an OpenAI-compatible gateway, including OpenRouter, but it is not a first-class preset
and no Claude support is claimed.

**Resolution order.**

1. `providerId` = lower-cased `AI_PROVIDER`, else `qwen` when unset. The installation default does not
   change.
2. `opencode` resolves to the preset above; `AI_BASE_URL` and `AI_MODEL` still override the defaults.
3. `openrouter` and every other unknown id resolve to `available: false` with `PROVIDER_UNKNOWN`; no
   request is attempted.
4. Key = `AI_API_KEY`, else `DASHSCOPE_API_KEY` for `qwen`, else empty. `opencode` is a hosted preset
   and requires a key; a missing key reports `KEY_MISSING`. `custom` may be keyless only on loopback
   HTTP, as before.
5. Model = `AI_MODEL`, else `DASHSCOPE_MODEL` for `qwen`, else the preset default. Empty →
   `MODEL_MISSING`.
6. Both AI code review and document plans read the same resolved result; the settings card and upload
   notice show the resolved label and model.
7. The Projects page reads `projects:write` for "New project" and `projects:write` + `tasks:write` for
   "Create with AI"; it never relies on the button alone for authorization.

### Components (update)

| Component | Action | Purpose |
| --- | --- | --- |
| `server/src/utils/ai/providers.ts` | Modify | Replace the `openrouter` entry with `opencode` (label, HTTPS base URL, default model, `requiresKey: true`); update `AI_PROVIDER_IDS` to `qwen`, `deepseek`, `openai`, `opencode`, `custom`. Keep the resolver pure and the `PROVIDER_UNKNOWN`/`KEY_MISSING`/`MODEL_MISSING`/`BASE_URL_INVALID` vocabulary. |
| `client/src/features/ai-review/types.ts` | Modify | Replace `openrouter` with `opencode` in `AiProviderId`; keep `unknown` for an old environment value. |
| `client/src/i18n/locales/{en,fr,ar}/ai.json` | Modify | Update `PROVIDER_UNKNOWN` to list `qwen`, `deepseek`, `openai`, `opencode`, `custom`; keep matching keys and RTL-safe copy. |
| `server/.env.example` | Modify | List the new preset order, add the OpenCode Console line with its base URL and default model, remove the OpenRouter line, and note that the free model still needs an OpenCode Console key. Placeholders only. |
| `client/src/pages/ProjectsPage.tsx` | Modify | Pass both header actions to `PageHeader`; remove the `NewProjectCard`/`AiProjectCard` imports and grid entries; change `GRID` to `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4`; stack the action group below `sm`; keep the existing empty/no-match/loading/error/archived branches. |
| `client/src/features/projects/components/NewProjectCard.tsx` | Delete | The dashed card is replaced by the header button; no other caller remains. |
| `client/src/features/ai-plan/components/AiProjectCard.tsx` | Delete | The dashed AI card is replaced by the header button; no other caller remains. |
| `client/src/features/projects/index.ts` | Modify | Remove the `NewProjectCard` export. |
| `client/src/features/ai-plan/index.ts` | Modify | Remove the `AiProjectCard` export. |
| `client/src/i18n/locales/{en,fr,ar}/projects.json` | Modify | Add `page.createWithAi`; remove the now-unused `project.newCard` key. Keep all three languages aligned. |
| `client/src/i18n/locales/{en,fr,ar}/aiPlan.json` | Modify | Remove the now-unused `card.title`/`card.hint` keys; keep the upload/review copy unchanged. |
| `client/src/components/ds/primitives.tsx` (`PageHeader`) | Reuse | Already wraps actions responsively; no primitive change. |
| `client/src/features/projects/components/ProjectFolderCard.tsx` | Reuse | Remains the only project card; no data or permission change. |
| `client/src/features/ai-review/components/AiReviewSettingsCard.tsx` | Reuse | Already renders the resolved label/model; only the accepted-list copy changes. |
| `client/src/features/ai-plan/components/UploadStep.tsx` | Reuse | Already renders the resolved provider label; no flow change. |
| `openai` SDK | Reuse | Already installed; no Anthropic/Gemini adapter and no new package. |

### Flow (update)

1. **Resolve OpenCode.** With `AI_PROVIDER=opencode` and `AI_API_KEY`, the server returns the
   OpenCode Console label, base URL and `deepseek-v4.1-flash-free`; overrides still win.
2. **Reject the removed preset.** With `AI_PROVIDER=openrouter`, both AI features see an unavailable
   configuration with `PROVIDER_UNKNOWN`; the API stays up and no request leaves the server.
3. **Render the header.** The Projects page shows "New project" for `projects:write` and "Create with
   AI" only when both `projects:write` and `tasks:write` are present. The primary action keeps the
   existing create dialog; the AI action navigates to `/{workspaceSlug}/projects/new/ai`.
4. **Render the grid.** The active and archived grids contain only `ProjectFolderCard`; the empty,
   no-match, loading and error branches are unchanged, and no dashed card is rendered in any branch.
5. **Adapt to width.** The action group is full width and column-stacked below `sm`, then row-aligned;
   the grid is one column below 640 px, two from 640 px, three from 768 px and four from 1280 px.
6. **Translate.** The header button uses `projects.page.createWithAi`; the AI accepted list and
   unavailable copy use the existing `ai` namespace. The removed card keys are not referenced.
7. **Verify.** Typecheck, lint, build, governance and the browser matrix below; implementation does not
   author or run tests.

### Configuration & API (update)

- **Environment:** `AI_PROVIDER` is `qwen|deepseek|openai|opencode|custom`; `openrouter` is no longer
  accepted. `AI_API_KEY`, `AI_BASE_URL` and `AI_MODEL` keep their precedence. `DASHSCOPE_*` remains a
  Qwen alias.
- **API:** no route or response shape changes. `GET /api/workspaces/:slug/ai` already returns
  `provider: { id, label }`, `model` and the optional `problem`; an existing `openrouter` value simply
  produces `PROVIDER_UNKNOWN`.
- **Database:** no change. The provider is installation configuration, not workspace state.
- **Dependencies:** no package add/remove; the existing `openai` client covers the new preset.
- **OpenRouter:** first-class preset removed; an administrator can still use `custom` with an
  OpenAI-compatible URL. No key or base URL is returned to the client.

### Security (update)

| Requirement | Control |
| --- | --- |
| FR-018, NFR-009 / CON-501, CON-504, CON-505, CON-519 | The OpenCode Console key is read only by the server config module, is required even for the free model, and is never returned by `GET /ai`, logged, put in activity or bundled into the client. |
| FR-019, NFR-009 | `AI_PROVIDER=openrouter` is rejected before any network call with `PROVIDER_UNKNOWN`; the error names the accepted ids but never the key, base URL or model. |
| FR-020, CON-512 | The header actions are permission-gated in the client and the existing server routes remain authoritative; hiding "Create with AI" never grants access by itself. |
| RISK-011 | The operator must review the chosen model's retention/training terms; the free DeepSeek model is documented as zero-retention/no-training, and AI stays off until a workspace opts in. |

No new security dependency is needed.

### Performance (update)

- Provider resolution stays an in-memory lookup per request; the new preset adds no database or network
  work before the model call.
- The Projects page removes two cards from the active grid and adds one header button; it makes no new
  request and keeps the existing `useProjects`/`useTasks` data flow.
- The responsive changes are CSS-only; no new image, font, chart or runtime dependency is added.

### Dependencies & Risks (update)

- **OpenCode Console API** (external): `https://opencode.ai/inference/openai/v1`, default model
  `deepseek-v4.1-flash-free`; free for a limited time and requires an OpenCode Console key. No SDK
  change.
- **`openai` SDK** (library): reused unchanged; no new package.
- **OpenRouter** (external): no longer a first-class preset; `custom` remains the generic
  OpenAI-compatible fallback.
- **`PageHeader` and `ProjectFolderCard`** (internal): reused; no design-system change.

| Risk | Mitigation |
| --- | --- |
| The OpenCode free model is promotional, rate-limited, retired or repriced, or does not support JSON mode or the current latency budget. | Pin `deepseek-v4.1-flash-free` but document `AI_MODEL`/`AI_BASE_URL` overrides; require a key; verify JSON-mode support and latency during verification; keep the existing repair retry/timeout; keep `custom` or another preset as a fallback; do not promise free availability. |
| Removing the OpenRouter preset removes the first-class Claude path. | Document that `custom` can target an OpenAI-compatible gateway for Claude if the administrator chooses; do not claim first-class support; keep the HTTPS/loopback validation. |
| An existing deployment still uses `AI_PROVIDER=openrouter`. | Resolve it to `PROVIDER_UNKNOWN` without a request; keep the API up; make the unavailable copy tell the operator to use `opencode` or `custom`. |
| The header actions or one-column grid regress narrow screens, or the deleted cards leave dead imports. | Use the explicit 1/2/3/4 grid and a stacked action group below `sm`; delete both components and their exports in the same change; run the browser matrix and typecheck/lint. |
| A free model retains or trains on TaskMan documents or code. | Document the operator's responsibility; keep the zero-retention/no-training note for DeepSeek V4.1 Flash Free; keep AI opt-in per workspace. |

### Verification (update)

Gate 2 is followed by implementation and then the Test Agent. This plan does not author tests. Before
the implementation gate, run server/client typecheck, client lint, client build and
`node .sdrive/scripts/validate-governance.js`, then the browser check at 320/360/768/1024/1280 px with
keyboard-only operation and en/fr/ar copy. Cover the Projects page empty, loading, error, no-match and
archived states; both header actions by permission; the AI settings card and upload notice with
`opencode`, a missing key, an unknown `openrouter` value and a `custom` fallback. If an OpenCode Console
key is available, generate one plan to confirm JSON-mode support and latency; otherwise record the
unverified behavior in the PR. Test authoring and test execution remain the Test Agent's responsibility.

## Update - Workspace-level BYOK and dashboard setup (2026-10-21)

> **Superseding note.** This update replaces the installation-level provider resolution described in
> P7 and P8. `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` and the legacy `DASHSCOPE_*`
> aliases remain bootable but no longer authorize or supply workspace AI. They only feed the
> installation daily and size limits. One workspace configuration is the sole credential source for
> both AI code review and document plans.

**Approach.** Add one AI configuration to `Workspace.ai` and make every AI path resolve it on each
request. The stored subdocument holds the provider id, effective base URL and model, an AES-256-GCM
ciphertext from `secretBox` bound to the workspace id, a last-four hint, the configuring user and
timestamps, and the last test result. A focused resolver validates those fields, decrypts the key, and
combines the result with the installation limits. It never reads a server-wide provider key. A missing
provider resolves to `AI_NOT_CONFIGURED` before any network call; an unreadable ciphertext resolves to
`KEY_UNREADABLE`.

The settings API becomes the only write path. `GET /ai` keeps its `tasks:read` visibility but returns
the non-secret configuration block only to members who hold `settings:manage`. Saving, replacing,
testing and removing use `settings:manage` and `rejectApiToken`. The key is write-only, stored with
`select:false`, and returned only as `keySet` plus its last four characters.

Custom endpoints get two layers. `urlGuard.ts` rejects HTTP, credentials, query strings and fragments,
and resolves every DNS answer to reject loopback, private, link-local, multicast, reserved and
cloud-metadata ranges. `pinnedFetch.ts` then makes the provider call through `node:https` with a
`lookup` pinned to the validated address, the original TLS servername, no redirects, a timeout and a
response-size cap. The key travels only in the provider `Authorization` header.

No migration runs. Every existing workspace starts unconfigured even when the deployment still sets
`AI_*`; AI stays off until a `settings:manage` member saves a provider and turns the feature on. A
first save never enables AI: if the workspace had no provider, `enabled` and `autoReview` are set to
false in the same update, so a legacy opt-in cannot silently resume against a new vendor. Both
AI features store the resolved model on the queued record, so an in-flight review or plan keeps the
model it started with while a later configuration change applies to the next request. No new package
is added.

### Components (P9 update)

| Component | Action | Responsibility |
| --- | --- | --- |
| `server/src/models/workspaceModel.ts` | modify | Add `ai.provider`, `ai.baseURL`, `ai.model`, `ai.apiKeyEncrypted` (`select:false`), `ai.keyHint`, `ai.configuredAt`, `ai.configuredBy`, `ai.lastTestedAt`, `ai.lastTestStatus`, `ai.lastTestCode`; keep `enabled`/`autoReview` default false. |
| `server/src/utils/ai/providers.ts` | modify | Keep the five presets and pure URL/model normalization; remove environment credential resolution and expose workspace selection helpers. |
| `server/src/utils/ai/config.ts` | modify | Read only installation limits (`dailyLimit`, `maxDiffChars`); no provider/key fallback. |
| `server/src/utils/ai/workspaceConfig.ts` | create | Resolve `Workspace.ai` into `{ available, provider, model, baseURL, apiKey, keySet, keyHint, problem, limits }`; decrypt with `secretBox(context=workspace id)`. |
| `server/src/utils/ai/urlGuard.ts` | create | HTTPS/credential/query/fragment checks, DNS resolution, and private/reserved/metadata rejection for IPv4, IPv6 and mapped addresses. |
| `server/src/utils/ai/pinnedFetch.ts` | create | `node:https` fetch with a pinned lookup, original servername, no redirects, timeout and response-size cap. |
| `server/src/utils/ai/provider.ts` | modify | Accept the resolved config, build the client from it, and add `testAiConnection` with a minimal content-free request. |
| `server/src/controllers/aiReviewController.ts` | modify | Manager-aware settings view plus save/replace/remove/test handlers, validation, audit, and enable/auto-review guards. |
| `server/src/routes/aiRoutes.ts` | modify | Add `PUT`/`DELETE /provider` and `POST /provider/test` behind `rejectApiToken` + `settings:manage`, with a test limiter. |
| `server/src/utils/ai/reviewService.ts` | modify | Resolve the config in queue and run paths, select the ciphertext, return `AI_NOT_CONFIGURED`, and pass the config to the model. |
| `server/src/controllers/githubWebhookController.ts` | modify | Select `+ai.apiKeyEncrypted` and pass the workspace settings to automatic review. |
| `server/src/utils/ai/plan/service.ts` | modify | Resolve the config for plan checks, queueing and generation; store the resolved model and pass the config to `generateJson`. |
| `server/src/controllers/aiPlanController.ts` | modify | Load the ciphertext with the feature flags and pass workspace id/settings to the plan service. |
| `server/src/utils/ai/types.ts` | modify | Add the safe workspace-config and endpoint problem codes. |
| `server/.env.example` | modify | Mark `AI_*`/`DASHSCOPE_*` as legacy limits-only; point provider setup at Workspace Settings. |
| `client/src/features/ai-review/types.ts` | modify | Add the manager config view, provider save/test inputs/results, and the new problem union. |
| `client/src/features/ai-review/api.ts` | modify | Add `saveProvider`, `removeProvider` and `testProvider`. |
| `client/src/features/ai-review/hooks/useAiSettings.ts` | modify | Expose the three actions with loading/error handling and refresh after success. |
| `client/src/features/ai-review/components/AiProviderForm.tsx` | create | Provider select, preset disclosure, custom URL/model, write-only key, save/replace/remove, test, key hint and last-test status. |
| `client/src/features/ai-review/components/AiReviewSettingsCard.tsx` | modify | Mount the provider form above the notice/toggles and reflect workspace status. |
| `client/src/features/ai-review/components/AiReviewPanel.tsx` | modify | Show the workspace `AI_NOT_CONFIGURED` copy and settings path. |
| `client/src/features/ai-plan/components/UploadStep.tsx` | modify | Use the workspace provider/model notice and the unconfigured copy. |
| `client/src/features/ai-plan/lib/errors.ts` | modify | Map the new safe codes to readable copy. |
| `client/src/i18n/locales/{en,fr,ar}/ai.json` | modify | Provider form, statuses, errors and workspace-only copy in all three locales. |
| `client/src/i18n/locales/{en,fr,ar}/aiPlan.json` | modify | Point the upload unavailable notice at the workspace administrator. |
| `client/src/components/ConfirmActionDialog.tsx` | reuse | Confirm provider removal. |
| `client/src/pages/WorkspaceSettingsPage.tsx` | reuse | Already mounts the AI card only for `settings:manage`. |
| `server/src/config/permissions.ts` | reuse | `settings:manage` stays the write authority; no new permission. |
| `server/src/models/activityModel.ts` | reuse | Reuse `ai.settings_updated`; record action/provider/model, never the key or endpoint. |
| `server/src/utils/secretBox.ts` | reuse | Existing AES-256-GCM/HKDF helper; workspace id is the context. |

### Data Model (P9 update)

| Field | Type | Notes |
| --- | --- | --- |
| `Workspace.ai.provider` | `'qwen' \| 'deepseek' \| 'openai' \| 'opencode' \| 'custom'` | Optional; absent means unconfigured. |
| `Workspace.ai.baseURL` | string | Effective endpoint. Presets store their preset URL; custom stores the normalized URL. |
| `Workspace.ai.model` | string | Effective model, including an explicit override. |
| `Workspace.ai.apiKeyEncrypted` | string, `select:false` | `secretBox` ciphertext bound to `String(workspace._id)`. Never returned. |
| `Workspace.ai.keyHint` | string | Last four characters only. |
| `Workspace.ai.configuredAt` / `configuredBy` | Date / ObjectId ref `User` | Who saved the current configuration and when. |
| `Workspace.ai.lastTestedAt` / `lastTestStatus` / `lastTestCode` | Date / `'success' \| 'failed'` / string | Safe test metadata; no response body. |
| `Workspace.ai.enabled` / `autoReview` | boolean | Existing fields, default false. Removal sets both false. |

`AiReview` and `AiPlan` keep their stored `model`; no record is rewritten when the provider changes.
The workspace fields are optional, so no migration or backfill is required.

### API (P9 update)

| Method | Path | Permission | Behaviour |
| --- | --- | --- | --- |
| `GET` | `/api/workspaces/:slug/ai` | `tasks:read` | Returns availability, provider/model, problem, limits and toggles. The `config` block (`keySet`, `keyHint`, `baseURL`, `configuredAt`, `configuredBy`, `lastTestedAt`, `lastTestStatus`, `lastTestCode`) is present only for `settings:manage`. |
| `PATCH` | `/api/workspaces/:slug/ai` | `settings:manage` + `rejectApiToken` | Existing `enabled`/`autoReview`/`githubToken` update. Enabling requires an available configuration; auto-review requires the feature to be enabled. |
| `PUT` | `/api/workspaces/:slug/ai/provider` | `settings:manage` + `rejectApiToken` | Save or replace `{ provider, apiKey?, model?, baseURL? }`. `custom` requires HTTPS base URL, model and key; presets ignore `baseURL`; blank key keeps the saved key on the same provider and is rejected on a provider change. A first save sets `enabled`/`autoReview` false; it never enables AI. |
| `DELETE` | `/api/workspaces/:slug/ai/provider` | `settings:manage` + `rejectApiToken` | Atomically clear the key/provider fields, set `enabled` and `autoReview` false, keep reviews/plans, and record the action/provider/model only. |
| `POST` | `/api/workspaces/:slug/ai/provider/test` | `settings:manage` + `rejectApiToken`, 5/min per workspace+user | Test the saved configuration, or a transient one supplied in the body. Sends no workspace content; returns `{ ok, code, testedAt }`. Saved-config tests update `lastTest*`. |

The test endpoint uses the same resolver, URL guard, DNS checks and pinned fetch as real calls. It never
follows redirects and never returns the provider response body, key or endpoint to a non-manager.

### Flow (P9 update)

1. **Open the card.** A member with `settings:manage` opens Workspace Settings -> AI. The card is not
   mounted for other members; `GET /ai` still gives them availability, provider label and model only.
2. **Configure.** The manager selects a preset or `custom`, sees the endpoint and default model,
   optionally overrides the model, and enters a key. For `custom`, an HTTPS URL and model are required.
   Save validates, encrypts with the workspace id, stores the hint and metadata, clears last-test
   metadata, and records `ai.settings_updated`. If the workspace had no provider, the same update sets
   `enabled` and `autoReview` false; the manager must opt in after saving.
3. **Test.** The manager can test the saved configuration or unsaved fields. The server sends a
   minimal content-free chat request through the same guard and pinned fetch, rate-limits the call, and
   returns a safe result plus time. No code, document, task or prompt is sent.
4. **Run a review.** A member starts a manual or automatic review. The server loads
   `+ai.apiKeyEncrypted`, resolves the workspace config, returns `AI_NOT_CONFIGURED` before any provider
   request when unavailable, uses the workspace daily limit, stores the resolved model and passes the
   config to `reviewWithModel`.
5. **Create a plan.** The upload/queue/run path uses the same resolver and model. A missing or removed
   configuration fails before extraction work creates partial projects, sprints or tasks. Existing plans
   remain readable with their stored model.
6. **Change or remove.** Replacing the key overwrites the ciphertext and applies to the next request.
   Removal clears provider fields and disables both toggles atomically; an in-flight operation may
   finish or fail independently, and the next request is `AI_NOT_CONFIGURED`.
7. **Upgrade.** `AI_*`/`DASHSCOPE_*` still boot the API but are not read for credentials. No key is
   copied; every workspace starts unconfigured and shows an actionable state.

### Security (P9 update)

| Requirement | Control |
| --- | --- |
| FR-021, FR-026, NFR-013 / CON-112, CON-501, CON-505, CON-519 | AES-256-GCM via `secretBox`, context-bound to `String(workspace._id)`, stored with `select:false`; only `keySet` and last four are returned; no key in logs, activity, errors or the client bundle; replacement overwrites and removal unsets. |
| FR-022, FR-029 | `settings:manage` gates save/replace/test/remove and the config block. `rejectApiToken` blocks API-token writes. Non-managers see only availability/provider/model, and the form is not mounted for them. |
| FR-023, FR-028, NFR-014 | Custom endpoints are HTTPS-only with no credentials/query/fragment. Every DNS answer is checked; private, loopback, link-local, multicast, reserved and cloud-metadata addresses are rejected before the key is sent. The chosen address is pinned to the connection, redirects are not followed, and timeouts/size caps apply. |
| FR-024, FR-025, NFR-016 | Workspace configuration is the sole source; no `AI_*`/`DASHSCOPE_*` fallback. Every request re-resolves; the model is stored on the record for in-flight work; existing records are never rewritten. |
| FR-027 | Removal is one atomic update that clears the key/provider and disables `enabled`/`autoReview`; reviews and plans are untouched; activity records action/provider/model, never the key or endpoint. |
| NFR-015 / CON-305, CON-306 | Programmatic labels, `aria-describedby`/`aria-live` errors, visible focus, 40 px targets below `md`, no 320 px overflow, LTR key/URL fields in RTL, and configured/testing/success/failure states distinguished by text and icon as well as colour in en/fr/ar. |
| RISK-012 to RISK-016 | SSRF guard and pinned fetch; encrypted write-only key; any manager can replace/remove; provider/model disclosure and explicit opt-in; legacy variables documented as limits-only with an actionable unconfigured state. |

No new security dependency is introduced.

### Performance (P9 update)

- The workspace subdocument is loaded with the record the caller already needs; no extra collection,
  index, migration or background job is added.
- DNS resolution happens once per provider call, not per token. The pinned fetch adds no second request
  and deliberately avoids a DNS cache that could hide rebinding.
- The existing daily limits, diff-size limit and document/upload bounds still cap work; the test call is
  rate-limited and content-free.
- Encryption/decryption is a small in-memory cost on save and per model call. The client form adds no
  polling or bundle dependency.

### Dependencies & Risks (P9 update)

- **`openai` SDK** (library): reused unchanged, now constructed with the workspace key/base URL and a
  pinned fetch. No new SDK.
- **`secretBox`** (internal): reused AES-256-GCM/HKDF with the workspace id as context.
- **`express-rate-limit`** (library): reused for the connection-test limiter.
- **Node built-ins** (`dns/promises`, `https`, `stream`): used by the URL guard and pinned fetch. No
  `undici` or other package is added.
- **`AI_*` / `DASHSCOPE_*`** (internal): legacy limits-only variables; no provider credentials and no
  migration into workspaces.
- **No data migration**: new fields are optional and old reviews/plans keep their stored model.

| Risk | Mitigation |
| --- | --- |
| A custom endpoint targets an internal service, cloud metadata or a redirect chain (SSRF). | HTTPS-only URL checks, reject credentials/query/fragment and every private/reserved/metadata DNS answer, pin the selected address, disable redirects, rate-limit tests and reject HTTP. |
| The key leaks through a response, log, activity entry, error, bundle or backup. | Encrypt with `secretBox`, keep the ciphertext `select:false`, return only `keySet`/last four, redact provider errors, never log bodies/headers, and scan changed files for secrets. |
| The manager who saved the key leaves or the key is lost. | Any `settings:manage` member can replace or remove it; show who configured it and the last test; no recovery attempt; AI stays off until a new key is saved. |
| Providers have different retention/training/residency terms. | Name the provider and model in the card and upload notice, keep AI off by default, require an explicit manager save, and make the manager responsible for the terms. |
| Existing installations expect `AI_*` to keep working. | Keep the API bootable, document the variables as limits-only, show an actionable `AI_NOT_CONFIGURED` state, and never copy a server key without consent. |

### Verification (P9 update)

Gate 2 is followed by implementation and then the Test Agent. This plan does not author tests. Before
the implementation gate, run server/client typecheck, client lint, client build,
`node .sdrive/scripts/validate-governance.js` and a changed-file secret scan. Then check at
320/360/768/1024/1280 px with keyboard only and en/fr/ar RTL: unconfigured, preset save/replace/remove,
valid custom HTTPS, rejected HTTP/private/metadata/redirect, test success/failure/rate limit, missing
key, permission revoked, and `AI_NOT_CONFIGURED` in the review panel and upload. Confirm no key or
endpoint appears in non-manager responses, logs or the client bundle. If a real provider key is
available, run one save/test and one plan; otherwise record the unverified provider behavior in the PR.
Test authoring and test execution remain the Test Agent's responsibility.


## Update - AI assistant card copy (2026-10-23)

### Components (P10 update)

- `client/src/features/ai-review/components/AiReviewSettingsCard.tsx` (modify): the section header
  already reads `settings.title`; add a short description paragraph and a semantic list
  (`<ul>`/`<li>`) rendered from a new `settings.capabilities` translation pair, before the provider
  panel. The list is static copy, not fetched data. Keep the existing `Surface`/`SectionHeader`,
  permission mounting and switch components; only the `enable` switch copy changes.
- `client/src/i18n/locales/{en,fr,ar}/ai.json` (modify): `settings.title` becomes "AI assistant";
  `settings.description` becomes one sentence about the shared provider and key; add
  `settings.capabilities.codeReview` and `settings.capabilities.documentPlans`; rewrite
  `settings.enable.label`/`description` to cover both features; change `settings.loadError` to "AI
  settings". Keep `settings.notice`, `settings.auto` and `settings.token` review-specific, since
  they describe the review data flow and its controls.
- `client/src/components/ds` (reuse): `Surface`, `SectionHeader` and `SwitchField` already provide
  the heading, spacing and labelled switch; no new primitive.

### Flow (P10 update)

Unchanged. `ai.enabled` still gates `assertReviewFeatureOn` and `assertPlanFeatureOn`, so the renamed
switch turns both features on and off. No server, API, schema, permission or stored-settings change;
the card remains mounted only for `settings:manage`.

### Copy & accessibility (P10 update)

- Heading "AI assistant"; description "The provider and key used by every AI feature in this
  workspace."; bullets "Code review — reads a pull request and checks it against the acceptance
  criteria." and "Projects from documents — drafts sprints, tasks and criteria from a requirements
  document."; switch "Enable AI features" with "Lets members with edit permission review a pull
  request or create a project from a document."
- French and Arabic carry the same three elements; no string concatenation, so RTL and word order
  stay intact.
- The bullets are real list items, so a screen reader announces the count; the heading keeps its
  `aria-labelledby` target and the switch keeps its programmatic label and description.

### Dependencies & Risks (P10 update)

- No new dependency: the card reuses `react-i18next` and the design-system components; the bullets
  are plain JSX list items.
- No data, API, migration or permission change.

| Risk | Mitigation |
| --- | --- |
| A future AI capability is added but the card still lists only two, so the label overpromises or under-describes. | FR-030 keeps the heading generic and EC-025 adds the capability as a bullet; the card stays the single home for AI features. |
| The three locales drift or one keeps the old review-only wording. | The same keys are changed in en/fr/ar in one task and the verification task reads all three. |
| The renamed switch implies it only controls reviews, so a manager turns off document plans by accident. | The switch description names both actions and verification checks the upload page reacts to the same flag. |

### Verification (P10 update)

Gate 2 is followed by implementation and then the Test Agent; this plan does not author tests. Before
the implementation gate, run client typecheck, client lint, client build,
`node .sdrive/scripts/validate-governance.js` and a changed-file secret scan (no secret is involved,
but the scan stays in the gate). Then check the card at 320/375/768/1024/1280 px with keyboard only
and en/fr/ar RTL, configured and unconfigured: the heading, both bullets and the switch label, no
review-only wording, no horizontal overflow, and the upload page still reacting to the same
`ai.enabled` flag. Server typecheck is unchanged because no server file changes.

## Update - Project-scoped document plans and folder creation cards (2026-10-23)

### Components (P11 update)

- `client/src/pages/AiProjectPage.tsx` (modify): accept a project-scoped mode when the route
  supplies `:projectId`. Resolve the project from `useProjectDirectory()`; while the directory
  loads show `SkeletonDetail`, and show the existing no-access or not-found surface when the member
  lacks `projects:write`/`tasks:write` or the project is gone. In project mode the header reads
  "Add a plan to {project}", the back link returns to the project, and the plan target is fixed.
  Keep the `?plan=` resume behaviour, but validate the plan's stored target before resuming.
- `client/src/App.tsx` (modify): add `/:workspaceSlug/projects/:projectId/plan` behind
  `projects:write`, lazy-loading the same `AiProjectPage` chunk. React Router ranks the static
  `plan` segment above `:projectId`, so the detail route is unchanged.
- `client/src/features/ai-plan/hooks/useAiProjectPlan.ts` (modify): take a fixed
  `targetProjectId: string | null` instead of owning destination state. Remove `destination`,
  `targetProjectId` state, `rememberDestination` and `changeDestination`. `start` merges the fixed
  target into the upload payload (`destination`/`targetProjectId`); `create` always sends the
  override (`null` for a new project, the id for a project) so a resumed plan can never inherit a
  stale stored target.
- `client/src/features/ai-plan/components/UploadStep.tsx` (modify): delete the "Where the plan
  goes" `Surface` and the `DestinationPicker` import. Add a `target?: Project | null` prop: when
  set, render a read-only "Adding to {name} {key}" line; when absent, always render the project
  name and key fields. Drop `projects`, `projectsLoading`, `destination`, `targetProjectId`,
  `targetProblem`, `upload.needTarget` and the target guard on submit.
- `client/src/features/ai-plan/components/ReviewStep.tsx` (modify): keep the destination summary
  but make it read-only - "New project: {draft.project.name}" or "Adding to: {target.name} {key}"
  - with no Change button, picker or `DestinationPicker`. Choose the add/create copy and
  confirmation from the fixed target. Keep the plan tabs, problems, regenerate and discard
  behaviour.
- `client/src/features/ai-plan/lib/destination.ts` (modify): add `planBelongsToProject(plan,
  projectId)`, a pure helper that returns true only when a plan is not already created and its
  stored `targetProjectId` matches; reuse `targetLabel`. Keep the existing helpers that still have
  a caller.
- `client/src/features/ai-plan/components/DestinationPicker.tsx` and `ProjectPicker.tsx` (delete):
  no page offers a destination choice any more; their pure helpers stay. `/sdrive:test` removes or
  rewrites the matching tests.
- `client/src/pages/ProjectDetailPage.tsx` (modify): add an "Add from document" outline action to
  the header for members with `projects:write` and `tasks:write` when the project is not archived;
  it links to `/{workspaceSlug}/projects/{id}/plan` with a `FileUp`/`Sparkles` icon. Keep Edit,
  Project chat, Open board and New sprint in their order.
- `client/src/pages/ProjectsPage.tsx` (modify): remove the header `New project` / `Create with AI`
  buttons; render `NewProjectCard` then `AiProjectCard` as the first `<li>` items of the active
  grid when the query is empty; keep the empty state but give it both actions; keep the no-match
  state, archived grid, search and sort unchanged.
- `client/src/features/projects/components/NewProjectCard.tsx` (create): restore the dashed folder
  card that opens `ProjectFormDialog`; reuse `t('projects:page.newProjectCard')`.
- `client/src/features/ai-plan/components/AiProjectCard.tsx` (create): restore the dashed info
  folder link to `/{workspaceSlug}/projects/new/ai`; reuse `t('aiPlan:card.title')` and
  `t('aiPlan:card.hint')`.
- `client/src/i18n/locales/{en,fr,ar}/aiPlan.json` (modify): add `card.title`/`card.hint`,
  `page.projectTitle`/`page.projectDescription`/`page.backToProject`, `upload.addingTo`/
  `upload.addingToHint`, and the read-only review labels; remove the now-unused `destination.*`
  block and `upload.needTarget` once no component reads them.
- `client/src/i18n/locales/{en,fr,ar}/projects.json` (modify): add `page.newProjectCard` and
  `detail.addFromDocument`; keep `page.createWithAi` for the empty-state action and the AI card
  hint if it is reused.

### Flow (P11 update)

The new-project page (`/projects/new/ai`) is unchanged except that it no longer asks where the
plan goes: every plan started there creates a new project. The project page adds a second entry to
the same wizard at `/projects/:projectId/plan`, where the target is the route's project: the
upload payload carries `targetProjectId`, the create call sends it, and success returns to the
project. Resuming a `?plan=` id in project mode first reads the plan and checks its stored target;
a plan for another project (or one already created) is not shown as this project's plan and offers
the generic plan page or a return to the project instead.

### Data & API (P11 update)

No schema, migration or endpoint change: the plan upload already accepts an optional
`targetProjectId` and the create endpoint already accepts an optional override. The change is
client routing and UI only; the stored plan shape and the daily limits are untouched.

### Security (P11 update)

The project-scoped route keeps the `projects:write` guard and the page's `tasks:write` check, so a
member cannot start or create a plan for a project they could not edit. The create call is still
authorized against the workspace and the target is validated server-side (exists, active), so a
forged project id fails. No document text is stored; the file stays in memory.

### Performance (P11 update)

No new network call on the happy path: the project page reuses the directory it already loads,
and the project-scoped wizard adds only the plan read when resuming a `?plan=` id. The grid gains
two static cards, so no extra request; the existing lazy chunk is reused for the new route.

### Dependencies & Risks (P11 update)

- No new dependency: the cards reuse plain markup, `react-router-dom`, `react-i18next` and the
  existing `Button`; the wizard reuses the existing components and API client.

| Risk | Mitigation |
| --- | --- |
| Members who used "Create with AI" to add to an existing project lose the entry point they know and create duplicates. | The project header carries "Add from document" and the AI card hint says it creates a new project; both are checked in the browser. |
| A stale `?plan=` link adds work to the wrong project. | `planBelongsToProject` refuses a mismatched or created plan before it is shown (EC-029). |
| Two action cards push projects below the fold on phones. | Cards share the folder grid, stay compact, and are hidden while searching. |

### Verification (P11 update)

Gate 2 is followed by implementation and then the Test Agent; this plan does not author tests.
Before the implementation gate run server/client typecheck, client lint, client build,
`node .sdrive/scripts/validate-governance.js` and a changed-file secret scan. Then check, in a
browser, the new-project page (no destination choice, name/key always present), the project page
button (permission and archived gates), the project-scoped wizard (read-only target, create into
the project, return to the project), the mismatch guard, and the Projects grid (cards first, hidden
while searching, both actions in the empty state). Repeat at 320/375/768/1024/1280 px, keyboard
only, en/fr/ar and RTL.

## Update - Projects header creation actions (2026-10-24)

### Components (P12 update)

- `client/src/pages/ProjectsPage.tsx` (modify): reuse the existing `pageActions` group and pass it
  to `PageHeader` as `actions` when the workspace has at least one project. Keep the zero-project
  `EmptyState` actions as the only entry in that state, so the page never renders two copies of the
  same buttons. Keep `canWrite`/`canCreateWithAi`, the card order, search hiding, the archived grid,
  sort and loading/error behaviour. Wrap the group in a labelled `role="group"` so it is
  distinguishable from the grid cards.
- `client/src/i18n/locales/{en,fr,ar}/projects.json` (modify): add `page.projectActions` as the
  accessible group label; reuse `page.newProject` and `page.createWithAi` for the visible button
  labels.
- `client/src/components/ds` (reuse): `PageHeader` already renders an `actions` slot that stacks
  below `sm`; `Button` and the existing icons are reused.
- `client/src/features/projects/components/NewProjectCard.tsx` and
  `client/src/features/ai-plan/components/AiProjectCard.tsx` (reuse): no change; they remain the
  first items of the active grid.

### Flow (P12 update)

The Projects page keeps its current grid and empty-state flow. With at least one project, the
header renders the same two permission-gated actions that already exist in `pageActions`, while
the dashed cards stay first in the active grid. Searching still hides the cards but leaves the
header actions available; archived projects still have no cards; with zero projects the empty
state remains the only action area, so the page does not show duplicate buttons.

### Data & API (P12 update)

No schema, migration, endpoint or permission change. The actions reuse the existing
`ProjectFormDialog` and `/projects/new/ai` route.

### Security (P12 update)

The existing `projects:write` and `tasks:write` checks remain the only gates. Read-only members
see no header actions; a member with `projects:write` but not `tasks:write` sees only "New
project". No new input, secret or data flow is introduced.

### Performance (P12 update)

No new request: the header reuses the buttons and state the page already owns. No new dependency
or bundle chunk; `PageHeader` is already imported.

### Dependencies & Risks (P12 update)

- No new dependency.

| Risk | Mitigation |
| --- | --- |
| Duplicate entry points clutter the header or confuse assistive technology. | The header group is labelled and compact; the zero-project state keeps a single action area; browser checks cover both entry points. |
| Header actions disappear or duplicate in search, archived or empty states. | The header actions are rendered from the page-level permission state, not from the filtered grid; the empty state owns the actions only when there are no projects. |

### Verification (P12 update)

Gate 2 is followed by implementation and then the Test Agent; this plan does not author tests.
Before the implementation gate run client typecheck, client lint, client build,
`node .sdrive/scripts/validate-governance.js` and a changed-file secret scan. Then check in a
browser at 320/375/768/1024/1280 px, keyboard only, en/fr/ar RTL: the header and the cards both
offer the actions; a member without `projects:write` sees neither; a member with `projects:write`
but not `tasks:write` sees only "New project"; searching hides the cards but not the header;
archived projects have no cards; zero projects shows the empty-state actions without a duplicate
header group; the create dialog and the AI route open.
