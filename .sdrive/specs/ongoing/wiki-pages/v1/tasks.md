> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Tasks — Workspace and project wiki pages

- **Feature:** `wiki-pages`
- **Version:** v1
- **Machine-readable tasks:** `.sdrive/governance/wiki-pages/v1/tasks.json`

Every task below is already implemented, so all boxes are checked. Requirements in brackets are the
`FR-###` / `NFR-###` ids from `.sdrive/governance/wiki-pages/v1/spec.json`.

## P1 — Models and pure tree rules

- [x] **T1.1 — Model pages and their versions.** `server/src/models/pageModel.ts` (title 120, content 100k, depth 3, versions 20, slug/position/version/archived, both indexes) and `server/src/models/pageVersionModel.ts`. _(FR-001, FR-005, NFR-003; AC-001, AC-005)_
- [x] **T1.2 — Write the pure slug and mention helpers.** `server/src/utils/pages.ts`: `slugify`, `uniqueSlug`, `extractTaskKeys` (`MAX_MENTIONS`), `snippetAround`, `escapeRegex`. _(FR-002, FR-007, FR-008, NFR-004; AC-001, AC-010, AC-011)_
- [x] **T1.3 — Write the pure depth and move rules.** `depthOf`, `subtreeHeight`, `isSelfOrDescendant`, `canMoveUnder` in the same module. _(FR-003; AC-002, AC-006)_
- [x] **T1.4 — Cover the pure rules with unit tests.** `server/src/__tests__/pages.test.ts`. _(FR-002, FR-003, FR-007, FR-008, NFR-004; AC-002, AC-006, AC-010)_

## P2 — Pages API (depends on P1)

- [x] **T2.1 — Implement listing, reading and searching.** `listPages` (content-less tree, `?project=` with a 404 for unknown projects), `getPage` (populated creator/editor + resolved mentions), `searchPages` (two-character minimum, escaped match, snippets). _(FR-001, FR-007, FR-008, NFR-001, NFR-004; AC-001, AC-010, AC-011)_
- [x] **T2.2 — Implement creation with slug and position rules.** `createPage`: project resolution, parent/depth check, next position, unique slug with a duplicate-key retry, `page.created`. _(FR-001, FR-002, FR-003, FR-011; AC-001, AC-002, AC-003)_
- [x] **T2.3 — Implement version-guarded editing.** `updatePage` (version check, 409 with the latest page, no-op shortcut), `applyEdit` (atomic guarded update), snapshot + prune, `page.updated`. _(FR-004, FR-005, FR-011; AC-004, AC-005)_
- [x] **T2.4 — Implement move and delete.** `movePage` (`canMoveUnder`, sibling re-numbering, answers the tree) and `deletePage` (children move up, versions deleted, `page.deleted`). _(FR-006, FR-003, FR-011; AC-006, AC-007)_
- [x] **T2.5 — Implement the version history endpoints.** `listVersions`, `getVersion` (404 when unknown), `restoreVersion` (old text written as a new edit). _(FR-005; AC-008, AC-009)_
- [x] **T2.6 — Declare the routes and the body limit.** `server/src/routes/pageRoutes.ts` (`protect` once, permission per route, `/search` before `/:id`), mount at `/:slug/pages`, and the 400 kB JSON parser for that path in `server/src/app.ts`. _(FR-012, NFR-001; AC-001)_
- [x] **T2.7 — Cover the pages API with integration tests.** `server/src/__integration__/pages.test.ts`. _(FR-001…FR-008, FR-011, NFR-001; AC-001, AC-002, AC-004, AC-006, AC-007, AC-008, AC-010, AC-011)_

## P3 — Client wiki module (depends on P2)

- [x] **T3.1 — Build the wiki API, types and hooks.** `client/src/features/wiki/{api,types,index}.ts`, `useWikiTree`, `useWikiPage`, `useWikiSearch`, including the conflict result that turns a 409 into `{ kind: 'conflict', page }`. _(FR-009; AC-013)_
- [x] **T3.2 — Write the client tree and markdown helpers.** `lib/tree.ts` (`groupByParent`, `visibleRows`, `ancestorsOf`, `expandedToReveal`, `depthOf`, `heightBelow`, `planMove`, `canAddChild`, `summaryOf`), `lib/markdown.ts` (toolbar edits) and `lib/mentions.ts` (`taskHref`, `mentionLinks`, `remarkTaskKeys`, `isExternalHref`, `isInternalHref`, `describeLastEdit`). _(FR-009, NFR-004; AC-012, AC-013)_
- [x] **T3.3 — Build the reader, editor and dialogs.** `MarkdownView` (react-markdown + remark-gfm + remarkTaskKeys, heading shift, safe links, images as links), `WikiDocument`, `PageEditor`, `ConflictDialog`, `VersionHistorySheet`, `TaskMentionPicker`, `NewPageDialog`, `WikiNav`, `WikiTree`. _(FR-009, NFR-002; AC-012, AC-013)_
- [x] **T3.4 — Add the wiki screens and the project tab.** `client/src/pages/WikiPage.tsx` with lazy routes in `client/src/App.tsx`, and `ProjectWikiTab` rendered by `client/src/features/projects/components/ProjectWorkspace.tsx`. _(FR-009, FR-010; AC-013)_
- [x] **T3.5 — Cover the client wiki with tests.** `client/src/features/wiki/__tests__/{tree,markdown,mentions}.test.ts`, `MarkdownView.test.tsx`, `components.test.tsx`. _(FR-009, NFR-002, NFR-004; AC-012, AC-013)_

## Verification

```bash
pnpm --filter server test pages
pnpm --filter server test:integration pages
pnpm --filter client test features/wiki
pnpm --filter server typecheck && pnpm --filter client typecheck && pnpm --filter client lint && pnpm --filter client build
```

Test-id legend: see `spec.md → Verification (retroactive)` (`TEST-001` … `TEST-006`).
