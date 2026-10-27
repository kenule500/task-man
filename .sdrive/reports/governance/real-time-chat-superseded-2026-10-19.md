# Governance decision — real-time-chat v1 superseded by origin/main

- **Status:** RECORDED — 2026-10-19, approved by `kenule500` (project admin) in session
- **Feature:** `real-time-chat` v1 (`feature/chat`)
- **Decision:** do **not** merge this branch. Keep the chat implementation already shipped on
  `origin/main`; preserve this branch and its review for audit.

## 1. Finding

`origin/main` (`0999f6f`) already ships a complete chat implementation, merged as PR #35
(`1181b58`, merge `e5425e6`) with follow-ups #36/#37. It includes i18n (en/fr/ar + RTL), private
channels, drafts, typing, `chatService.ts`, and an eight-file client/server test surface.

`feature/chat` is based on a different, older line (merge-base `c0185af`):

| Comparison | Result |
|---|---|
| `origin/main..feature/chat` | 18 commits |
| `feature/chat..origin/main` | 102 commits |
| Files changed by both sides since the merge base | **918** |
| `git diff --shortstat origin/main..feature/chat` | **569 files, +13,617 / −32,044** |
| Sample deletions if merged | `api/socket.ts`, `LanguageSwitcher`, all of `features/ai-review`, `server/src/utils/chatService.ts` |

Merging `feature/chat` into `origin/main` would therefore replace the shipped chat implementation and
delete or revert large parts of the current main line (i18n, AI review, socket entry point). It is not a
rebase-sized task; it is a deliberate product migration with a high regression risk.

The branch was also found mid-rebase (`main` onto `0845258`, stopped at `2f76402`). The stale rebase was
cleared with `git rebase --quit`; no commits were lost and the three remediation commits remain:
`3e24b7f`, `2c21ebb`, `00f338d`.

## 2. Decision

1. Keep the `origin/main` chat implementation as the production implementation.
2. Do **not** merge `feature/chat`; do **not** run `sdrive archive:finalize`; do **not** move the spec to
   `specs/completed/`, because no reviewed code was shipped from this branch.
3. Preserve `feature/chat` (local and remote) and the PASS review, approved gates and browser evidence for
   audit. The feature remains `ongoing` with a `feature_superseded` history entry; the schema has no
   `superseded` phase.
4. The AC-036 link bug (`GetStartedChecklist.tsx` → `/{slug}/team`) also exists on `origin/main`; fix it
   separately in a small branch from `origin/main` (link + test), not by reviving this branch.

## 3. What is not true

This note does **not** claim the feature's reviewed code was merged, released or archived. The review and
coverage apply to `feature/chat` only. The current production chat is the one from PR #35.

## 4. Rollback

Delete this note and the `feature_superseded` history entry if the decision changes. The branch, review and
gates are untouched.

Approved by: kenule500 (admin) — 2026-10-19
