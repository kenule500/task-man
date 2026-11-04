# Test Report: upload-document (v2)

## 1. Summary
- **Date:** 2026-11-04
- **Feature:** upload-document
- **Version:** v2
- **Total ACs:** 12
- **Tested ACs:** 12
- **Coverage:** 100%
- **Tests Passed:** 2743/2743

## 2. AC → Test Mapping

| AC ID | Test ID | File | Status |
|-------|---------|------|--------|
| AC-047 | TEST-001 | services/document-analyzer/tests/test_acceptance_v2.py | ✅ Pass |
| AC-047 | TEST-002 | services/api/src/__tests__/uploadDocumentTransport.test.ts | ✅ Pass |
| AC-048 | TEST-003 | services/document-analyzer/tests/test_acceptance_v2.py | ✅ Pass |
| AC-048 | TEST-004 | services/api/src/__tests__/uploadDocumentService.test.ts | ✅ Pass |
| AC-049 | TEST-005 | services/api/src/__tests__/uploadDocumentService.test.ts | ✅ Pass |
| AC-050 | TEST-006 | services/api/src/__tests__/uploadDocumentTransport.test.ts | ✅ Pass |
| AC-050 | TEST-007 | services/api/src/__tests__/uploadDocumentService.test.ts | ✅ Pass |
| AC-051 | TEST-008 | services/api/src/__tests__/uploadDocumentTransport.test.ts | ✅ Pass |
| AC-051 | TEST-009 | services/api/src/__tests__/uploadDocumentService.test.ts | ✅ Pass |
| AC-052 | TEST-010 | services/document-analyzer/tests/test_acceptance_v2.py | ✅ Pass |
| AC-053 | TEST-011 | services/document-analyzer/tests/test_acceptance_v2.py | ✅ Pass |
| AC-054 | TEST-012 | services/document-analyzer/tests/test_acceptance_v2.py | ✅ Pass |
| AC-055 | TEST-013 | services/api/src/__tests__/uploadDocumentTransport.test.ts | ✅ Pass |
| AC-056 | TEST-014 | client/src/features/ai-plan/__tests__/reviewEngine.test.tsx | ✅ Pass |
| AC-057 | TEST-015 | services/document-analyzer/tests/test_acceptance_v2.py | ✅ Pass |
| AC-058 | TEST-016 | services/document-analyzer/tests/test_acceptance_v2.py | ✅ Pass |

Every test name carries its AC ID, so `sdrive test` and the review gate can map a
failure to the criterion it broke.

## 3. Failures

| Test | Reason | Blocking |
|------|--------|----------|
| None | — | No |

## 4. Notes

- **Suites run** (all green): server 54 suites / 728 tests, client 197 suites / 1943
  tests, analyzer 72 tests. `Tests Passed` above is the three suites combined; the AC
  count is 12/12.
- **Client flakiness under load.** A first full client run at the default worker count
  failed 6 suites / 9 tests by timeout; every one of them passed on rerun and the
  suite above is green at `--maxWorkers=3` on an 8-core machine. The suites involved
  (`ReviewStep`, `ProjectDetailPage`, `DesignSystemPage`, `DesignSystemGuide`,
  `wiki/components`, `bulkEdit`) are the slow ones and were not touched by this work.
- **AC-056 is covered for copy, translation, RTL direction and keyboard access** in
  jsdom. The 320/375/768/1024/1280 px visual pass and the full RTL layout check remain
  task T7.4 and are still open; they are a browser check, not a unit test.
- **AC-047/AC-050 measure our side only.** The analyzer tests prove one generation per
  request and one HTTP request per plan. How many provider calls DocuMind makes
  internally is the RISK-022 measurement (task T7.5), still open.
- The Python suite must run from `services/document-analyzer` (its `pyproject.toml`
  sets `pythonpath = ["."]`).
