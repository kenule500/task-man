# Test Report: upload-document (v1)

## 1. Summary
- **Date:** 2026-10-24
- **Feature:** upload-document
- **Version:** v1
- **Total ACs:** 46
- **Tested ACs:** 28
- **Coverage:** 61%
- **Tests Passed:** 143/143

## 2. AC → Test Mapping

TEST IDs are AC-scoped evidence IDs. One Jest test can carry several AC tags, so a test may appear against more than one AC.

| AC ID | Test ID | File | Status |
|-------|---------|------|--------|
| AC-001 | TEST-001 | `client/src/features/ai-plan/__tests__/UploadStep.test.tsx`; `server/src/__tests__/aiPlanExtract.test.ts` | ✅ Pass |
| AC-002 | TEST-002 | `client/src/features/ai-plan/__tests__/UploadStep.test.tsx`; `client/src/pages/__tests__/AiProjectPage.test.tsx` | ✅ Pass |
| AC-003 | — | — | N/A — superseded by AC-034/AC-035 (P11 removed the new-project destination choice) |
| AC-004 | TEST-004 | `client/src/pages/__tests__/AiProjectPage.test.tsx` | ✅ Pass |
| AC-005 | TEST-005 | `client/src/features/ai-plan/__tests__/ReviewStep.test.tsx` | ✅ Pass |
| AC-006 | TEST-006 | `client/src/features/ai-plan/__tests__/UploadStep.test.tsx`; `ReviewStep.test.tsx`; `client/src/pages/__tests__/AiProjectPage.test.tsx`; `server/src/__tests__/aiPlanExtract.test.ts` | ✅ Pass |
| AC-007 | TEST-007 | `client/src/features/ai-plan/__tests__/ReviewStep.test.tsx`; `client/src/pages/__tests__/AiProjectPage.test.tsx` | ✅ Pass |
| AC-008 | — | `server/src/__integration__/aiPlan.test.ts` | Not run — no local MongoDB; integration-only atomic create/rollback |
| AC-009 | — | `server/src/__integration__/aiPlan.test.ts` | Not run — no local MongoDB; integration-only audit/rollback coverage |
| AC-010 | TEST-010 | `client/src/features/ai-plan/__tests__/ReviewStep.test.tsx` | ✅ Pass — client create guard; project-scoped confirmation remains AC-038 |
| AC-011 | — | — | N/A — superseded by AC-034 (P11 removed the destination selector) |
| AC-012 | TEST-012 | `server/src/__tests__/aiPlanExtract.test.ts`; `server/src/__tests__/aiPlanPrompt.test.ts`; `client/src/features/ai-plan/__tests__/UploadStep.test.tsx` | ✅ Pass |
| AC-013 | — | — | N/A — installation-level provider configuration superseded by AC-027 (P10) |
| AC-014 | TEST-014 | `server/src/__tests__/aiConfig.test.ts` | ✅ Pass — legacy variables are ignored; kept as regression evidence |
| AC-015 | TEST-015 | `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` | ✅ Pass — current workspace-settings copy |
| AC-016 | — | — | N/A — superseded by AC-043/AC-044 (P11/P12) |
| AC-017 | — | — | N/A — superseded by AC-044/AC-045 (P11/P12) |
| AC-018 | — | — | N/A — responsive Projects layout re-expressed by AC-042/AC-046 |
| AC-019 | — | — | N/A — installation-level `opencode` environment preset superseded by AC-021/FR-023 (P10) |
| AC-020 | — | — | N/A — provider-list/env resolution superseded by AC-021/FR-023 (P10) |
| AC-021 | TEST-021 | `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` | ✅ Pass — current OpenCode Console provider/model copy |
| AC-022 | — | `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` | Not covered — provider selection/save path and `AiProviderForm` are not exercised |
| AC-023 | TEST-023 | `server/src/__tests__/aiConfig.test.ts`; `aiProvider.test.ts`; `aiPlanPrompt.test.ts` | ✅ Pass |
| AC-024 | TEST-024 | `server/src/__tests__/aiProvider.test.ts`; `aiPlanPrompt.test.ts`; `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` | ✅ Pass |
| AC-025 | TEST-025 | `server/src/__tests__/secretBox.test.ts`; `aiProvider.test.ts`; `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` | ✅ Pass |
| AC-026 | — | — | Not covered — remove-configuration flow and its atomic clearing are not unit-tested |
| AC-027 | TEST-027 | `server/src/__tests__/aiConfig.test.ts`; `aiProvider.test.ts`; `aiPlanPrompt.test.ts` | ✅ Pass |
| AC-028 | — | — | Not covered — rate-limited connection-test endpoint is integration-only |
| AC-029 | — | — | Not covered — custom HTTPS/private-address/DNS-rebinding checks have no unit suite |
| AC-030 | TEST-030 | `client/src/features/ai-review/__tests__/locales.test.ts`; `AiReviewSettingsCard.test.tsx` | ✅ Pass |
| AC-031 | TEST-031 | `client/src/features/ai-review/__tests__/AiReviewSettingsCard.test.tsx` | ✅ Pass |
| AC-032 | TEST-032 | `client/src/features/ai-review/__tests__/AiReviewPanel.test.tsx`; `AiReviewSettingsCard.test.tsx` | ✅ Pass |
| AC-033 | TEST-033 | `client/src/features/ai-review/__tests__/AiReviewPanel.test.tsx`; `AiReviewSettingsCard.test.tsx` | ✅ Pass |
| AC-034 | TEST-034 | `client/src/pages/__tests__/AiProjectPage.test.tsx` | ✅ Pass |
| AC-035 | TEST-035 | `client/src/pages/__tests__/AiProjectPage.test.tsx` | ✅ Pass |
| AC-036 | — | — | Not covered — the project details page "Add from document" action has no test |
| AC-037 | — | — | Not covered — project-scoped upload wizard and fixed-target header have no test |
| AC-038 | — | — | Not covered — project-scoped create payload/toast/return have no test |
| AC-039 | — | — | Not covered — project-scoped review/create/return flow has no test |
| AC-040 | TEST-040 | `client/src/pages/__tests__/ProjectsPage.test.tsx` | ✅ Pass |
| AC-041 | TEST-041 | `client/src/pages/__tests__/ProjectsPage.test.tsx` | ✅ Pass |
| AC-042 | TEST-042 | `client/src/pages/__tests__/ProjectsPage.test.tsx` | ✅ Pass |
| AC-043 | TEST-043 | `client/src/pages/__tests__/ProjectsPage.test.tsx` | ✅ Pass |
| AC-044 | TEST-044 | `client/src/pages/__tests__/ProjectsPage.test.tsx` | ✅ Pass |
| AC-045 | TEST-045 | `client/src/pages/__tests__/ProjectsPage.test.tsx` | ✅ Pass |
| AC-046 | TEST-046 | `client/src/pages/__tests__/ProjectsPage.test.tsx` | ✅ Pass |

