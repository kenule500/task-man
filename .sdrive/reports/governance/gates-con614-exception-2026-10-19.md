# Governance change — enforce CON-614 in the gate command

- **Status:** APPLIED — 2026-10-19, approved by `kenule500` (project admin) in session
- **Requested by:** project admin (`kenule500`)
- **Affects:** `.sdrive/commands/gates.js` (CON-705 exception for a governance fix, not feature work)
- **Does not affect:** CON-404/405, the 100% coverage rule, the review verdict, or any acceptance criterion

## 1. Problem

CON-614 (constitution 1.0.2) says a `verify` `fail` attributable to the four documented scanner gaps is
advisory when the review records the exact counts and cites the rule. But the implementation gate in
`gates.js` blocked on **any** `verification.json` status of `fail`, without implementing that exception.

Result: `sdrive approve <feature> implementation` refused for every feature with a client surface, so
`sdrive approve review` could not run, so `sdrive archive:check` could never pass. `real-time-chat` passed
review at 75/75 ACs and could still not be archived.

## 2. Change

Added `attributableVerifyFailure(verification, reviewPath)` and used it in the `implementation` gate:

- Only when `verification.json.status === "fail"`.
- The review file must exist and contain `CON-614` **and** `attributable`.
- The review must record the exact `Matched N`, `Missing N`, `Extra N` counts from the verification summary.
- The exception expires **2027-01-31T23:59:59Z**, matching CON-614. After that the gate blocks again.
- When the evidence is present the gate approves with an advisory warning; when any condition is missing
  the original blocker remains.

The exception is deliberately evidence-based: a bare `Status: PASS`, a review that does not cite CON-614, or
mismatched counts all still block.

## 3. Verification of the change

- `real-time-chat` review records `Matched 42 / Missing 155 / Extra 277`, cites CON-614 and calls the failure
  attributable. The gate should now approve implementation with a warning.
- A feature whose review omits the counts, or whose verification counts differ, still fails — the check uses
  the verification summary, not a hard-coded number.
- `node .sdrive/scripts/validate-governance.js` is unaffected (it does not read `gates.js`).

## 4. Rollback

Revert the two edits in `.sdrive/commands/gates.js` (`attributableVerifyFailure` and its call site). No data,
spec or test changes are involved.

## 5. Approval

- [x] Admin authorises the CON-705 exception to edit `.sdrive/commands/gates.js` for this governance fix.
- [x] Admin authorises approving the `implementation` and `review` gates for `real-time-chat` afterwards.

Approved by: kenule500 (admin) — 2026-10-19
