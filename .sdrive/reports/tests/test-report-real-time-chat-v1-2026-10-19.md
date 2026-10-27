# Test Report: real-time-chat (v1)

## 1. Summary

- **Date:** 2026-10-19 (remediation run)
- **Feature:** real-time-chat
- **Version:** v1
- **Total ACs:** 75
- **Tested ACs:** 75
- **Coverage:** 100%
- **Tests Passed:** 40/40

This run closed the four ACs that the review found missing: presence (AC-030/031), the Members
redirect (AC-035) and the Members link (AC-036). It adds **3 tests** (2 server, 1 client) and turns the
existing onboarding test into the explicit AC-036 guard. The CON-703 browser pass (`T18.1`) was
performed with headless Chrome against the demo workspace and a local MongoDB (Docker `mongo:7`).

## 2. AC → Test Mapping (remediation additions)

| AC ID | Test ID | File | Status |
|---|---|---|---|
| AC-030 | TEST-032 | `server/src/__tests__/presence.test.ts` | ✅ Pass |
| AC-031 | TEST-032 | `server/src/__tests__/presence.test.ts` | ✅ Pass |
| AC-035 | TEST-033 | `client/src/components/__tests__/MembersRedirect.test.tsx` | ✅ Pass |
| AC-036 | TEST-034 | `client/src/components/dashboard/__tests__/GetStartedChecklist.test.tsx` | ✅ Pass |

The previous 2026-10-19 run added 37 tests for AC-004/005/006/009/015/016/017/020/022/028/
032/033/034/037/040/042–047/050/051/054–056/060; those tests remain in place and green.

## 3. What each new test proves

| Suite | Tests | Coverage |
|---|---|---|
| `presence.test.ts` | 2 | One presence per user across tabs; offline emitted only after the last disconnect; periodic `seenAt` refresh; TTL index ages an unclean disconnect out |
| `MembersRedirect.test.tsx` | 1 | `/{slug}/team` resolves to `/{slug}/members` |
| `GetStartedChecklist.test.tsx` | 1 (updated) | The “Invite teammate” step points at `/{slug}/members`, not the retired `/{slug}/team` |

## 4. CON-703 browser pass (`T18.1`)

Setup: Docker `mongo:7` on `127.0.0.1:27017`, `pnpm seed`, API on `:5000`, Vite on `:5173`, Chrome
`--headless=new` driven over the DevTools Protocol. Evidence: `.sdrive/reports/browser/browser-pass.json`
and the screenshots in the same folder.

| Check | Result |
|---|---|
| 1024px conversation: 3 team rows, 1 direct row, seeded message, mention, composer, transport `Live` | ✅ |
| Empty state: General shows “No messages yet. Start the conversation.” | ✅ |
| Loading state: a held `GET /channels` shows “Loading channels” | ✅ |
| Error state: a blocked `GET /channels` shows “Channels could not be loaded”, then recovers when unblocked | ✅ |
| Find widget: `Ctrl+F` opens, query returns “1 of 1”, `↓` keeps focus in the combobox, `Enter` jumps and highlights, `Esc` closes | ✅ |
| Thread: reply opens the panel at 1024px and the full-screen overlay at 760px, then closes | ✅ |
| 320px: one pane at a time, “Back to conversations”, 3 team rows, no horizontal overflow, composer above the tab bar | ✅ |
| Console/network errors | None beyond the two deliberately blocked XHRs from the error test |

Screenshots: `chat-1024.png`, `chat-empty-1024.png`, `chat-loading-1024.png`, `chat-error-1024.png`,
`chat-find-1024.png`, `chat-thread-1024.png`, `chat-thread-760.png`, `chat-320-conversation.png`,
`chat-320-list.png`.

## 5. Defects found and fixed

| Defect | Fix |
|---|---|
| AC-036: the onboarding “Invite teammate” link still pointed at `/{slug}/team` | Pointed at `/{slug}/members`; the test now asserts it (`T19.1`) |
| Direct-message rows overflowed horizontally at narrow widths (a scrollbar appeared under the row) because the preview text was an inline `truncate` span | `block truncate` on the preview and `overflow-hidden` on its column; confirmed in the browser at 320px (`scrollWidth === clientWidth`) |

## 6. Not tested

None — all 75 ACs now have a linked test.

Known limits of this environment: the browser pass used a seeded local database, not production data;
push notifications and email delivery were not exercised (they are not chat ACs).

## 7. Verification

| Command | Result |
|---|---|
| `pnpm --filter server typecheck` | pass |
| `pnpm --filter client typecheck` | pass |
| `pnpm --filter client lint` | pass |
| `pnpm --filter client build` | pass |
| `pnpm --filter server test` | 51 suites / 611 tests pass |
| `pnpm --filter client test` | 186 suites / 1652 tests pass |
| `node .sdrive/scripts/validate-governance.js` | pass — all 16 features valid |
| `sdrive verify real-time-chat` | FAIL — 42 matched / 155 missing / 277 extra, attributable under CON-614 (client not scanned, workspace-root dependency read, Mongoose entities, absolute-vs-relative paths) |

Traceability: **99 of 99 rows carry `TEST-###` ids**; FR-043 is `complete`.