## 3. Failures
| Test | Reason | Blocking |
|------|--------|----------|
| — | No failing tests in the executed suites | No |

## 4. Notes

- **P12 scope is fully covered.** AC-043, AC-044, AC-045 and AC-046 each have dedicated tests in `ProjectsPage.test.tsx`, including permissions, header dialog/route, cards-first order, search/sort/archived persistence, empty-state separation, responsive classes, French/Arabic and RTL.
- **Executed feature suites:** 7 client suites (87 tests) and 5 server suites (56 tests) passed, 143/143. The full repository runs also passed: client 192 suites / 1,911 tests; server 47 suites / 679 tests. Typecheck passed for both packages.
- **Historical ACs:** P10 makes the installation-level `AI_*`/OpenCode environment stories historical; P11 removes the new-project destination choice and reverses AC-016/AC-017; P12 supersedes only the duplicate-header clause of AC-040. Historical ACs are marked N/A above and are not counted as tested.
- **Known coverage gaps:** AC-008/AC-009 need the MongoDB integration suite (`server/src/__integration__/aiPlan.test.ts`); AC-022/AC-026/AC-028/AC-029 need workspace AI settings/provider-form or endpoint tests; AC-036–AC-039 need the project-scoped wizard and project-page action tests. These are recorded rather than hidden.
- **Environment limitation:** the integration suites were not run because no MongoDB is listening on `127.0.0.1:27017` and the Docker daemon is unavailable on this machine.
- **Verification:** `node .sdrive/scripts/verify.js upload-document` still reports the known CON-614 scanner drift (28 matched, 127 missing, 2 renamed, 188 extra). This is a traceability scanner mismatch, not a test failure; the test evidence above and the governance validator results are reported separately.
