# Verification exception — upload-document v1 (CON-602 / CON-614)

- **Commit:** `86f0cb71fd7af0a22b2fc8d7942072503cd38728`
- **Tool result:** `sdrive verify upload-document` → `status: fail`, `matched: 28`, `missing: 127`, `renamed: 2`, `extra: 188`, checked `2026-10-25T23:20:54.414Z`.
- **Stored gate status:** `warn` (`rawStatus: fail` is preserved in `verification.json`).

CON-614 makes an attributable `verify` failure advisory rather than blocking. Every missing item is in a documented scanner gap:

| Gap | Missing | Disposition |
|---|---:|---|
| Client files under `client/` (not in `CANDIDATE_ROOTS`) | 53 components | All 53 exist at the planned path. |
| Intentional P11 deletion / stale P12 delete action | 4 components | `ProjectPicker.tsx` and `DestinationPicker.tsx` were deleted with the superseded destination choice. The `delete` actions for `NewProjectCard.tsx` and `AiProjectCard.tsx` are stale because the P12 update restored those cards. |
| Mongoose schemas not recognized as entities | 6 | `AiPlan`, `Project`, `Sprint`, `Task`, `Activity`, `Workspace`. |
| Mongoose/TypeScript fields not read by the scanner | 33 | Includes `options.targetProjectId` and workspace `ai.*`. |
| Workspace-package dependencies | 19 | Declared in `server/package.json` or `client/package.json`. |
| Absolute-vs-relative endpoint paths | 12 | Present in the routers as `/:slug/...`; the plan records `/api/workspaces/:slug/...`. |
| Scanner path-attribution artifacts | 2 renamed | The planned paths exist; scanner attributed both to `server/jest.config.cjs`. |
| Extra implementation helpers | 8 components | Legitimate AI helpers added by this feature. |
| Extra endpoint aliases | 180 | Relative forms of existing routes plus unrelated pre-existing routes. |

The exact 127 missing items are listed in `verification.json`; the review records the same counts. No missing item is a genuine product gap. The 46/46 AC coverage is established separately by `traceability.json`, the test report and the passing test evidence.
