> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Workspace and project wiki pages

- **Feature:** `wiki-pages`
- **Version:** v1
- **Status:** implemented (documented after the fact from `server/src` and `client/src`)

## Overview

### Problem

Knowledge about a workspace or project had nowhere to live: decisions were spread across task
descriptions and comments, they could not be structured, they could not be found again, and two
people editing the same text silently overwrote each other. Teams also wanted a document to point at
the tasks it is about without copying links by hand.

### Solution

A Markdown wiki per workspace, optionally scoped to a project, stored in two collections:
`Page` (tree node: title, slug, Markdown content, position, parent, an optimistic-concurrency
`version`, `archived`) and `PageVersion` (a snapshot of the text before each edit, pruned to twenty).

`server/src/utils/pages.ts` holds the pure rules — `slugify`, `uniqueSlug`, `extractTaskKeys`,
`depthOf`, `subtreeHeight`, `isSelfOrDescendant`, `canMoveUnder`, `snippetAround`, `escapeRegex` — and
`server/src/controllers/pageController.ts` applies them, so nesting limits, cycle prevention, search
snippets and task-key mentions are decided by tested functions. The router
`server/src/routes/pageRoutes.ts` serves `/api/workspaces/:slug/pages` with a dedicated 400 kB JSON
limit (`server/src/app.ts`) and `tasks:read`/`tasks:write`/`tasks:delete` per route.

The client (`client/src/features/wiki`) renders GitHub-flavoured Markdown with `react-markdown` +
`remark-gfm` plus a custom `remarkTaskKeys` plugin, and provides a keyboard-operable tree, a
toolbar editor, a conflict dialog for 409 answers, a version history sheet and a project tab.

### Target audience

Workspace members documenting processes and decisions, project teams keeping a wiki beside their
tasks, and readers who want to jump from a document straight to the task it mentions.

### Assumptions

- Pages are plain Markdown: no rich-text/block editor, and no asset pipeline for page images (remote
  images render as links — see `MarkdownView.tsx`). `assumption: true`
- The tree is loaded whole per workspace or project (titles only); there is no virtualised loader for
  very large wikis. `assumption: true`
- Restoring a version is implemented as a new edit, so a page's version number never goes backwards
  (`pageController.ts#restoreVersion`). `assumption: true`

### Out of scope

- Real-time collaborative editing (OT/CRDT); concurrency is handled by the version check and the
  conflict dialog.
- Page-level permissions inside a workspace — access is the workspace permission set, scoped to the
  page's project where applicable.
- Attachments or images hosted inside a page; attachments belong to tasks (GridFS,
  `server/src/utils/gridfs.ts`).

## User stories and acceptance criteria

### US-001 — Write and organise pages

- **Role:** workspace member
- **Want:** to create a page with a title and Markdown, nest it under a parent, and keep it in a
  project or in the workspace wiki
- **Benefit:** knowledge lives where the work is instead of in comments

| AC | Acceptance criterion |
| --- | --- |
| AC-001 | `GET …/pages` returns tree rows (no content) for the workspace wiki or one project (`?project=`, 404 for an unknown project); `POST` creates from title (1..120), optional content (≤ 100 000 chars), optional project and parent, deriving a unique slug for that wiki. |
| AC-002 | A parent must belong to the same wiki and the resulting depth must not exceed `MAX_PAGE_DEPTH` 3, else a readable rule error; a page can never be its own parent. |
| AC-003 | A new page is appended after its siblings (`position` = last + 1, `0` when first) and creation is recorded as `page.created` with the project when set. |

### US-002 — Edit without losing someone else's work

- **Role:** workspace member
- **Want:** my save refused if the page moved on, and the previous text kept
- **Benefit:** nobody's writing disappears silently

| AC | Acceptance criterion |
| --- | --- |
| AC-004 | `PATCH …/pages/:id` requires the edited version: a stale version answers 409 with the "someone else changed this page while you were editing" message plus the latest page; a request that changes nothing returns the current page without a new version. |
| AC-005 | An accepted edit snapshots the previous title/content/version into `PageVersion`, increments the page version, sets `updatedBy`, keeps only the newest `MAX_PAGE_VERSIONS` (20) and records `page.updated` with the changed fields. |

### US-003 — Move and delete pages

- **Role:** workspace member
- **Want:** to reorder and re-nest pages, and delete one without losing its children
- **Benefit:** the wiki stays tidy as it grows

