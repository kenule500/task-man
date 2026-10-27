> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Plan — Workspace and project wiki pages

- **Feature:** `wiki-pages`
- **Version:** v1
- **Machine-readable plan:** `.sdrive/governance/wiki-pages/v1/plan.json`

## Architecture

**Approach.** A tree of Markdown documents plus a bounded history. `Page` carries the node (title,
slug, content, parent, position, project, optimistic-concurrency `version`, `archived`) and
`PageVersion` a snapshot of the previous title/content/version per edit. Everything that is not
persistence or transport is a pure function in `server/src/utils/pages.ts` — slug generation and
uniqueness, task-key extraction, depth/subtree measurement, move legality and search snippets — so
the tree rules are decided and tested in one place. The controller validates with express-validator
chains, applies those rules and records `page.created`/`updated`/`deleted` in the shared activity log.
The routes are permission scoped per operation, and the pages path gets its own 400 kB JSON parser
because a document is far larger than an ordinary API body.

**Referenced requirements:** `FR-001`–`FR-012`, `NFR-001`–`NFR-004`.

### Components

| Component | Action | Role |
| --- | --- | --- |
| `server/src/models/pageModel.ts` | create | Page schema + caps + both indexes. |
| `server/src/models/pageVersionModel.ts` | create | Snapshot schema with a unique `(page, version)` index. |
| `server/src/utils/pages.ts` | create | `slugify`, `uniqueSlug`, `extractTaskKeys`, `depthOf`, `subtreeHeight`, `isSelfOrDescendant`, `canMoveUnder`, `snippetAround`, `escapeRegex`. |
| `server/src/controllers/pageController.ts` | create | List/search/get/create/update/delete/move/versions/getVersion/restore + validators, project and mention resolution, activity recording. |
| `server/src/routes/pageRoutes.ts` | create | Ten permission-scoped routes; `/search` before `/:id`. |
| `server/src/app.ts` | modify | `express.json({ limit: '400kb' })` for the pages path before the general parser. |
| `server/src/routes/workspaceRoutes.ts` | modify | Mounts `/ :slug/pages`. |
| `client/src/features/wiki/` | create | api/types/hooks, lib (tree, markdown, mentions) and components (nav, tree, document, editor, MarkdownView, conflict, versions, mention picker, new page, project tab). |
| `client/src/pages/WikiPage.tsx` | create | Workspace wiki screen. |
| `client/src/features/projects/components/ProjectWorkspace.tsx` | modify | Renders `ProjectWikiTab`. |
| `client/src/App.tsx` | modify | Lazy routes for the wiki screens. |

## Data model

### `Page` (create)

`workspace`, `project` (≤ 60, `''` = workspace wiki), `parent` (nullable, → Page), `title` (1..120),
`slug` (≤ 160), `content` (≤ 100 000, Markdown), `position`, `createdBy`, `updatedBy`, `version`
(starts at 1), `archived`; unique `(workspace, project, slug)`, tree index
`(workspace, project, parent, position)`.

### `PageVersion` (create)

`page`, `workspace`, `version`, `title` (≤ 120), `content` (≤ 100 000), `editedBy`, `createdAt`;
unique `(page, version)`. Pruned to the newest `MAX_PAGE_VERSIONS` (20) per page.

### `Activity` (no_change)

`page.created`, `page.updated` and `page.deleted` already exist in `ACTIVITY_ACTIONS`
(`server/src/models/activityModel.ts`); the wiki writes them through `recordActivity`.

### Flow

Create → resolve project → check parent/depth → next sibling position → unique slug (retry on a
duplicate key) → store → `page.created`. Read → tree with a content-less projection, or one page with
creator/editor populated and the content's task keys resolved against the workspace's projects and
tasks (`mentions`). Edit → compare the submitted version (409 with the latest page on mismatch,
short-circuit on a no-op) → atomic version-guarded update → snapshot the pre-edit document → prune →
`page.updated`. Move/delete → load the wiki's node map → `canMoveUnder` / re-parent children →
re-number siblings / delete versions → activity entry. Search → ≥ 2 characters → `escapeRegex` →
case-insensitive match on title/content → `snippetAround`.

## API contracts

| Method | Path | Action | Auth | Requirements |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:slug/pages` | create | required (`tasks:read`) | FR-001, NFR-001 |
| POST | `/api/workspaces/:slug/pages` | create | required (`tasks:write`) | FR-001, FR-002, FR-003, FR-011, FR-012 |
| GET | `/api/workspaces/:slug/pages/search` | create | required (`tasks:read`) | FR-007, NFR-001 |
| GET | `/api/workspaces/:slug/pages/:id` | create | required (`tasks:read`) | FR-008, NFR-001 |
| PATCH | `/api/workspaces/:slug/pages/:id` | create | required (`tasks:write`) | FR-004, FR-005, FR-011 |
| DELETE | `/api/workspaces/:slug/pages/:id` | create | required (`tasks:delete`) | FR-006, FR-011, NFR-001 |
| POST | `/api/workspaces/:slug/pages/:id/move` | create | required (`tasks:write`) | FR-003, FR-006 |
| GET | `/api/workspaces/:slug/pages/:id/versions` | create | required (`tasks:read`) | FR-005, NFR-001 |
| GET | `/api/workspaces/:slug/pages/:id/versions/:version` | create | required (`tasks:read`) | FR-005 |
| POST | `/api/workspaces/:slug/pages/:id/restore/:version` | create | required (`tasks:write`) | FR-005, FR-011 |

`/search` is declared before `/:id` so "search" is never read as a page id, and `protect` is applied
once with `router.use` before the per-route permissions (`server/src/routes/pageRoutes.ts`).

## Security considerations

`plan.json → securityConsiderations`: permission-scoped routes and `workspaceIdOf(req)` filters
(CON-106, CON-512); the Markdown rendering contract that raw HTML is never rendered and URL schemes
are sanitised (CON-517); model and transport caps on content and nesting; and search input escaped
before it becomes a pattern.

## Performance considerations

`plan.json → performanceConsiderations`: content-less tree projections with the full read only for the
selected page; mentions resolved with two bounded queries; snapshots pruned to twenty; search
restricted to one wiki and answering with a snippet; the Markdown renderer lazy-loaded with the route
and memoised.

## Dependencies

`react-markdown` + `remark-gfm`, the path-specific JSON parser, the Mongoose unique/tree indexes and
the shared activity log — see `plan.json → dependencies`.

## Risks

Concurrent edits (version check + 409 + snapshot), crafted moves (single `canMoveUnder` gate),
Markdown rendering (no raw HTML, sanitised schemes, images as links) and storage growth (twenty
snapshots, hard content caps). Details in `plan.json → risks`.
