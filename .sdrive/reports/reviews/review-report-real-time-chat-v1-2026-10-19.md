# Review Report: real-time-chat (v1)

Status: PASS

## 1. Audit Summary

- **Status:** PASS
- **Date:** 2026-10-19 (re-audit after the remediation run)
- **Reviewer:** AI Review Agent
- **Version:** v1
- **Lifecycle location:** `.sdrive/specs/ongoing/real-time-chat/v1/` (not moved, not merged)
- **Branch:** `feature/chat` (base `main`); changes are uncommitted in the working tree
- **Permission:** `kenule500 (admin)` — allowed to review

## 2. Criteria Check

- [x] **Spec Convergence:** MET. The four previously uncovered ACs now have evidence: presence join/leave, multi-tab counting, periodic refresh and TTL ageing (AC-030/031), the Members redirect (AC-035) and the Members link (AC-036). AC-036's drift at `GetStartedChecklist.tsx` was fixed and is guarded by its test.
- [x] **Task Completion:** MET. 124 of 124 tasks complete. `T18.1` (CON-703 browser pass), `T19.1` (AC-036 link) and `T19.2` (README) are done.
- [x] **Traceability:** 99 of 99 rows carry `TEST-###` ids and all are `status: complete`; every one of the 75 ACs is linked. Row-level and test-level coverage agree at 75/75.
- [x] **Coverage:** **100%** — 75 of 75 ACs tested, 40/40 tests from the remediation run passing.
- [x] **Test Report:** `.sdrive/reports/tests/test-report-real-time-chat-v1-2026-10-19.md` exists and is newer than `spec.md` and `plan.md`.
- [x] **Code Quality:** `pnpm --filter server typecheck`, `pnpm --filter client typecheck`, `pnpm --filter client lint` and `pnpm --filter client build` all pass.
- [x] **Security:** Chat sources were pattern-scanned for password/key/secret/token literals and private-key headers — clean. `pnpm audit --prod --audit-level high` reports no known vulnerabilities. No `gitleaks`/`trufflehog` is installed, so the secret scan is **manual**, not machine-verified.
- [x] **Testing:** `pnpm --filter server test` → **51 suites / 611 tests pass**. `pnpm --filter client test` → **186 suites / 1652 tests pass**.
- [x] **Documentation:** MET. `README.md` now has a Chat feature section, the `chat:*` permissions in the RBAC catalog, and the chat endpoints in the API table.
- [x] **Definition of Done:** MET — coverage is 100%, the CON-703 browser pass was performed, and the AC-036 link is correct.
- [x] **Spec-to-Code Verification:** `Matched 42 / Missing 155 / Extra 277` → `FAIL`, **attributable under CON-614**. The counts are unchanged from the prior audit (this round changed tests, docs and test-only visibility; no plan or router semantics changed). The findings remain the four documented scanner gaps: `client/` absent from `CANDIDATE_ROOTS`, dependencies read from the workspace-root `package.json`, Mongoose schemas not detected as entities, and absolute plan endpoints vs relative router declarations. Counts recorded here as CON-614(c) requires; advisory.
- [x] **Permission:** PASS — `node .sdrive/scripts/check-permission.js slash /sdrive:review` → allowed.

## 3. Browser pass evidence (CON-703 / T18.1)

Run against a seeded local workspace (`Docker mongo:7` on `127.0.0.1:27017`, API on `:5000`, Vite on `:5173`) with headless Chrome over the DevTools Protocol. Evidence: `.sdrive/reports/browser/browser-pass.json` plus the screenshots in that folder.

| Check | Result |
|---|---|
| 1024px conversation, channel list, DM list, message, mention, composer, transport `Live` | ✅ |
| Empty state on General | ✅ |
| Loading state while `GET /channels` is held | ✅ |
| Error state when `GET /channels` is blocked, then recovery | ✅ |
| Find: `Ctrl+F`, `1 of 1`, `↓` keeps focus, `Enter` jumps/highlights, `Esc` closes | ✅ |
| Thread panel at 1024px, full-screen overlay at 760px, close | ✅ |
| 320px: one pane at a time, Back control, 3 rows, no horizontal overflow, composer above the tab bar | ✅ |
| Console/network errors | None beyond the two deliberately blocked XHRs from the error test |

The browser pass also found and fixed a real narrow-screen defect: direct-message rows overflowed horizontally because their preview was an inline `truncate` span. It is now `block truncate` with an `overflow-hidden` column, and the 320px check asserts `scrollWidth === clientWidth`.

## 4. Issues Found

| Severity | Issue | Location | Fix Required |
|---|---|---|---|
| Low | The unread-count aggregation scans every non-deleted message in the listed channels on each `/chat/conversations` call. Correct under NFR-023 (no per-row query) but grows with history; retention bounds it. | `server/src/controllers/chatChannelController.ts:150` | No |
| Low | A search jump stops after 8 older pages (~400 messages) and then reports “no longer available” for a match further back. Intentional bound; label it in the UI later. | `client/src/features/chat/views/ChatView.tsx:32` | No |

No blocking issues remain.

**Framework note (not a feature defect):** `sdrive approve implementation` still refuses a `verify` `fail` even when the review records it as CON-614-advisory, because `.sdrive/commands/gates.js` checks `verification.json.status === "fail"` without the exception. `archive:check` therefore needs a governance/framework decision (fix `verify.js`, or teach the gate the CON-614 exception) before `/sdrive:archive` can complete. The gates were not hand-edited.

## 5. Recommendations

- Resolve the `verify`/gate contradiction at framework level so a CON-614-advisory failure can be approved (fix `verify.js`'s `CANDIDATE_ROOTS`/entity/dependency detection, or add the exception to `gates.js`). Until then the feature can be reviewed but not archived.
- Re-approve or retire CON-614 before 2027-01-31.
- Keep the AC-075 `SearchBar` test and the AC-030/031 presence tests; they guard the two regressions found in earlier rounds.
- Commit the remediation together with this review before archiving, so the merge carries the tested state.

## 6. Verdict

**PASS — release cleared for archiving.** Coverage is 100%, all tasks are complete, the browser pass is recorded, and the only failing validator is the CON-614-advisory `verify` report.

The feature is **not** merged and its folder was **not** moved. Run `/sdrive:archive real-time-chat` after the gate-approval contradiction above is resolved.
