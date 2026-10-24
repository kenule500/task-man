> **Status:** Ongoing — Gate 2 pending for the provider-preset update. Destination implementation remains on `feature/upload-document`; browser verification is still pending (no local MongoDB).

# Tasks — Upload a document and turn it into a project plan with AI

- **Feature:** `upload-document`
- **Version:** v1
- **Machine-readable tasks:** `.sdrive/governance/upload-document/v1/tasks.json`
- **Branch:** `feature/upload-document` (base `main`)

Requirements in brackets are the `FR-###` / `NFR-###` ids from
`.sdrive/governance/upload-document/v1/spec.json`; acceptance criteria use `AC-###`.
These tasks describe production code only. Test authoring and test execution belong to the Test
Agent and are deliberately absent.

## P1 — Destination contract and server validation

- [x] **T1.1 — Extend the plan model and queued-plan options.** Add `targetProjectId` to
  `server/src/models/aiPlanModel.ts` (`ObjectId`, ref `Project`, default `null`) and to
  `PlanOptionsInput`/`createQueuedPlan` in `server/src/utils/ai/plan/service.ts`; keep the retention
  and active-plan indexes. _(FR-004, NFR-004; AC-004)_
- [x] **T1.2 — Resolve and validate a target project.** Create
  `server/src/utils/ai/plan/target.ts`: parse an ObjectId, query `{ _id, workspace }`, refuse a
  missing or archived project, return a `{ _id, name, key, archived }` summary, and throw
  `AiQueueError` with `TARGET_INVALID` (400), `TARGET_NOT_FOUND` (404) or `TARGET_ARCHIVED` (409).
  _(FR-008, NFR-001, NFR-002; AC-008)_
- [x] **T1.3 — Accept and store the destination at upload.** Add the optional `targetProjectId`
  validator to `validateUploadPlan`, resolve the target in `uploadPlan` before queueing, store it in
  `options`, and include the resolved summary in the upload response. A target makes the generated
  project name/key optional for the request. _(FR-003, FR-004, FR-008; AC-003, AC-004, AC-008)_
- [x] **T1.4 — Return the resolved target in plan detail.** In
  `server/src/controllers/aiPlanController.ts`, resolve `options.targetProjectId` for `getPlan` and
  return `targetProject` (or `null` when the project no longer exists); keep the list response free
  of the extra lookup. _(FR-004, FR-008; AC-004)_
- [x] **T1.5 — Validate the create override and route.** Add a `validateCreateFromPlan` chain in
  `server/src/routes/aiPlanRoutes.ts` and controller logic for the three cases — absent uses the
  stored destination, `null` forces a new project, a string selects a target — resolving and
  validating before the plan is claimed. _(FR-004, FR-008; AC-004, AC-008)_

## P2 — Create into an existing project

- [x] **T2.1 — Extract the shared plan record writer.** Refactor
  `server/src/utils/ai/plan/create.ts` so the new and existing paths share sprint creation, task
  draft building, reserved task numbers and batch inserts, returning the created ids and counts.
  The new-project behaviour must not change. _(FR-007, FR-009, FR-010, NFR-008; AC-007, AC-009)_
- [x] **T2.2 — Deduplicate sprint names.** Create
  `server/src/utils/ai/plan/sprints.ts` with case-insensitive suffixing (`(2)`, `(3)`, …) against
  the target's existing sprint names while keeping the 60-character limit; query those names once.
  _(FR-009; AC-009)_
- [x] **T2.3 — Implement the existing-project creation path.** In `create.ts`, branch on the resolved
  target: skip project creation and the name/key conflict checks, ignore the plan's project block,
  write the plan's sprints/epics/tasks/subtasks/criteria into the target, set `plan.projectId` to the
  target, and return the target with `destination: "existing"`. _(FR-009; AC-009)_
- [x] **T2.4 — Roll back only this request's records.** Track the ids inserted by each path; on failure
  delete only those records (and only the newly created project on the new path); never include the
  target project or its pre-existing sprints/tasks. Release the claim and leave the plan ready.
  _(FR-010, NFR-008; AC-007, AC-010)_
