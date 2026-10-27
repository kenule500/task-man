# Governance proposal — make `verify` findings attributable, not absolute

- **Status:** APPLIED — 2026-10-18, approved by `kenule500` (project admin) in session
- **Date:** 2026-10-18
- **Requested by:** project admin (`kenule500`)
- **Affects:** CON-602, new CON-614, and three bullets in `.sdrive/agents/09-review-complete.md`
- **Does not affect:** CON-404/405 (test per AC), the review coverage rule (100%), or any acceptance criterion

## 1. Decision requested

Today every feature on this repository fails `/sdrive:review` for the same reason: `sdrive verify` reports `fail`
because the scanner cannot read three kinds of input this project uses. The gate is therefore not discriminating —
it says FAIL whether the feature is complete or not — and no feature can ever be archived.

Approve one of:

- **A (recommended).** Amend CON-602 and add CON-614 so a `fail` whose findings are attributable to the three
  documented scanner gaps is advisory, with the conditions in §4.
- **B.** Fix `verify.js` instead. That is a framework change; CON-705 forbids editing `.sdrive/scripts` during feature
  work, so it needs its own decision and is larger than this draft.
- **C.** Do nothing and keep the gate absolute, accepting that no feature can pass review on this repository.

## 2. Evidence

Run at `647d82a`:

```
✅ Matched:  42
❌ Missing:  155
⚠️  Renamed: 0
➕ Extra:    277
🧾 Status:   FAIL
```

The three causes, confirmed in the source:

| Cause | Where | Effect |
|---|---|---|
| `client/` is not scanned | `.sdrive/scripts/verify.js:55-72` — `CANDIDATE_ROOTS` lists `src`, `app`, `lib`, `server`, … but not `client` | Every planned client component is reported `missing`, even when the file exists |
| Dependencies read from the workspace root | `verify.js:410-424` — `detectDependencies` reads `projectRoot/package.json` | This is a pnpm workspace; the root manifest has no dependencies, so installed packages look absent |
| Mongoose is not an understood entity style | `verify.js:275-307` — `detectEntities` recognises SQL, Prisma, TypeORM and TS types | `new Schema(...)` models are reported `missing` |
| Absolute vs relative endpoint paths | plan stores `/api/workspaces/:slug/...`; routers declare `/:slug/...` | Endpoints show as both `missing` and `extra` |

`determineStatus` (`verify.js:576-578`) returns `fail` when anything is `missing`, so these four false-negative classes
alone are enough to fail every feature that has a client surface.

## 3. Proposed constitution change (exact text)

Replace the CON-602 bullet:

```diff
-- **CON-602:** No feature may be marked complete unless `sdrive verify <feature>` returns `pass` or `warn`.
+- **CON-602:** No feature may be marked complete unless `sdrive verify <feature>` returns `pass` or `warn`, or its
+  only remaining findings are `missing` items attributable to the documented scanner gaps in CON-614 and the review
+  records them with evidence. A real gap is still a blocking failure.
```

Add after the CON-613 bullet:

```markdown
- **CON-614:** A `verify` `fail` is *attributable* — and therefore advisory rather than blocking — only when all of the
  following hold: (a) the findings fall into a documented scanner gap: a file under `client/` (absent from
  `CANDIDATE_ROOTS`), a dependency declared in a workspace package rather than the root `package.json`, an entity
  declared as a Mongoose schema rather than SQL/Prisma/TypeORM, or an endpoint whose absolute path in the plan does not
  match the router's relative declaration; (b) every `missing` item is shown to exist in the repository by path, or is
  listed in the review as a genuine gap; (c) the review records the exact matched/missing/extra counts and cites this
  rule. Findings outside (a) remain blocking. This rule expires on 2027-01-31, or when `verify.js` is fixed, whichever
  comes first, and MUST be re-approved before it is renewed.
```

## 4. Proposed agent change (framework-level)

`.sdrive/agents/09-review-complete.md` currently hard-codes the absolute rule, so the constitution amendment alone
would not change the verdict. Three bullets need the same qualifier:

```diff
-- Before auditing, run `sdrive verify <feature>` and require status `pass` or `warn`.
+- Before auditing, run `sdrive verify <feature>` and require status `pass` or `warn`, or a `fail` attributable under
+  CON-614 with its evidence recorded in the review.
-- If verification returns `fail`, block the release and add new Fix tasks.
+- If verification returns `fail` for a reason outside CON-614, block the release and add new Fix tasks.
-- Never clear a feature with a `fail` verification report.
+- Never clear a feature with a `fail` verification report unless the failure is attributable under CON-614 and the
+  review records the counts and the gap it belongs to.
```

This edits an agent file, which CON-705 forbids "as part of feature work". This is a governance change, not feature
work, but it still needs the explicit approval in §6 rather than being slipped in with `real-time-chat`.

## 5. What this does **not** do

- It does not lower the coverage bar: `/sdrive:review` still requires 100% of ACs tested. `real-time-chat` is at 53%
  and stays blocked on its own merits.
- It does not excuse the CON-703 browser pass.
- It does not cover a genuinely absent component, endpoint or entity. If a `missing` item cannot be found in the
  repository, the review still fails.
- It does not change the `verify` output; the counts stay visible in every review.

## 6. Approval

- [x] Admin approves option A and the exact wording in §3.
- [x] Admin approves the agent-file change in §4 (CON-705 exception, governance change only).
- [x] Constitution version bumped to `1.0.2` with a changelog row.
- [ ] `real-time-chat` review re-run after the change, recording the verify counts as advisory. — the re-run is
  recorded in `review.md`; the verdict stays **FAIL** because coverage is still 53%, which CON-614 does not touch.

Approved by: kenule500 (admin)   Date: 2026-10-18

## 7. Rollback

Revert the CON-602/CON-614 wording and the three agent bullets. No code, data or test changes are involved, and the
`verify` reports stay in `.sdrive/reports` for audit.