| AC | Acceptance criterion |
| --- | --- |
| AC-006 | `POST …/pages/:id/move` accepts `{ parent, index }`, refuses a move under the page itself or a descendant, or one that would push the subtree past three levels (`canMoveUnder`), and answers with the whole tree of that wiki. |
| AC-007 | `DELETE …/pages/:id` removes the page and its version history while its children move up one level, and records `page.deleted`. |

### US-004 — See and restore earlier versions

- **Role:** workspace member
- **Want:** the last twenty versions and a way to bring one back
- **Benefit:** a bad edit can be undone and the reasoning behind a change can be read

| AC | Acceptance criterion |
| --- | --- |
| AC-008 | `GET /:id/versions` returns the live version plus the newest twenty summaries; `GET /:id/versions/:version` returns one version with its Markdown, or 404 when unknown. |
| AC-009 | `POST /:id/restore/:version` writes that text back as a new edit, so the replaced text stays in history, and answers the restored page with its new version. |

### US-005 — Find a page and the tasks it mentions

- **Role:** workspace member
- **Want:** to search the wiki and to have task keys link to the real tasks
- **Benefit:** I reach the right document and the right task from either side

| AC | Acceptance criterion |
| --- | --- |
| AC-010 | `GET /search?q=` searches titles and content case-insensitively with the query escaped (`escapeRegex`, never used as a pattern), returns one hit per page with a snippet, and an empty list (200) when the query is shorter than two characters. |
| AC-011 | Task keys written in the Markdown are resolved against real tasks of the same workspace by project key and number and returned as `mentions` on a full read; keys matching no task are simply absent. |

### US-006 — Read and author pages in the app

- **Role:** workspace member
- **Want:** a wiki screen with a tree, rendered Markdown, a formatting toolbar and a clear conflict message
- **Benefit:** I can read and write documentation without leaving TaskMan

| AC | Acceptance criterion |
| --- | --- |
| AC-012 | Markdown renders as GitHub-flavoured through `react-markdown`: raw HTML is never rendered, external links open in a new tab with `rel="noopener noreferrer"`, headings shift one level below the page title, remote images render as links and task keys become links to the task. |
| AC-013 | The tree is keyboard operable (arrows move a page up/down/indent/outdent within the depth limit, Enter/Escape for row actions), the editor has a Markdown toolbar, a 409 opens a conflict dialog offering the latest text, and the project workspace renders the same wiki scoped to that project. |

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Pages can be listed as a tree (titles only) for the workspace or one project and created with title, optional Markdown, project and parent, appended after their siblings. |
| FR-002 | A page gets a URL-friendly slug unique inside the workspace + project, with the next free suffix (`-2`, `-3`) and a retry with a random suffix when a concurrent insert wins. |
| FR-003 | Nesting is limited to three levels and cycles are impossible: depth/subtree height come from the tree map and `canMoveUnder` is the single decision point for create and move. |
| FR-004 | Edits are guarded by optimistic concurrency: the client sends the version it edited; a mismatch answers 409 with the latest page, and a no-op edit creates no version. |
| FR-005 | The previous text is snapshotted before each accepted edit, snapshots are pruned to twenty per page, and versions can be listed, read and restored as a new edit. |
| FR-006 | A page can be moved to a new parent/index, and deleted so children move up one level while its history is removed with it. |
| FR-007 | Search covers titles and content with an escaped, case-insensitive match, a two-character minimum, an optional project scope and a contextual snippet. |
| FR-008 | Task keys in Markdown are extracted (≤ 50, distinct, in order) and resolved against the workspace's projects and tasks, so a full read carries the mention list that becomes links. |
| FR-009 | The client module provides tree/nav, reader, toolbar editor, conflict dialog, version sheet with restore, mention picker and the shared tree/mention/markdown helpers. |
| FR-010 | The project workspace embeds the same wiki scoped to the project (`ProjectWikiTab`), gated by the caller's task write permission. |
| FR-011 | Page creation, edits and deletion are recorded as `page.created`, `page.updated` and `page.deleted` with the changed fields. |
| FR-012 | The pages path has its own 400 kB JSON body limit mounted before the general 100 kB parser. |

## Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-001 | Every query filters by `req.workspace._id` and every route is permission scoped: `tasks:read` (list/read/search/history), `tasks:write` (create/edit/move/restore), `tasks:delete` (delete). *(CON-106, CON-512)* |
| NFR-002 | Stored Markdown can never become markup: raw HTML is not rendered, unsafe URL schemes are dropped by `react-markdown`, external links carry `noopener noreferrer`, and no `dangerouslySetInnerHTML` exists in the client. *(CON-517)* |
| NFR-003 | Content stays bounded: title 120, content 100 000 characters, 400 kB JSON body for this path, three nesting levels, twenty versions per page. |
| NFR-004 | Non-visual logic is pure and tested on both sides: `server/src/utils/pages.ts` and `client/src/features/wiki/lib/` each have Jest tests beside them. *(CON-109, CON-202)* |

## Edge cases

| ID | Case | Expected behaviour |
| --- | --- | --- |
| EC-001 | Two pages with the same title created at the same moment in one wiki. | The slug lookup picks the next free suffix; a duplicate-key error from the unique index is retried with a random suffix (≤ 3 attempts) instead of failing the request. |
| EC-002 | A page edited in two tabs and saved by both. | The second save answers 409 with the latest page; the client shows the conflict dialog. Nothing is lost because the snapshot is taken before the accepted change. |
| EC-003 | Deleting a page that has children. | Children move up one level and stay in the tree; the deleted page's versions are removed with it. |
| EC-004 | Moving a page under itself/its descendant, or deeper than three levels. | Refused with a rule error (400) before any write; `canMoveUnder` decides. |
| EC-005 | Searching with an empty or one-character query. | 200 with an empty list. |
| EC-006 | A task key matching no task (deleted task, other project). | Not part of `mentions`, so it renders as plain text while the rest of the page keeps working. |

## Dependencies

| Name | Type | Notes |
| --- | --- | --- |
| `react-markdown` | library | Escapes raw HTML and applies its default URL transform. |
| `remark-gfm` | library | Tables, task lists, strikethrough. |
| `remarkTaskKeys` | internal | Custom plugin that links resolved task keys (`client/src/features/wiki/lib/mentions.ts`). |
| Mongoose indexes | internal | Unique `(workspace, project, slug)`, tree index `(workspace, project, parent, position)`, unique `(page, version)`. |
| `utils/activity.ts` | internal | Writes the page lifecycle entries. |

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-001 | Two editors overwriting each other. | Version check on every edit, 409 carrying the latest page, pre-edit snapshot, client conflict dialog. |
| RISK-002 | A crafted move creating a cycle or too deep a tree. | `canMoveUnder` (cycle check + depth budget) used for create and move, unit tested. |
| RISK-003 | Rendering untrusted Markdown enabling script injection or a tracking image. | No raw HTML, sanitised URL schemes, `noopener noreferrer`, images rendered as links (no third-party request). |
| RISK-004 | Unbounded history. | Twenty snapshots per page (pruned after each snapshot) and history deleted with the page. |

## Verification (retroactive)

| Test id | Test file | What it covers |
| --- | --- | --- |
| TEST-001 | `server/src/__tests__/pages.test.ts` | `slugify`/`uniqueSlug`, task-key extraction, snippets/escaping and the depth/move decisions. |
| TEST-002 | `server/src/__integration__/pages.test.ts` | Access, create/read/validation, nesting and moving, editing and conflicts, history, delete, project scope, mentions, search and the audit trail. |
| TEST-003 | `client/src/features/wiki/__tests__/tree.test.ts` | `visibleRows`, `ancestorsOf`, `expandedToReveal`, `heightBelow`, `planMove`, `canAddChild`. |
| TEST-004 | `client/src/features/wiki/__tests__/markdown.test.ts`, `mentions.test.ts` | Toolbar edits (wrap/prefix/heading/link/task key) and the mention helpers (hrefs, link maps, remark plugin). |
| TEST-005 | `client/src/features/wiki/__tests__/MarkdownView.test.tsx` | Rendering rules: no raw HTML, safe links, task-key links. |
| TEST-006 | `client/src/features/wiki/__tests__/components.test.tsx` | Tree/nav/document/editor/conflict/version components. |

Commands

```bash
pnpm --filter server test pages                    # TEST-001
pnpm --filter server test:integration pages        # TEST-002
pnpm --filter client test features/wiki            # TEST-003, TEST-004, TEST-005, TEST-006
```

> Test names in these files do not carry `AC-###` ids; the mapping above was produced by reading the
> tests during onboarding, so CON-405 remains an unmet convention rather than a verified claim.