- [x] **T2.5 — Record activity and the destination.** Add `sprint.created` per new sprint and
  `ai.plan_created` with the target name and counts on the existing path; keep `project.created` only
  on the new path; return `destination` in both responses. _(FR-007, FR-009; AC-007, AC-009)_

## P3 — Client data flow

- [x] **T3.1 — Extend client types and API.** Add `PlanTarget`,
  `PlanUploadOptions.destination/targetProjectId`, `PlanOptions.targetProjectId`,
  `AiPlan.targetProject` and `CreatedFromPlan.destination`; send the upload field and the create
  override from `client/src/features/ai-plan/api.ts`. _(FR-004; AC-004)_
- [x] **T3.2 — Add destination helpers and defaults.** Set `destination: 'new'` and
  `targetProjectId: null` in `defaultOptions`, and create
  `client/src/features/ai-plan/lib/destination.ts` with `activeTargets` (archived excluded),
  `targetOf`, `targetProblem` and `targetLabel`. _(FR-003, FR-004; AC-003, AC-004)_
- [x] **T3.3 — Extend the plan flow hook.** Let `create` take an optional target override, keep the
  destination in `PlanRequest` for retry/regenerate, and expose the current target state from
  `useAiProjectPlan`. _(FR-004, FR-005; AC-004, AC-006)_

## P4 — Upload destination UI

- [x] **T4.1 — Build the searchable project picker.** Create
  `client/src/features/ai-plan/components/ProjectPicker.tsx`: a labelled filter input plus a listbox
  of non-archived projects showing name and key, with loading, empty and no-match states, keyboard
  operation and focus-visible styling. _(FR-003, NFR-006; AC-003, AC-011)_
- [x] **T4.2 — Build the destination picker.** Create
  `client/src/features/ai-plan/components/DestinationPicker.tsx`: two labelled radio cards
  ("Create a new project" selected by default, "Add to an existing project"), revealing the picker
  for the existing option and keeping the new-project path available when there are no targets.
  _(FR-003, NFR-006; AC-003, AC-011)_
- [x] **T4.3 — Integrate the destination into the upload step.** Add the fieldset above the document
  card in `UploadStep.tsx`, hide project name/key for an existing target, require a selected target,
  keep the planning fields, and send the destination in the upload. Keep the file chip, size,
  remove action and disabled states. _(FR-001, FR-002, FR-003, NFR-007; AC-001, AC-002, AC-003)_
- [x] **T4.4 — Keep the destination across retry and regenerate.** Ensure the selected destination
  and target survive a failed upload, retry and regenerate, and are restored when a plan is resumed.
  _(FR-002, FR-004; AC-002, AC-004)_

## P5 — Review and create UI

