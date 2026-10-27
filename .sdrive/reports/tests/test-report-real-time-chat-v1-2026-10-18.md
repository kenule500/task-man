# Test report — real-time-chat v1 — 2026-10-18

## Summary

- **Total ACs:** 75
- **Tested ACs:** 44
- **Coverage:** 59%
- **Tests Passed:** 11/11

This run added 11 server controller tests (7 channel, 4 search). The feature now has **95 chat tests in 16 files**
(69 client, 26 server). Full suites: client **181 suites / 1639 tests**, server **43 suites / 583 tests**.

## What was tested

| Suite | File | ACs | Tests |
|---|---|---|---|
| search helpers | `client/.../chat/__tests__/search.test.ts` | AC-071, AC-073 | 7 |
| conversation rows | `client/.../chat/__tests__/conversations.test.ts` | AC-062, AC-063, AC-064 | 5 |
| find bar | `client/.../chat/__tests__/SearchBar.test.tsx` | AC-070, AC-072, AC-075 | 5 |
| result listbox | `client/.../chat/__tests__/SearchResults.test.tsx` | AC-070, AC-071, AC-074, EC-027 | 6 |
| shared conversation section | `client/.../chat/__tests__/ConversationSection.test.tsx` | AC-057, AC-058, AC-059, AC-064 | 7 |
| New direct message | `client/.../chat/__tests__/NewDirectMessage.test.tsx` | AC-065, AC-066 | 3 |
| channel header | `client/.../chat/__tests__/ChatHeader.test.tsx` | AC-068, AC-069 | 4 |
| channel access | `server/src/__tests__/chatAccess.test.ts` | AC-008, AC-027, AC-038, AC-039 | 5 |
| query + cursor | `server/src/__tests__/chatQuery.test.ts` | AC-010, AC-029 | 5 |
| message validation | `server/src/__tests__/chatValidation.test.ts` | AC-007, AC-010, AC-012, AC-014, AC-021 | 5 |
| mentions | `client/.../chat/__tests__/mentions.test.ts` | AC-014, AC-052 | 4 |
| message helpers | `client/.../chat/__tests__/messages.test.ts` | AC-001, AC-007, AC-010, AC-011, AC-023, AC-061 | 7 |
| pinned panel | `client/.../chat/__tests__/Panels.test.tsx` | AC-025 | 2 |
| thread panel | `client/.../chat/__tests__/ThreadPanel.test.tsx` | AC-012, AC-013 | 5 |
| composer | `client/.../chat/__tests__/Composer.test.tsx` | AC-007, AC-008, AC-049, AC-053, EC-007 | 5 |
| message item | `client/.../chat/__tests__/MessageItem.test.tsx` | AC-012, AC-018, AC-019, AC-048, AC-052 | 7 |
| sidebar chat group | `client/.../chat/__tests__/SidebarChannels.test.tsx` | AC-001, AC-002, AC-041 | 2 |
| **channel controller** (new) | `server/src/__tests__/chatChannelController.test.ts` | AC-003, AC-008, AC-026, AC-027, AC-067, AC-068 | 7 |
| **search controller** (new) | `server/src/__tests__/chatMessageSearch.test.ts` | AC-010, AC-024, AC-029 | 4 |

**Covered ACs:** AC-001, AC-002, AC-003, AC-007, AC-008, AC-010, AC-011, AC-012, AC-013, AC-014, AC-018, AC-019,
AC-021, AC-023, AC-024, AC-025, AC-026, AC-027, AC-029, AC-038, AC-039, AC-041, AC-048, AC-049, AC-052, AC-053,
AC-057, AC-058, AC-059, AC-061, AC-062, AC-063, AC-064, AC-065, AC-066, AC-067, AC-068, AC-069, AC-070, AC-071,
AC-072, AC-073, AC-074, AC-075.

By change set:

| Change set | ACs | Tested |
|---|---|---|
| §1–§7 baseline | AC-001…AC-034 (34) | 19 |
| §8 project-scoped team channels | AC-035…AC-047 (13) | 3 |
| §14 conversation ergonomics | AC-048…AC-055 (8) | 4 |
| §15 direct-message segmentation | AC-056…AC-061 (6) | 4 |
| §16 list polish and counts | AC-062…AC-069 (8) | 8 |
| §17 search find widget | AC-070…AC-075 (6) | 6 |

## Not tested

`AC-004–006, AC-009, AC-015–017, AC-020, AC-022, AC-028, AC-030–037, AC-040, AC-042–047, AC-050, AC-051,
AC-054–056, AC-060` — 31 ACs.

The remaining block is now narrow and mostly socket-shaped: project channel create/archive (AC-004–006), message
persist-before-broadcast and `lastMessageAt` (AC-009), mention delivery (AC-015), reaction toggling (AC-016/017),
attachment serving and limits (AC-020), typing (AC-022), moderation (AC-028), presence and transport (AC-030–033),
Members navigation (AC-035/036), channel rename/avatar (AC-044–047), section ordering (AC-050), per-channel counts
(AC-051), multi-attachment storage (AC-054), cross-channel attachment refusal (AC-055), and the in-place new-DM
insert (AC-060).

## Defects

No new production defect this run. The earlier `SearchBar` `aria-hidden` fix remains guarded by AC-075.

## Verification

| Command | Result |
|---|---|
| `pnpm --filter server typecheck` | pass |
| `pnpm --filter client typecheck` | pass |
| `pnpm --filter client lint` | pass |
| `pnpm --filter client test` | 181 suites / 1639 tests pass |
| `pnpm --filter server test` | 43 suites / 583 tests pass |
| `node .sdrive/scripts/validate-governance.js` | pass |
| `node .sdrive/scripts/verify.js real-time-chat` | FAIL — attributable under CON-614, advisory |

Traceability: 69 of 99 rows carry `TEST-###` ids.
