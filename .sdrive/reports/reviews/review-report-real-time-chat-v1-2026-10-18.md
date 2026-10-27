# Review Report: real-time-chat (v1)

## 1. Audit Summary

- **Status:** FAIL
- **Date:** 2026-10-18 (re-run after the CON-614 amendment)
- **Reviewer:** AI Review Agent
- **Version:** v1
- **Lifecycle location:** `.sdrive/specs/ongoing/real-time-chat/v1/` (not moved, not merged)
- **Branch:** `feature/chat` at `647d82a` (working tree clean apart from `.sdrive/`)
- **Governance note:** CON-614 was applied on 2026-10-18 (constitution 1.0.2). The `verify` failure is recorded below
  as attributable and advisory; it is no longer the blocking reason. Coverage is.

## 2. Criteria Check

- [ ] **Spec Convergence:** Not met. The recent surfaces (segmented DMs, honest counts, find widget, responsive shell)
  match their ACs, but 35 of 75 ACs still have no automated evidence. A claim of convergence would be an opinion.
- [ ] **Task Completion:** 121 of 122 tasks complete. `T18.1` (CON-703 browser pass) is open.
- [ ] **Traceability:** All 99 rows are `complete`; 64 carry a `TEST-###` id. Rows group several ACs, so the row-level
  count (48/75) overstates what is exercised; the test-level count is 40/75.
- [ ] **Coverage:** 53% (40/75 ACs tested, 69/69 feature tests passing).
- [x] **Test Report:** `.sdrive/reports/tests/test-report-real-time-chat-v1-2026-10-18.md`, newer than `spec.md` and
  `plan.md` (14:52).
- [x] **Code Quality:** `server typecheck`, `client typecheck`, `client lint` and `client build` pass at this commit.
- [ ] **Security:** Pattern scan of `client/src/features/chat` for `password=`, `api_key=`/`api-key=`, `secret=` and
  private-key headers found nothing. No `gitleaks`/`trufflehog` is installed, so **no deterministic secret scan was
  run**; CVE status of dependencies was **not automatically verified** (no dependency was added by §15–§18).
- [x] **Testing:** `pnpm --filter client test` → 181 suites / 1639 tests pass. `pnpm --filter server test` → 41 suites /
  572 tests pass.
- [ ] **Documentation:** Not met. `README.md`'s Features section has no chat entry; the chat surface, DMs and search are
  undocumented outside `.sdrive/`.
- [ ] **Definition of Done:** Not met — coverage is 53%, and the CON-703 browser pass was not performed.
- [ ] **Spec-to-Code Verification:** `Matched 42 / Missing 155 / Extra 277` → `FAIL`, **attributable under CON-614**.
  The findings are the four documented scanner gaps (`client/` not in `CANDIDATE_ROOTS`; dependencies read from the
  workspace-root `package.json`; Mongoose schemas not detected as entities; absolute plan paths vs relative router
  paths). Counts recorded here as CON-614(c) requires. Advisory, not the blocking reason.
- [x] **Permission:** PASS — `check-permission.js slash /sdrive:review` → `kenule500 (admin) is allowed`.

## 3. Issues Found

| Severity | Issue | Location | Fix Required |
|---|---|---|---|
| High | Coverage 53% (40/75 ACs). 35 ACs have no test, mostly controller/socket paths: message send/edit/delete, project channel lifecycle, transport fallback, project rename/avatar, section ordering, the member count, and the in-place new-DM insert. | `traceability.json`, `*.test.ts(x)` | Yes — `/sdrive:test real-time-chat` (mocked controllers or the MongoDB integration suite) |
| Medium | CON-703 browser pass never performed (no MongoDB in this environment). The responsive fix and the find widget are proven by CSS measurement and unit tests, not by the running app. | whole chat screen | Yes — `T18.1` |
| Medium | README has no chat documentation. | `README.md:30` (Features) | Yes — document the chat surface and its permissions |
| Low | One traceability row can cover several ACs, so a single test id makes every AC in the row look tested: 48/75 at row level against 40/75 at test level. | `traceability.json` | Yes — one row per AC, or per-AC `testIds` |
| Low | The unread-count aggregation scans all non-deleted messages in every listed channel on each `/chat/conversations` call. Correct under NFR-023 (no per-row query) but grows with history. | `server/src/controllers/chatChannelController.ts:129` | No — retention bounds it |
| Low | A search jump stops after 8 older pages (~400 messages) and then reports "no longer available" for a match further back. | `client/src/features/chat/views/ChatView.tsx:32` | No — the bound is intentional; label it in the UI later |

**Advisory (not blocking):** `verify` reports `FAIL` for the four scanner gaps in CON-614. Tracked at project level;
do not treat it as a chat defect, and do not "fix" it by changing chat code.

## 4. Recommendations

- Coverage is now the only automated blocker. Prioritise the controller paths — either mocked Mongoose chains or
  `server/src/__integration__` (which CI already runs with a `mongo:7` service). The socket paths need at least one
  test exercising `chat:join`, `chat:send` and the project-membership check.
- Do the browser pass before calling the responsive work done: 320px list ⇄ conversation, thread as an overlay,
  `Ctrl/Cmd+F` find bar, `↑`/`↓`/`Enter`/`Esc`, composer clearing the mobile tab bar.
- Add a short chat section to the README: how to reach it, the `chat:*` permissions, and that search is channel-scoped
  and excludes thread replies.
- Keep the AC-075 `SearchBar` test; it is the guard against the arrow buttons disappearing from the accessibility tree.
- Re-approve or retire CON-614 before 2027-01-31, or earlier if `verify.js` is fixed.

## 5. Verdict

**FAIL — release blocked on coverage (53%).** The feature stays in `ongoing/`. No merge, no branch operation, no PR,
no folder move.
