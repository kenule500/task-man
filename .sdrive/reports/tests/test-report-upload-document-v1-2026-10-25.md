# Test Report — upload-document (v1)

- **Feature:** upload-document
- **Version:** v1
- **Branch:** `feature/upload-document`
- **Base:** `main`
- **Commit tested:** `86f0cb71fd7af0a22b2fc8d7942072503cd38728`
- **Report date:** 2026-10-25 (UTC run window)
- **PR:** [#43](https://github.com/kenule500/task-man/pull/43)

This report replaces the 2026-10-24 report. It records the suite results, the AC/TEST mapping and the supersession notes used by the review.

## 1. Results

| Suite | Command | Suites | Tests | Result |
|---|---|---:|---:|---|
| Server unit | `pnpm --filter server test --verbose` | 48 | 694 | pass |
| Client unit | `pnpm --filter client test --verbose --runInBand` | 193 | 1925 | pass |
| **Unit total** | | **241** | **2619** | **pass** |
| Server integration (real MongoDB) | `pnpm test:integration` (from `server/`) | 41 | 744 | pass |

- `sdrive test upload-document` recorded exit code `0` for the unit command at commit `86f0cb7`.
- Evidence: `.sdrive/governance/upload-document/v1/test-evidence.json` (`commit: 86f0cb7…`, `exitCode: 0`, `durationMs: 508272`).
- The client was run with `--runInBand` after a transient Jest worker OOM at `86f0cb7`; the same 193 suites / 1925 tests passed. This is a runner-memory mitigation, not a code change.
- The integration suite was run separately at the same commit (441.9 s). It needs the local MongoDB instance on `127.0.0.1:27017` and is not part of the `sdrive test` unit command.

## 2. Traceability audit

- `traceability.json` has **53 rows**, covering **46 acceptance criteria** and **47 unique TEST IDs**.
- Every row has `status: "complete"`.
- Every one of the 47 TEST IDs was found literally in a test file under `server/src` or `client/src`.
- Every one of the 46 AC IDs appears in at least one test name.
- All feature test declarations added or changed for this feature carry an AC ID. The only untagged declarations in touched files are pre-existing tests for other features (task board, project CRUD, 2FA recovery codes); they are outside this feature's CON-405 scope.

## 3. TEST → test → file

The AC/FR columns are the traceability unions for that TEST ID. A TEST ID can cover more than one row because the plan groups related criteria.

| TEST | AC | FR | Test name | File |
|---|---|---|---|---|
| TEST-001 | AC-001, AC-006, AC-008, AC-012 | FR-001, NFR-002, NFR-003, NFR-005, NFR-007 | TEST-001 AC-001: refuses files it can already tell are wrong, with the reason | `client/src/features/ai-plan/__tests__/UploadStep.test.tsx` |
| TEST-002 | AC-002 | FR-002 | TEST-002 AC-001/AC-002: starts only when a document is chosen, and sends the file with the options | `client/src/features/ai-plan/__tests__/UploadStep.test.tsx` |
| TEST-003 | AC-003 | FR-003 | TEST-003 AC-003 (superseded by AC-034): the upload step has no destination choice and always asks for the new project name and key | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-004 | AC-004 | FR-004 | TEST-004 AC-004: picks a plan up again from the address after a reload | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-005 | AC-005 | FR-006 | TEST-005 AC-005: shows the generated project like the mock: header, tabs with counts, sprints with dates, goals and tasks | `client/src/features/ai-plan/__tests__/ReviewStep.test.tsx` |
| TEST-006 | AC-001, AC-006 | FR-005, NFR-007 | TEST-006 AC-006: generates the plan again from the document still held in the tab, deleting the old plan first | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-007 | AC-007, AC-010 | FR-007, NFR-008 | TEST-007 AC-007: offers the free name or key when the server says it is taken | `client/src/features/ai-plan/__tests__/ReviewStep.test.tsx` |
| TEST-008 | AC-001, AC-008, AC-010 | FR-008, NFR-001, NFR-002, NFR-005 | TEST-008 AC-008: validates the target when the document is uploaded: invalid, foreign and archived are refused | `server/src/__integration__/aiPlan.test.ts` |
| TEST-009 | AC-009 | FR-009 | TEST-009 AC-009: writes only the plan records: the project, its sprint and its task stay untouched | `server/src/__integration__/aiPlan.test.ts` |
| TEST-010 | AC-007, AC-008, AC-010 | FR-010, FR-011, NFR-001, NFR-008 | TEST-010 AC-010: rolls back only the records it wrote, never the target or its own sprint and task | `server/src/__integration__/aiPlan.test.ts` |
| TEST-011 | AC-011 | FR-012, NFR-006 | TEST-011 AC-011 (superseded by AC-030/AC-046): the surviving upload controls keep programmatic labels and keyboard focus | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-012 | AC-001, AC-012 | NFR-003, NFR-004 | TEST-012 AC-012: fences the document with the boundary and declares it untrusted data | `server/src/__tests__/aiPlanPrompt.test.ts` |
| TEST-013 | AC-013 | FR-013, FR-015, FR-017, NFR-010 | TEST-013 AC-013 (superseded by AC-022/AC-027): presets supply the endpoint and model, and the environment supplies neither | `server/src/__tests__/aiConfig.test.ts` |
| TEST-014 | AC-014 | FR-014, NFR-009 | TEST-014 AC-014/AC-027: keeps legacy DashScope provider variables out of workspace AI and reads only limits | `server/src/__tests__/aiConfig.test.ts` |
| TEST-015 | AC-015 | FR-016, NFR-011 | TEST-015 AC-015/AC-021/AC-031/AC-033: tells people their code goes to a third party before they can switch it on | `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` |
| TEST-016 | AC-016, AC-017, AC-018 | FR-020 | TEST-016 AC-016 (superseded by AC-040/AC-043): the dashed creation cards are back at the start of the grid | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-017 | AC-016, AC-017, AC-018 | FR-020 | TEST-017 AC-017 (superseded by AC-041/AC-044): keeps header actions through search and archived views while hiding the cards | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-018 | AC-016, AC-017, AC-018 | FR-020, NFR-012 | TEST-018 AC-018 (superseded by AC-042/AC-046): groups the header actions, stacks them below sm and keeps 40px targets | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-019 | AC-019, AC-021 | FR-018 | TEST-019 AC-019 (superseded by AC-022/AC-027): opencode is a workspace preset, not an environment provider | `server/src/__tests__/aiConfig.test.ts` |
| TEST-020 | AC-020, AC-021 | FR-019 | TEST-020 AC-020 (superseded by AC-022/AC-027): openrouter is not a preset and env-only openrouter is ignored, while custom stays available | `server/src/__tests__/aiConfig.test.ts` |
| TEST-021 | AC-019, AC-020, AC-021 | FR-018, FR-019 | TEST-021 AC-015/AC-021/AC-031: shows usage and the model | `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` |
| TEST-022 | AC-022, AC-023, AC-025, AC-029, AC-030 | FR-021, FR-022, FR-023, FR-029 | TEST-022 AC-022: saves a preset with its endpoint and model, and never returns the key | `server/src/__integration__/aiReview.test.ts` |
| TEST-023 | AC-022, AC-023, AC-024, AC-027 | FR-021, FR-024, FR-025, NFR-016 | TEST-023 AC-023: asks for JSON mode with the configured model and returns the validated answer and token usage | `server/src/__tests__/aiProvider.test.ts` |
| TEST-024 | AC-023, AC-024 | FR-025 | TEST-024 AC-024: retries 429 and 5xx twice, then gives up with a safe message | `server/src/__tests__/aiProvider.test.ts` |
| TEST-025 | AC-022, AC-025 | FR-022, FR-026, NFR-013 | TEST-025 AC-025: round-trips a secret and never stores it in the clear | `server/src/__tests__/secretBox.test.ts` |
| TEST-026 | AC-026 | FR-027 | TEST-026 AC-026: removing the configuration clears the key and provider, turns AI and automatic review off, and keeps history readable | `server/src/__integration__/aiReview.test.ts` |
| TEST-027 | AC-023, AC-027 | FR-024, NFR-016 | TEST-027 AC-027: ignores a plain-http base URL and bad numbers | `server/src/__tests__/aiConfig.test.ts` |
| TEST-028 | AC-028, AC-029 | FR-028, NFR-014 | TEST-028 AC-028: tests the connection with the saved configuration, records the result and time, and sends no workspace content | `server/src/__integration__/aiReview.test.ts` |
| TEST-029 | AC-022, AC-028, AC-029 | FR-023, FR-028, NFR-014 | TEST-029 AC-029: accepts an HTTPS URL and drops trailing slashes | `server/src/__tests__/aiUrlGuard.test.ts` |
| TEST-030 | AC-022, AC-030 | FR-029, NFR-015 | TEST-030 AC-030: %s has every key of English and no extra (fr/ar) | `client/src/features/ai-review/__tests__/locales.test.ts` |
| TEST-031 | AC-031, AC-032 | FR-030 | TEST-031 AC-031/AC-032: turns the feature on and then auto review | `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` |
| TEST-032 | AC-031, AC-032 | FR-030 | TEST-032 AC-032: is disabled with an explanation when the workspace has not opted in | `client/src/features/ai-review/__tests__/AiReviewPanel.test.tsx` |
| TEST-033 | AC-033 | NFR-017 | TEST-033 AC-032/AC-033: is disabled for people who cannot edit tasks, but they still see earlier results | `client/src/features/ai-review/__tests__/AiReviewPanel.test.tsx` |
| TEST-034 | AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-031, NFR-018 | TEST-034/TEST-035 AC-034/AC-035: walks from the upload to the new project: analyze, review, create, open | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-035 | AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-031, NFR-018 | TEST-034/TEST-035 AC-034/AC-035: walks from the upload to the new project: analyze, review, create, open | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-036 | AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-032, NFR-018 | TEST-036 AC-036: offers "Add from document" to members who can write projects and tasks | `client/src/pages/__tests__/ProjectDetailPage.test.tsx` |
| TEST-037 | AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-032, NFR-018 | TEST-037 AC-037: opens the wizard for the project, fixes the destination and hides the name and key fields | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-038 | AC-007, AC-008, AC-010, AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-010, FR-011, FR-032, NFR-001, NFR-008, NFR-018 | TEST-038 AC-010/AC-038: adds the reviewed plan to the project, says so and returns to the project | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-039 | AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-032, NFR-018 | TEST-039 AC-039: refuses a plan stored for another project and points at the plan instead of writing | `client/src/pages/__tests__/AiProjectPage.test.tsx` |
| TEST-040 | AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-033, NFR-018 | TEST-040/TEST-042 AC-040/AC-041/AC-042: shows one folder link per project with counts, progress and the active sprint | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-041 | AC-016, AC-017, AC-018, AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-020, FR-033, NFR-018 | TEST-041 AC-041: filters by name or key and offers to clear an empty search | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-042 | AC-016, AC-017, AC-018, AC-034, AC-035, AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042 | FR-020, FR-033, NFR-012, NFR-018 | TEST-040/TEST-042 AC-040/AC-041/AC-042: shows one folder link per project with counts, progress and the active sprint | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-043 | AC-016, AC-017, AC-018, AC-043, AC-044, AC-045, AC-046 | FR-020, FR-034 | TEST-043 AC-043: shows the header actions and opens the create-project dialog | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-044 | AC-043, AC-044, AC-045, AC-046 | FR-034 | TEST-044 AC-044: keeps the header actions when the sort changes | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-045 | AC-043, AC-044, AC-045, AC-046 | FR-034 | TEST-045 AC-045: does not repeat the empty-state actions in the header | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-046 | AC-016, AC-017, AC-018, AC-043, AC-044, AC-045, AC-046 | FR-020, FR-034, NFR-012, NFR-019 | TEST-046 AC-046: translates the header actions and works RTL | `client/src/pages/__tests__/ProjectsPage.test.tsx` |
| TEST-047 | AC-011 | FR-012, NFR-006 | TEST-047 AC-011: %s has every key of English and no extra (fr/ar) | `client/src/features/ai-plan/__tests__/locales.test.ts` |

## 4. Superseded acceptance criteria

The following ACs are kept in the specification for history. Their tests carry an explicit `(superseded by …)` note and assert the behaviour that replaced them.

| Superseded AC | Replaced by | Behaviour asserted |
|---|---|---|
| AC-003 | AC-034 | The new-project upload page no longer offers a destination choice; it always asks for the new project name and key. `TEST-003`. |
| AC-011 | AC-030, AC-046 | The project/destination selector was removed; the surviving upload controls keep labels and keyboard focus, and the Arabic/French translations are complete. `TEST-011`, `TEST-047`. |
| AC-013 | AC-022, AC-027 | Provider configuration is workspace-level BYOK; the environment no longer supplies the provider endpoint or model. `TEST-013`. |
| AC-016 | AC-040, AC-043 | Folder cards are restored in the project grid and the header holds the creation actions. `TEST-016`. |
| AC-017 | AC-041, AC-044 | Header actions persist through search, sort and archived views, and folder cards are shown. `TEST-017`. |
| AC-018 | AC-042, AC-046 | Responsive header grouping, 40 px targets and RTL/localisation replace the earlier header/action layout rule. `TEST-018`. |
| AC-019 | AC-022, AC-027 | OpenCode is a workspace preset, not an environment-selected provider. `TEST-019`. |
| AC-020 | AC-022, AC-027 | OpenRouter is not a preset; environment-only OpenRouter is ignored and `custom` remains available. `TEST-020`. |

## 5. Scanner (spec-to-code) result

`sdrive verify upload-document` at `86f0cb7` returned:

- **matched:** 28
- **missing:** 127
- **renamed:** 2
- **extra:** 188
- **status:** `fail`

The 127 missing items are attributable under CON-614, not product gaps:

- **57 components:** 53 exist at the planned path but under client/workspace-package paths the scanner does not walk. The 4 that do not exist are intentional/obsolete: `ProjectPicker.tsx` and `DestinationPicker.tsx` were deleted when the destination choice was superseded (P11), and the two `delete` entries for `NewProjectCard.tsx`/`AiProjectCard.tsx` are stale because the P12 update restored those cards.
- **6 entities:** declared as Mongoose schemas (`AiPlan`, `Project`, `Sprint`, `Task`, `Activity`, `Workspace`).
- **33 fields:** Mongoose/TypeScript fields, including `options.targetProjectId` and the workspace `ai.*` settings; the scanner does not read Mongoose field declarations.
- **19 dependencies:** declared in `server/package.json` or `client/package.json` (workspace packages), not the root `package.json` — e.g. `helmet`, `express-rate-limit`, `express-validator`, `multer`, `mongoose`, `zod`, `unpdf`, `jszip`, `openai`, `react-i18next`, `react-router-dom`.
- **12 endpoints:** present in the routers but planned with an absolute `/api/workspaces/:slug/...` path while the route files declare relative mounts (`/:slug/...`). The plan path and the runtime path agree.
- **2 renamed:** scanner path-attribution artifacts for `server/jest.config.cjs`; both planned names exist (`server/src/utils/workflow.ts`, `server/src/utils/taskNumbers.ts`, `server/.env.example`).
- **8 extra components** are legitimate AI implementation helpers (`autoReview.ts`, `diffSelect.ts`, `githubPr.ts`, `plan/config.ts`, `plan/dates.ts`, `plan/text.ts`, `prompt.ts`, `schema.ts`); **180 extra endpoints** are the workspace-relative form of existing routes plus unrelated pre-existing routes.

The review records this as a CON-602/CON-614 advisory result; no missing item is a real product gap.

## 6. CI evidence

- CI run `40243096310` at `86f0cb7`: **success** (Server and Client jobs, dependency audit).
- CodeQL run `40243096312` at `86f0cb7`: **success**; PR check `CodeQL` is **SUCCESS**.
- PR #43 check rollup: all checks pass.