- [x] **T5.1 — Show and change the destination on review.** Add the destination banner ("New project:
  …" / "Adding to … (KEY)") and an inline change action to `ReviewStep.tsx`; handle a target that was
  archived or deleted and offer another target or a new project. _(FR-004, FR-006; AC-004, AC-005)_
- [x] **T5.2 — Make the project header read-only for existing targets.** In `PlanHeader.tsx`, replace
  the project name/key/description/colour editors with the target summary; make `planProblems` skip
  the generated project fields for an existing target. _(FR-006; AC-005)_
- [x] **T5.3 — Confirm adding to an existing project.** Label the primary action with the target and
  item count and open a confirmation dialog naming the target and the sprint/task/subtask/criteria
  counts; cancelling writes nothing. Reuse the create claim so a double submit cannot write twice.
  _(FR-011; AC-010)_
- [x] **T5.4 — Wire the page, toasts and directory reload.** Pass projects, loading and reload from
  `AiProjectPage.tsx`; create with the chosen target; show "created" versus "added" copy; reload the
  project directory after success. _(FR-007, FR-009; AC-007, AC-009)_

## P6 — Copy, accessibility and security verification

- [x] **T6.1 — Add English, French and Arabic copy.** Add the destination, selector, banner, change,
  confirmation, added-toast and target-error strings to
  `client/src/i18n/locales/{en,fr,ar}/aiPlan.json`; no hard-coded user-facing text. _(FR-012;
  AC-011)_
- [x] **T6.2 — Keyboard, RTL and touch-target pass.** Tab/arrow/Enter/Escape through the fieldset and
  picker, visible focus, programmatic labels, announced errors, logical direction utilities and at
  least 40px targets below `md` (44px for disclosure/menu rows). _(FR-012, NFR-006; AC-011)_
- [x] **T6.3 — Verify authentication, authorization and injection controls.** CON-511/CON-512:
  `protect` plus `projects:write`/`tasks:write` on every route; every target lookup scoped to
  `req.workspace._id`; foreign targets answer as missing. CON-515/CON-516: the upload field and
  create body are validated; `targetProjectId` is an ObjectId before Mongoose; no raw query
  interpolation. _(NFR-001, NFR-002, NFR-008; AC-008, AC-010)_
- [x] **T6.4 — Verify platform, prompt-injection and retention controls.** CON-513/CON-514/CON-519/
  CON-520 are reused; CON-518 is recorded as not applicable (header auth, no cookies). Confirm the
  prompt fencing, text-only rendering, no secrets in logs/activity, preview cleared on
  delete/cancel and the 30-day expiry. _(NFR-003, NFR-004, NFR-005; AC-012)_
- [x] **T6.5 — Run typecheck, lint, governance and browser checks.** `pnpm --filter server typecheck`,
  `pnpm --filter client typecheck`, `pnpm --filter client lint` and
  `node .sdrive/scripts/validate-governance.js`; then the browser check at 320/375/768/1024 px,
  keyboard only, en/fr/ar, covering empty, loading and error states. Do not run or author tests.
  _(FR-012, NFR-006; AC-011)_

  **Status:** Typecheck, full lint, governance and build pass. The browser pass ran in headless Chrome
  over CDP at 320/375/768/1024/1280 px: the settings AI card and the Projects page have no horizontal
  overflow, Tab reaches every AI card control in order, French is fully localised, Arabic sets
  `dir=rtl` without overflow, and the empty, loading, error, no-match and archived states were seen.
  The Arabic card body was captured in its loading state before the API rate limiter paused the run.

## P7 — Install-level AI provider presets

- [x] **T7.1 — Create the preset resolver.** Add `server/src/utils/ai/providers.ts` with the provider
  ids (`qwen` default, `deepseek`, `openai`, `openrouter`, `custom`), labels, default base URL and
  model, `AI_*` precedence over `DASHSCOPE_*`, HTTPS with the loopback exception for keyless `custom`,
  key/model requirements, and the `PROVIDER_UNKNOWN`/`KEY_MISSING`/`MODEL_MISSING`/`BASE_URL_INVALID`
  problems. Keep it pure and driven by a passed-in environment. _(FR-013, FR-014, FR-015; NFR-010;
  AC-013, AC-014)_
- [x] **T7.2 — Resolve and use the provider in both AI features.** Make `readAiConfig()` delegate to
  the resolver and return `provider`/`problem`, then build the OpenAI client in `provider.ts` from the
  resolved key and base URL and call the resolved model; use a placeholder key only for a keyless
  `custom` endpoint. Validation, the single repair retry and the timeout/token limits must not change.
  _(FR-013, FR-017; NFR-010; AC-013)_
- [x] **T7.3 — Expose the provider in the AI settings response.** Extend `settingsView` in
  `aiReviewController.ts` with `provider: { id, label }` and the optional `problem`, without returning
  the key or base URL. _(FR-016; NFR-009; AC-015)_
- [x] **T7.4 — Show the provider in workspace settings.** Add the provider/problem fields to
  `AiSettings`, replace the hard-coded heading in `AiReviewSettingsCard.tsx` with the resolved label,
  and make the unavailable copy name the variables an administrator must set. _(FR-016; NFR-011;
  AC-015)_
- [x] **T7.5 — Name the provider on the upload step.** Interpolate the resolved label into the
  document notice in `UploadStep.tsx`, keep a neutral fallback while settings load or are unavailable,
  and update the `ai` and `aiPlan` copy in English, French and Arabic with matching keys. _(FR-016;
  NFR-011; AC-015)_
- [x] **T7.6 — Document the variables and verify the change.** Rewrite the AI section of
  `server/.env.example` around `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL` and `AI_MODEL`, list the
  preset defaults and the legacy `DASHSCOPE_*` alias, then run server/client typecheck, client lint and
  `node .sdrive/scripts/validate-governance.js`, plus the browser checks at 320/375/768/1024 px,
  keyboard only, en/fr/ar, including the unavailable and legacy-config states. Do not run or author
  tests. _(FR-013, FR-015; NFR-009; AC-013, AC-015)_

  **Status:** Superseded by P9/T9.8: `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` and the
  `DASHSCOPE_*` alias were removed, and `server/.env.example` now states that workspace settings are
  the only provider and key source. Typecheck, lint, build and governance pass; the browser checks of
  the AI settings card and the upload page are recorded under T6.5 and T9.8. A legacy environment-config
  state no longer exists to exercise.

## P8 — OpenCode preset and Projects page actions

- [x] **T8.1 — Replace the OpenRouter preset with OpenCode.** In
  `server/src/utils/ai/providers.ts`, remove the `openrouter` entry and add
  `opencode` with the label `OpenCode Console`, base URL
  `https://opencode.ai/inference/openai/v1`, default model `deepseek-v4.1-flash-free`, and
  `requiresKey: true`. Update `AI_PROVIDER_IDS` to `qwen`, `deepseek`, `openai`, `opencode`, `custom`;
  keep the resolver pure, keep `AI_*` overrides, and keep `PROVIDER_UNKNOWN` for `openrouter` and any
  other old value. Do not change the route or the OpenAI client. _(FR-018, FR-019; NFR-009;
  AC-019, AC-020)_
- [x] **T8.2 — Update the client provider type and accepted-provider copy.** Replace `openrouter`
  with `opencode` in `AiProviderId` (`client/src/features/ai-review/types.ts`) and update
  `settings.problems.PROVIDER_UNKNOWN` in `client/src/i18n/locales/{en,fr,ar}/ai.json` to list
  `qwen`, `deepseek`, `openai`, `opencode`, `custom`. Keep the `{{provider}}` notice copy working and
  keep all three locales aligned. _(FR-018, FR-019; NFR-011; AC-020, AC-021)_
- [x] **T8.3 — Document the OpenCode preset and remove OpenRouter references.** In
  `server/.env.example`, list `qwen` (default), `deepseek`, `openai`, `opencode`, `custom`; add the
  OpenCode Console base URL and default model; remove the OpenRouter line; note that the free model
  still requires an OpenCode Console key and is promotional. Keep placeholders only and no secrets.
  _(FR-018, FR-019; NFR-009; AC-020, AC-021)_
- [x] **T8.4 — Move Projects page creation actions into the header.** In
  `client/src/pages/ProjectsPage.tsx`, pass a responsive action group to `PageHeader` containing the
  primary "New project" button and a secondary "Create with AI" button with the `Sparkles` icon. Show
  the AI action only when `canCreateWithAi` (`projects:write` + `tasks:write`) and navigate to
  `/{workspaceSlug}/projects/new/ai`. Remove the `NewProjectCard`/`AiProjectCard` imports and grid
  entries; delete both components; remove their exports from `features/projects/index.ts` and
  `features/ai-plan/index.ts`. Add `projects.page.createWithAi` and remove the unused
  `project.newCard` and `aiPlan.card` keys in all three locales. Keep the empty, no-match, loading,
  error and archived branches working. _(FR-020; AC-016, AC-017)_
- [x] **T8.5 — Make the Projects page responsive and accessible.** Change the shared grid to
  `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4`, stack the header action group below
  `sm` and row-align it from `sm`, and keep the search/sort controls stacked below `sm`. Verify no
  horizontal scroll at 320/360 px, visible focus and keyboard order, at least 40 px touch targets
  below `md`, and correct en/fr/ar and RTL rendering. _(NFR-012; AC-018)_
- [x] **T8.6 — Verify the update.** After T8.1–T8.5, run server/client typecheck, client lint, client
  build and `node .sdrive/scripts/validate-governance.js`. Then exercise the Projects page at
  320/360/768/1024/1280 px with keyboard only and en/fr/ar copy across empty, loading, error,
  no-match and archived states; exercise the AI settings/upload surfaces with `opencode`, a missing
  key, an unknown `openrouter` value and a `custom` fallback. Confirm no key or base URL appears in
  responses, logs or the client bundle. If an OpenCode Console key is available, generate one plan to
  confirm JSON-mode support and latency; otherwise record the unverified behavior in the PR. Do not run
  or author tests. _(FR-018, FR-019, FR-020; NFR-012; AC-016-AC-021)_

  **Status:** Typecheck, lint, build and governance pass. The Projects page was checked at
  320/360/768/1024/1280 px in headless Chrome (list, empty, loading, error, no-match and archived
  states, no overflow). Provider checks: the `opencode` preset saves with its base URL and default
  model, its test rejects a dummy key with `AI_AUTH`, an unknown `openrouter` value is rejected with
  400, and a custom HTTPS endpoint saves, replaces and removes. No key or encrypted-key field name is
  in the client bundle. A real OpenCode Console key was not available, so JSON mode and latency remain
  unverified.

## P9 - Workspace-level BYOK and dashboard setup

- [x] **T9.1 - Add the workspace AI schema and resolver.** Extend `Workspace.ai` in
  `server/src/models/workspaceModel.ts` with `provider`, `baseURL`, `model`, `apiKeyEncrypted`
  (`select:false`), `keyHint`, `configuredAt`, `configuredBy`, `lastTestedAt`, `lastTestStatus` and
  `lastTestCode`; keep `enabled`/`autoReview` default false. Add
  `server/src/utils/ai/workspaceConfig.ts` to validate the stored fields, decrypt with
  `secretBox` using `String(workspaceId)` as context, apply only `readAiLimits()`, and return
  `{ available, provider, model, baseURL, apiKey, keySet, keyHint, problem, limits }`. Split
  `config.ts` into limits and remove the `AI_*`/`DASHSCOPE_*` provider fallback. Missing provider is
  `AI_NOT_CONFIGURED`; an unreadable ciphertext is `KEY_UNREADABLE`. No migration and no key copy.
  _(FR-021, FR-026; NFR-013, NFR-016; AC-022, AC-025, AC-027)_
- [x] **T9.2 - Add the HTTPS URL guard and pinned provider fetch.** Add
  `server/src/utils/ai/urlGuard.ts`: accept only HTTPS, reject credentials/query/fragment, parse the
  host and port, resolve every DNS answer and reject loopback, private, link-local, multicast, reserved
  and cloud-metadata IPv4, IPv6 and mapped addresses. Add `server/src/utils/ai/pinnedFetch.ts` using
  `node:https` with a `lookup` pinned to the validated address and the original TLS servername, no
  redirects, AbortSignal/timeouts and a response-size cap. Add `testAiConnection(config)` in
  `provider.ts` using a minimal content-free chat request and safe result codes. _(FR-023, FR-028;
  NFR-014; AC-028, AC-029)_
- [x] **T9.3 - Add the workspace provider settings API.** Make `GET /ai` resolve `Workspace.ai` and
  return availability/provider/model/problem; return the `config` block (`keySet`, `keyHint`,
  `baseURL`, `configuredAt`, `configuredBy`, `lastTestedAt`, `lastTestStatus`, `lastTestCode`) only
  when `req.permissions` includes `settings:manage`. Add `PUT /ai/provider`, `DELETE /ai/provider`
  and `POST /ai/provider/test` with `rejectApiToken` + `settings:manage` and a 5/min
  per-workspace/user test limiter. Validate provider/model/key length/custom URL; require a key on the
  first save or provider change, keep the saved key when the field is blank on the same provider,
  encrypt with `secretBox(workspaceId)`, store the hint and metadata, and clear last-test metadata on
  replacement. Record `ai.settings_updated` with action/provider/model/key set/replaced/cleared, never
  the key or endpoint. Enforce `enabled` only when available and `autoReview` only when enabled, and
  set both false on a first save so a legacy opt-in cannot silently resume. Never return or log the
  key. _(FR-021, FR-022, FR-023, FR-027, FR-028, FR-029; NFR-013, NFR-016;
  AC-022, AC-025, AC-026, AC-028, AC-029)_
- [x] **T9.4 - Wire AI code review to the workspace configuration.** Change
  `queueReview` to accept the workspace `ai` subdocument, resolve the config and return
  `AI_NOT_CONFIGURED` before any provider request, use the workspace daily limit and store
  `config.model`. In `runReview`, select `+ai.apiKeyEncrypted`, re-resolve, check
  `enabled`/`available`, and pass the config to `reviewWithModel`. Keep `queueAutoReview` on the same
  path; make the GitHub webhook select `+ai.apiKeyEncrypted` and pass `workspace.ai` and the workspace
  id. An in-flight review keeps the model it started with; removal makes the next request
  `AI_NOT_CONFIGURED`. _(FR-024, FR-025; NFR-016; AC-023, AC-024, AC-027)_
- [x] **T9.5 - Wire document plans and the settings view to the same configuration.** Update
  `assertPlanFeatureOn`/`assertCanQueuePlan` to resolve the workspace config, `createQueuedPlan` to
  store its model, and `runPlan` to select `+ai.apiKeyEncrypted`, re-resolve, check
  `enabled`/`available` and pass the config to `generateJson`. In `aiPlanController`, load the
  ciphertext with the feature flags and pass the workspace id/settings. Make `settingsView` use the
  same resolver for availability/provider/model. No environment fallback, no record rewrite; existing
  plans and reviews stay readable. _(FR-024, FR-025, FR-027; NFR-016; AC-023, AC-024, AC-026,
  AC-027)_
- [x] **T9.6 - Add the client provider form and settings data flow.** Extend
  `client/src/features/ai-review/types.ts` with the manager config view, provider save/test inputs and
  results, and the new problem codes. Add `saveProvider`/`removeProvider`/`testProvider` to `api.ts`
  and `useAiSettings`. Create `AiProviderForm.tsx` with the provider select, preset endpoint/model
  disclosure, custom HTTPS URL/model, write-only key and show/hide control, save/replace/remove with
  confirmation, test, key hint, configured-by/time, last-test status and safe errors. Mount it in
  `AiReviewSettingsCard` above the notice/toggles; keep the card manager-only. Reuse the design-system
  primitives and `ConfirmActionDialog`; add no UI library. _(FR-022, FR-029; NFR-015; AC-022,
  AC-030)_
- [x] **T9.7 - Update copy, states and accessibility.** Update
  `client/src/i18n/locales/{en,fr,ar}/ai.json` and `aiPlan.json` with the provider form, status, error
  and `AI_NOT_CONFIGURED`/`KEY_UNREADABLE`/`BASE_URL_*` copy; remove the installation-variable wording.
  Wire `AiReviewPanel`, `UploadStep` and `features/ai-plan/lib/errors.ts` to the workspace copy. Ensure
  programmatic labels, `aria-describedby`/`aria-live` errors, visible focus, at least 40 px targets
  below `md`, no 320 px overflow, LTR key/URL fields in RTL, and configured/testing/success/failure
  states distinguished by text and icon as well as colour. Never prefill a saved key; discard the
  unsaved value on 403. _(FR-029; NFR-015; AC-022, AC-023, AC-030)_
- [x] **T9.8 - Document and verify the workspace BYOK update.** Mark `AI_*`/`DASHSCOPE_*` as legacy
  limits-only in `server/.env.example` and state that workspace settings is the sole provider/key
  source. Run server/client typecheck, client lint, client build,
  `node .sdrive/scripts/validate-governance.js` and a changed-file secret scan. Exercise 320/360/768/
  1024/1280 px, keyboard only, en/fr/ar and RTL: unconfigured, preset save/replace/remove, valid custom
  HTTPS, rejected HTTP/private/metadata/redirect, test success/failure/rate limit, missing key,
  permission revoked, and `AI_NOT_CONFIGURED` in the review panel and upload. Confirm no key appears in
  responses, logs or the client bundle. Do not author or run tests; record MongoDB/API-key blockers.
  _(FR-024, FR-028; NFR-013, NFR-014, NFR-015, NFR-016; AC-022..AC-030)_

  **Status:** Typecheck, lint, build, governance and a changed-file/bundle secret scan pass. API: the
  unconfigured state, qwen save (keySet + last-4 hint), dummy-key test failing with `AI_AUTH`, the
  `AI_TEST_RATE_LIMIT` limiter, rejection of HTTP/private/metadata endpoints, key retention for an
  unchanged destination, rejection of a custom re-point without a key, and remove back to
  `AI_NOT_CONFIGURED`. UI at 320/375/768/1024/1280 px: no overflow, keyboard order, French localised,
  Arabic RTL, error with retry and the upload page's unconfigured notice. Two defects were found and
  fixed while verifying: a Mongoose projection collision made every `GET /ai` return 500 (`bf27583`),
  and the privacy notices rendered empty parentheses without a model (`9f5f545`). Unverified: a real
  test success, redirect refusal end-to-end, the permission-revoked view and the review panel's
  `AI_NOT_CONFIGURED` (no PR-linked task in the throwaway workspace).

## P10 - AI assistant card copy

- [x] **T10.1 - Rename the card and add the capability bullets.** In
  `AiReviewSettingsCard.tsx` render a short description and a semantic list of capabilities from
  `settings.capabilities`; in `client/src/i18n/locales/{en,fr,ar}/ai.json` set `settings.title` to
  "AI assistant", rewrite `settings.description`, add `settings.capabilities.codeReview` and
  `settings.capabilities.documentPlans`, and change `settings.enable.label`/`description` to cover
  both features. Keep the provider panel, notice, token field and auto-review switch unchanged.
  _(FR-030; AC-031, AC-032)_
- [x] **T10.2 - Align the remaining card copy and confirm the shared gate.** Change
  `settings.loadError` to "AI settings", read the card end to end to confirm nothing claims the
  settings are review-only (the notice, auto-review and token copy stay review-specific because they
  describe that flow), and confirm `ai.enabled` still gates both `assertReviewFeatureOn` and
  `assertPlanFeatureOn` with no server, API, schema or permission change. _(FR-030; NFR-017;
  AC-031, AC-032)_
- [x] **T10.3 - Verify the card across widths, languages and input modes.** Run client typecheck,
  client lint, client build, `node .sdrive/scripts/validate-governance.js` and a changed-file
  secret scan. Check 320/375/768/1024/1280 px, keyboard only, en/fr/ar and RTL in the configured and
  unconfigured states: heading, both bullets, switch label, no review-only wording, no horizontal
  overflow, and the upload page still reacting to the same switch. Do not author or run tests.
  _(NFR-017; AC-033)_

## P11 - Project-scoped document plans and folder creation cards

- [x] **T11.1 - Remove the destination choice from the new-project flow.** Replace the destination
  state and picker with a fixed destination: the create-with-AI page always creates a new project,
  the name/key fields always render, the review banner reads "New project: <name>", and create
  sends an explicit null override. Remove the `DestinationPicker` usage and the `needTarget` guard
  without touching the API. _(FR-031; AC-034, AC-035)_
- [x] **T11.2 - Add the project-scoped route and page mode.** Add
  `/:workspaceSlug/projects/:projectId/plan` behind `projects:write` and teach `AiProjectPage` a
  project-scoped mode: resolve the project from the directory, show loading/not-found/no-access
  states, title "Add a plan to {project}", back link to the project, and a fixed target. Add
  `planBelongsToProject` and refuse a `?plan=` id stored for another project or already created,
  offering the generic plan page or a return to the project. _(FR-032; AC-037, AC-039)_
- [x] **T11.3 - Add "Add from document" to the project header.** Add the outline action to
  `ProjectDetailPage` for members with `projects:write` and `tasks:write` when the project is
  active, linking to the project-scoped wizard; keep Edit, Project chat, Open board and New sprint
  in order and keep the mobile stacking. _(FR-032; AC-036)_
- [x] **T11.4 - Scope the wizard copy and create payload to the project.** In project mode render
  the read-only "Adding to <name> <key>" line, hide the name/key fields, make the review
  destination read-only, use the add/create copy and confirmation, send `targetProjectId` on
  create, and return to the project on success. _(FR-032; AC-037, AC-038)_
- [x] **T11.5 - Restore the folder creation cards at the start of the grid.** Restore
  `NewProjectCard` and `AiProjectCard`, render them as the first items of the active grid when the
  query is empty, remove the header creation buttons, give the zero-project empty state both
  actions, and keep archived, no-match and search behaviour. _(FR-033; AC-040, AC-041)_
- [x] **T11.6 - Localise, clean up and verify both modes.** Add en/fr/ar copy for the cards,
  project mode and read-only target; remove the unused destination copy and picker files; run
  server/client typecheck, client lint, client build,
  `node .sdrive/scripts/validate-governance.js` and a changed-file secret scan; verify both wizard
  modes and the Projects page at 320/375/768/1024/1280 px, keyboard, en/fr/ar and RTL. Do not
  author or run tests. _(NFR-018; AC-042)_

  **Status:** Server and client typecheck, client lint, client build, governance validation and a
  changed-file secret scan pass. The client build needs
  `NODE_OPTIONS=--max-old-space-size=3072` in this environment; with the default heap it runs out of
  memory, but the build itself completes with 3,783 modules and no compile error. Browser checks at
  1280 px: the Projects grid starts with "New project" then "Create with
  AI", the header has no creation buttons, searching hides both cards, and there is no horizontal
  overflow at 320/375/768/1024/1280 px. The project header shows "Add from document" with the
  correct href and hides it for the archived project. The project-scoped upload step shows
  "Adding to P11 Document Target (P11D)", hides the project name/key fields, keeps the back link to
  the project and uses the existing-project options hint. The review step shows the fixed target,
  has no "Change destination" control, and labels the action "Add 1 item to P11 Document Target
  (P11D)". A `?plan=` id stored for another project shows the mismatch panel with "Open the plan"
  and "Back to the project"; an archived project shows the archived panel. New-project mode still
  asks for the project name and shows no target banner. Arabic renders RTL with no overflow (the
  capture was taken while the project directory was still loading). End to end: adding the seeded
  plan from the project page created the tasks in that project (`plan.projectId` = the project) and
  returned to its detail page; creating from the new-project page created "P11 New From Doc"
  (`P11N`) and navigated to it. Client tests were not authored, edited or run; `/sdrive:test` owns
  them, including `AiReviewSettingsCard.test.tsx`'s old "Enable AI code review" assertion.

## P12 - Projects header creation actions

- [ ] **T12.1 - Restore the Projects header creation actions.** In `ProjectsPage.tsx`, pass the
  existing permission-gated `pageActions` group to `PageHeader` when the workspace has at least one
  project; keep the zero-project empty state as the only action area in that state; add an
  accessible group label (`page.projectActions` in en/fr/ar); keep the dashed cards first, search
  hiding, archived grid, sort, loading and error behaviour unchanged. Do not change the server,
  API, schema or permission model. _(FR-034; NFR-019; AC-043, AC-044, AC-045, AC-046)_
- [ ] **T12.2 - Verify the header actions across states and widths.** Run client typecheck, client
  lint, client build, `node .sdrive/scripts/validate-governance.js` and a changed-file secret scan.
  Check 320/375/768/1024/1280 px, keyboard only, en/fr/ar and RTL: header and cards both offer the
  actions; read-only sees neither; `projects:write` without `tasks:write` sees only "New project";
  searching hides the cards but not the header; archived projects have no cards; zero projects shows
  the empty-state actions without a duplicate header group; the create dialog and AI route open. Do
  not author or run tests. _(FR-034; NFR-019; AC-043, AC-044, AC-045, AC-046)_
