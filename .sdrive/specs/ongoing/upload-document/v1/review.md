---
status: FAIL
feature: upload-document
version: v1
commit: 5c9f94c0fbec69d03c2924dcf40c039bf053153b
branch: feature/upload-document
base: main
reviewedBy: kenule500
reviewedAt: 2026-10-24T13:48:05.757Z
coverage: 61
evidence: .sdrive/governance/upload-document/v1/test-evidence.json
---

# Review Report: Upload a document and turn it into a project plan with AI (v1)

## 1. Audit Summary

- **Status:** FAIL
- **Date:** 2026-10-24
- **Reviewer:** kenule500 via the OpenCode review agent (independent: no; the same human authored the branch and no feature assignee is recorded)
- **Version:** v1
- **Commit:** `5c9f94c0fbec69d03c2924dcf40c039bf053153b`
- **Branch / base:** `feature/upload-document` / `main`
- **Lifecycle:** `.sdrive/specs/ongoing/upload-document/v1/` (not moved)
- **PR:** [#43](https://github.com/kenule500/task-man/pull/43)

The implementation is substantial and the local unit suites are green, but the feature is not releasable. The required test evidence is missing, coverage is 61% rather than 100%, CI is red on `HEAD`, the dependency audit fails, CodeQL reports two high-severity alerts in changed code, and the traceability file overstates which acceptance criteria are actually tested.

## 2. Evidence

- **Test evidence:** `.sdrive/governance/upload-document/v1/test-evidence.json` is **missing**. There is no exit code, pass/fail summary, or `commit === HEAD` binding. Commit `5c9f94c` is titled "specdrive(test): record upload-document test evidence" but the file was never added. This is a blocking finding.
- **Test report:** `.sdrive/reports/tests/test-report-upload-document-v1-2026-10-24.md` (2026-10-24 14:11 local). It is newer than `spec.md` (11:33) and `plan.md` (12:08) and reports 143/143 targeted tests, but only 28/46 ACs tested (61%).
- **Verification:** `.sdrive/governance/upload-document/v1/verification.json`; `sdrive verify upload-document --json` returns **fail** with `matched 28`, `missing 127`, `renamed 2`, `extra 188` (exit 7, 127 blockers, 188 warnings). The CON-614 scanner gaps explain most paths, but the plan also has stale P11/P12 actions, so this is not fully cleared.
- **Audit chain:** `.sdrive/audit-log.json`; `sdrive audit:verify --json` returns ok (2 hashed events verified, 6 legacy events unhashed).
- **Governance validation:** `sdrive validate --json` returns ok for the governance files. `sdrive check --json` returns **fail** (exit 4) because the installed framework has no permission rules for `mcp:sync` and `knowledge:fetch`; it also warns about 5 unverified adapter paths and installed files 0.1.44 vs CLI 0.1.46.
- **Permission:** `node .sdrive/scripts/check-permission.js slash /sdrive:review` allows `kenule500` (admin).
- **CI:** [run 40097265178](https://github.com/kenule500/task-man/actions/runs/40097265178) is **failure** on `5c9f94c0fbec69d03c2924dcf40c039bf053153b`.
  - Server job: [120882018393](https://github.com/kenule500/task-man/actions/runs/40097265178/job/120882018393): `src/__integration__/aiPlan.test.ts` and `src/__integration__/aiReview.test.ts` fail; 61 failed / 671 passed (732 tests). The logs include `503 AI_NOT_CONFIGURED` and a downstream `TypeError: Cannot read properties of undefined (reading '_id')` at `aiPlan.test.ts:464`.
  - Client job: [120882018564](https://github.com/kenule500/task-man/actions/runs/40097265178/job/120882018564): 1 failed / 1,910 passed (1,911 tests); the failure is `src/features/tasks/__tests__/boardFeatures.test.tsx` ("BoardView WIP limits > saves limits from the column menu"), outside this feature but still red on `HEAD`.
  - Dependency audit job: [120882018481](https://github.com/kenule500/task-man/actions/runs/40097265178/job/120882018481): 5 high / 4 moderate, exit 1.
  - CodeQL check: [run 120882471209](https://github.com/kenule500/task-man/runs/120882471209) fails with 3 new alerts (2 high, 1 warning) in code changed by this PR. The separate Analyze job [120882018148](https://github.com/kenule500/task-man/actions/runs/40097265171/job/120882018148) passes.
- **Local quality gates:** `pnpm --filter server typecheck`, `pnpm --filter client typecheck`, `pnpm --filter client lint` and `pnpm --filter client build` pass. `pnpm --filter server test` passes 47 suites / 679 tests. `pnpm --filter client test -- --runInBand` passes 192 suites / 1,911 tests. The integration suite cannot run locally because no MongoDB is available.
- **Dependency audit (local reproduction):** `pnpm audit --prod --audit-level high` exits 1 with 5 high and 4 moderate advisories. The high advisories are `follow-redirects` (2), `zod`, `body-parser` and `multer`. `pnpm audit --audit-level moderate` reports 14 total (5 high, 6 moderate, 3 low). There is no dependency-file diff against `main`; these are pre-existing, but CON-409 still fails on `HEAD`.
- **CodeQL annotations:** `server/src/utils/ai/plan/target.ts:27` "Database query built from user-controlled sources"; `server/src/utils/ai/providers.ts:75` "Polynomial regular expression used on uncontrolled data"; and a warning at `server/src/controllers/aiReviewController.ts:258` for an unused initial `keyHint` value.
- **Secret scan:** `gitleaks` and `trufflehog` are not installed. A manual diff scan found no real credential, but `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx:14` contains a GitHub-token-shaped dummy (`ghp_...`). It is not a real secret, but it will keep tripping deterministic scanners.

## 3. Criteria Check

| Criterion | Status | Detail |
|---|---|---|
| Spec Convergence | **FAIL** | The current project-scoped flow exists (`ProjectDetailPage.tsx` "Add from document", `App.tsx` project plan route, destination banner), but 18 ACs are unverified, the CI integration tests for AC-008/AC-009 fail, and AC-018 is marked N/A without an explicit superseding clause in `spec.md`. The implementation cannot be certified against every AC. |
| Task Completion | **PASS** | All 57 tasks in `tasks.json` are `completed: true`; every item in `tasks.md` is `[x]`. |
| Traceability | **FAIL** | `traceability.json` claims 36/46 ACs have test IDs (78.3%), but only 28/46 are actually verified (61%). The 8 overstated ACs are AC-008, AC-019, AC-020, AC-022, AC-036, AC-037, AC-038 and AC-039. |
| Coverage | **FAIL** | 28/46 = 61%. Required: 100%. The 18 untested ACs are AC-003, AC-008, AC-009, AC-011, AC-013, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-026, AC-028, AC-029, AC-036, AC-037, AC-038 and AC-039. Even treating the seven explicitly superseded ACs (AC-003, AC-011, AC-013, AC-016, AC-017, AC-019, AC-020) as out of scope, 11 ACs remain unverified. |
| Test Report | **PASS** | Report exists at the required path, reports 143/143 targeted tests, and is newer than `spec.md` and `plan.md`. A report is not a substitute for `test-evidence.json`. |
| Test Evidence | **FAIL** | `test-evidence.json` is missing. No exit code, zero-failure summary, positive total, or `commit === HEAD` can be confirmed. |
| Change Scope | **WARN** | 75 files, +12,640/-517, 18 commits ahead of `main` and 0 behind; no other-feature commits observed. One source file is unplanned (`client/src/features/ai-review/lib/providers.ts`, a duplicate of the server preset table). Plan actions for `ProjectPicker.tsx`, `DestinationPicker.tsx`, `AiProjectCard.tsx`, `client/src/features/ai-review/index.ts` and `server/src/utils/ai/types.ts` are stale after P11/P12. 60 working-tree entries are pre-existing untracked files (59 SpecDrive framework paths and `.github/copilot-instructions.md`); no tracked source was modified before review. |
| Test Quality | **FAIL** | No `.only`, `xit` or skipped tests found. However, all 28 linked `TEST-###` IDs are absent from the codebase (0/28 literal matches), and only 74 of 234 `it/test` declarations in the feature suites carry an AC ID, so CON-405 is not met. |
| Code Quality | **PASS** | Server typecheck, client typecheck, client lint and client build pass locally. CodeQL still reports one warning (`aiReviewController.ts:258`). |
| Security | **FAIL** | 5 high and 4 moderate dependency advisories; 2 high CodeQL alerts in changed code; one token-shaped test fixture. No real secret was found in the diff. |
| Testing | **FAIL** | Local unit suites pass (server 679/679, client 1,911/1,911), but CI is red: 61 server integration failures and 1 client failure on `HEAD`. Integration tests cannot run locally without MongoDB. |
| Documentation | **WARN** | `server/.env.example` documents the new variables and the plan records "no migration" for optional schema fields, but there is no README or CHANGELOG update for a user-facing feature. |
| NFR Evidence | **NOT VERIFIED** | Responsive, keyboard and RTL coverage appears in tests and the implementation history, but there is no separate accessibility/performance report and no `/sdrive:performance` artifact. |
| Definition of Done | **FAIL** | Test evidence, 100% coverage, green CI, dependency audit, CodeQL and `verify` are all unmet. |
| Spec-to-Code Verification | **FAIL** | `sdrive verify upload-document` is `fail` at 28/127/2/188. Most findings fit the CON-614 scanner gaps, but stale plan actions and the unplanned source file are outside a clean exception. |
| CI | **FAIL** | Run 40097265178 is red on `HEAD`; see the job breakdown in Evidence. |
| Permission | **PASS** | `check-permission` allows `kenule500` (admin). The separate `sdrive check` doctor still fails on framework permission rules for `mcp:sync` and `knowledge:fetch`. |
| Reviewer Independence | **WARN** | No feature assignee is recorded. The branch was authored by `kenule500`, the same human recorded as reviewer, so independent review is not established. No PASS is being written. |

## 4. Change Scope

- **Files changed:** 75; **diff:** +12,640 / -517.
- **Branch position:** 18 commits ahead of `main`, 0 behind; `main` is an ancestor. No other in-flight feature commits observed.
- **Planned files changed:** The destination, plan creation, workspace AI settings, provider form, project pages, locales and tests are present.
- **Unplanned source file:** `client/src/features/ai-review/lib/providers.ts` (new; duplicates the server's `AI_PROVIDER_PRESETS` table for pre-save form display). It should be added to the plan or replaced by a server-provided/read-only preset contract.
- **Stale plan actions:** `client/src/features/ai-plan/components/ProjectPicker.tsx` and `DestinationPicker.tsx` are planned create actions but were removed in P11; `client/src/features/ai-plan/components/AiProjectCard.tsx` is planned as create but already existed on `main`; `client/src/features/ai-review/index.ts` and `server/src/utils/ai/types.ts` are planned modifies but unchanged.
- **Working tree:** 60 pre-existing untracked entries (59 SpecDrive framework paths and `.github/copilot-instructions.md`); no tracked source modifications before review. The review adds only `review.md` and `review.json`.

## 5. Issues Found

| Severity | Issue | Location | AC | Fix Required |
|---|---|---|---|---|
| High | `test-evidence.json` is missing, so the review cannot be bound to a passing test run at `HEAD`. | `.sdrive/governance/upload-document/v1/test-evidence.json` | — | Yes |
| High | Coverage is 61% (28/46); 18 ACs have no verified test. 11 remain unverified even after excluding explicitly superseded ACs. | `.sdrive/reports/tests/test-report-upload-document-v1-2026-10-24.md` | AC-003, AC-008, AC-009, AC-011, AC-013, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-026, AC-028, AC-029, AC-036, AC-037, AC-038, AC-039 | Yes |
| High | CI server integration suite is red: `aiPlan.test.ts` and `aiReview.test.ts`, 61 failed / 671 passed, including `503 AI_NOT_CONFIGURED` and a `_id` read on undefined. | `server/src/__integration__/aiPlan.test.ts`, `server/src/__integration__/aiReview.test.ts`; [job 120882018393](https://github.com/kenule500/task-man/actions/runs/40097265178/job/120882018393) | AC-008, AC-009 | Yes |
| High | CI client suite is red on an unrelated `boardFeatures` test (1 failed / 1,910 passed). The release gate still requires a green `HEAD`. | `client/src/features/tasks/__tests__/boardFeatures.test.tsx`; [job 120882018564](https://github.com/kenule500/task-man/actions/runs/40097265178/job/120882018564) | — | Yes |
| High | Dependency audit fails: 5 high and 4 moderate advisories. High: `follow-redirects` (2), `zod`, `body-parser`, `multer`. No dependency diff, but CON-409 is unmet. | `pnpm audit --prod --audit-level high`; [job 120882018481](https://github.com/kenule500/task-man/actions/runs/40097265178/job/120882018481) | — | Yes |
| High | CodeQL reports two high-severity alerts in changed code: a database query from user-controlled sources and a polynomial regex on uncontrolled data. | `server/src/utils/ai/plan/target.ts:27`, `server/src/utils/ai/providers.ts:75`; [check run](https://github.com/kenule500/task-man/runs/120882471209) | AC-008, AC-029 | Yes |
| High | Traceability overstates coverage: 36/46 ACs have test IDs, but only 28/46 are verified. | `.sdrive/governance/upload-document/v1/traceability.json` | AC-008, AC-019, AC-020, AC-022, AC-036, AC-037, AC-038, AC-039 | Yes |
| Medium | Every linked `TEST-###` ID is synthetic: 0/28 appear literally in the codebase. The test-report note that they are "AC-scoped evidence IDs" does not satisfy the Test Existence Rule. | `.sdrive/governance/upload-document/v1/traceability.json`; `.sdrive/reports/tests/test-report-upload-document-v1-2026-10-24.md` | — | Yes |
| Medium | Only 74/234 test names in the feature suites carry an AC ID; CON-405 requires every test name to include the AC it covers. | Feature test suites (for example `UploadStep.test.tsx`, `aiPlanExtract.test.ts`, `aiPlan.test.ts`) | — | Yes |
| Medium | `sdrive verify` remains `fail` at 28 matched / 127 missing / 2 renamed / 188 extra. CON-614 covers most paths, but stale P11/P12 plan actions and the unplanned client provider table are outside a clean exception. | `.sdrive/governance/upload-document/v1/verification.json` | — | Yes |
| Medium | `sdrive check` fails on missing permission rules for `mcp:sync` and `knowledge:fetch`; 5 adapter paths are unverified and installed framework files are 0.1.44 while the CLI is 0.1.46. | `.sdrive/config.json` / installed framework | — | Yes |
| Medium | The new `client/src/features/ai-review/lib/providers.ts` duplicates the server preset table and is not in `plan.json`. | `client/src/features/ai-review/lib/providers.ts` | — | Yes |
| Medium | AC-018 is marked N/A in the test report, but `spec.md` does not explicitly supersede it; either add a test or record a spec note. | `.sdrive/reports/tests/test-report-upload-document-v1-2026-10-24.md`; `spec.md` AC-018 | AC-018 | Yes |
| Low | A GitHub-token-shaped dummy (`ghp_...`) is committed in a test fixture; it is not a real secret but will keep tripping secret scanners. | `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx:14` | — | No |
| Low | CodeQL warning: initial `keyHint` value is always overwritten. | `server/src/controllers/aiReviewController.ts:258` | — | No |
| Low | No README/CHANGELOG update for the user-facing document-plan and workspace-AI settings flows. | `README.md` | — | No |

## 6. Recommendations

- Run `/sdrive:test upload-document` to author the missing tests and write a commit-bound `test-evidence.json`. Do not treat the current test report as test evidence.
- Add tests for **AC-036–AC-039** (project-scoped "Add from document", fixed-target wizard, create/return, wrong-project guard), **AC-008/AC-009** (target validation and existing-project create against MongoDB), **AC-022** (provider selection/save), **AC-026** (remove configuration), **AC-028** (connection test), **AC-029** (URL/SSRF guard), and reconcile **AC-018** with the current responsive Projects work.
- Fix the CI integration fixtures or code so `aiPlan.test.ts` and `aiReview.test.ts` receive a workspace AI configuration and stop returning `503 AI_NOT_CONFIGURED`; fix or quarantine the unrelated `boardFeatures` flake before re-running CI.
- Upgrade `follow-redirects`, `zod`, `body-parser` and `multer` to patched versions, or record a time-bounded security waiver; make `pnpm audit --prod --audit-level high` and `pnpm audit --audit-level moderate` pass.
- Address or formally dismiss the two CodeQL high alerts with a documented justification; fix the `keyHint` warning and replace the token-shaped test fixture.
- Correct `traceability.json` so every `testIds` entry points to a real, existing test, and add AC IDs to the test names (CON-405). Update `plan.json` for the P11/P12 changes and either add `client/src/features/ai-review/lib/providers.ts` to the plan or remove the duplication.
- Update `README.md`/`CHANGELOG` for the user-facing flow and record any remaining accessibility/performance evidence.

## 7. Handoff

**FAIL — do not merge or archive.** The feature stays in `.sdrive/specs/ongoing/upload-document/v1/`. Fix the findings above, then run `/sdrive:test upload-document` and re-run `/sdrive:review upload-document`. No merge, branch operation, lifecycle move, or PR creation was performed by this review.
