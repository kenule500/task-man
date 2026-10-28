---
title: Real-time chat v2 - execution tasks
status: complete
version: v2
created: 2026-10-27
updated: 2026-10-27
---

# real-time-chat v2 - execution tasks

| | |
|---|---|
| Feature | `real-time-chat` |
| Version | 2 |
| Plan | `.sdrive/specs/ongoing/real-time-chat/v2/plan.md` |
| Governance | `.sdrive/governance/real-time-chat/v2/tasks.json` |
| Branch | `feature/chat` |

> **Tests are deliberately absent.** Authoring and running tests belongs to `/sdrive:test` (CON-401). These tasks describe production code
> only. Acceptance criteria are linked through `traceability.json`, where the Test agent records the test IDs.
>
> **Dependencies are declared, not installed.** `/sdrive:apply` provisions a skill for every `action: "add"` dependency (`prism-react-renderer`)
> before writing the code that imports it.

## P20 - Project-chat vocabulary

*No dependencies.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T20.1 | Rename `DEFAULT_CHANNELS[0]` to `Project Chat` with project-oriented copy, and extend `ensureDefaultChannels` with a collision-safe rename of an existing `Team Chat` row: only when no `kind: 'team'` row already holds `nameKey: 'project chat'`, so the unique index cannot throw (RISK-011). | FR-072 | AC-076, AC-078 |
| [x] T20.2 | Rewrite the user-facing chat strings - sidebar section heading, empty state, footer, header fallback, conversation labels - to `Project Chat` / `Project channels` / `project channel`, leaving the stored `kind: 'team'` untouched. | FR-073, FR-074 | AC-076, AC-077 |
| [x] T20.3 | Confirm no chat-surface string still says `Team Chat` or `team channel` and that `chatApi` still returns `kind: 'team'` for the renamed row, so permissions and indexes are unchanged. | FR-072, FR-073 | AC-077, AC-078 |

## P21 - A granted project channel arrives live

*Depends on P20.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T21.1 | Change `addAssigneesToProjectMembers` to return the ids it actually added - diffed against the project's current `members` before the `$addToSet` - and keep the existing call sites additive and idempotent. | FR-075 | AC-079 |
| [x] T21.2 | Add `server/src/utils/chatGrant.ts`: a pure function that turns the added ids plus project and channel into at most one `(project, user)` pair, deduplicating a bulk edit (EC-033). | FR-078 | AC-082 |
| [x] T21.3 | In `taskController.ts`, after a create or update that changes assignees, call `createProjectChannel` before emitting so a project without a channel still works (EC-030), then `emitToUser(id, 'chat:channel-granted', channelCard)` per granted pair. | FR-075, FR-076, FR-078 | AC-079, AC-080, AC-081, AC-082 |
| [x] T21.4 | Extract `channelCard` from `conversationCard` in `chatChannelController.ts` and reuse it for the grant payload: id, name, project id, avatar URL, member count, archived. | FR-076 | AC-081 |
| [x] T21.5 | In `ChatView.tsx`, handle `chat:channel-granted`: append to the project-channel list with a functional update, dedupe by id, re-sort, and emit `chat:join` for the room so the next message arrives live. | FR-077 | AC-080, AC-081 |
| [x] T21.6 | Emit `chat:channel` with the updated summary when a project is renamed, so an open chat screen shows the new project name without a reload (EC-042). | FR-079 | AC-080 |

## P22 - Pasted code renders as a code card

*Depends on P20. Requires the `prism-react-renderer` skill.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T22.1 | Add `client/src/features/chat/lib/code.ts` as pure functions: `detectSnippet` (multi-line plus code signals, so a prose line break stays prose - EC-035), `inferLanguage`, `fenceOf` (no double-wrap when the paste is already fenced - EC-034), `extensionOf`, and `parseBody` returning prose and fenced segments. | FR-080, FR-083 | AC-083 |
| [x] T22.2 | Use `detectSnippet` and `fenceOf` in `Composer.tsx`'s paste handler, inserting the fenced block at the caret and preserving indentation. | FR-080 | AC-083 |
| [x] T22.3 | Add `CodeCard.tsx`: header with language label and `Copy` / `Download`, `React.lazy` highlight with a plain `<pre>` fallback above the 20,000-character cap or for an unknown language, and its own horizontal scroll (EC-036). | FR-081, FR-082, NFR-032, NFR-034 | AC-084, AC-086 |
| [x] T22.4 | Render `CodeCard` from `MessageItem.tsx` when `parseBody` finds fenced code or a clearly-code body, keeping the surrounding prose as text nodes (NFR-037). | FR-081 | AC-084 |
| [x] T22.5 | Wire `Copy` to the raw code without fences and `Download` to a blob named from `extensionOf`, both with success announcement and neither requiring edit mode. | FR-082 | AC-085 |

## P23 - Attachments preview, open and download

*Depends on P20.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T23.1 | Add `client/src/features/chat/lib/attachments.ts`: `kindOf` (image versus file from the stored MIME type), `humanSize`, `downloadName`. | FR-084 | AC-087 |
| [x] T23.2 | Add `hooks/useAttachmentUrl.ts` with a module-level refcounted cache keyed by attachment id: fetch with the authenticated axios client and `responseType: 'blob'`, reuse the object URL, revoke on last unmount (NFR-031). | FR-086, FR-087 | AC-089, AC-090 |
| [x] T23.3 | Add `AttachmentCard.tsx`: bounded image thumbnail for `image/*`, file card with icon, name and size otherwise, each a button with an accessible name; a failed fetch renders a retryable placeholder with the name (EC-037). | FR-084, NFR-041 | AC-087, AC-089 |
| [x] T23.4 | Add `Lightbox.tsx`: modal viewer with focus trap, Escape, click-outside, and focus restored to the thumbnail (NFR-033). | FR-085, NFR-033 | AC-088, AC-099 |
| [x] T23.5 | Replace the anchor in `MessageItem.tsx` with `AttachmentCard`, delete the `attachmentHref` prop, and remove its builder from `ChatView.tsx` so no chat surface can navigate to the protected API route. | FR-085, FR-086 | AC-088, AC-089 |
| [x] T23.6 | Preview pending attachments in `Composer.tsx` as image thumbnails or file cards using a local object URL, keeping the existing remove control and revoking the URL on removal. | FR-088 | AC-091 |

## P24 - Open chat from the project

*Depends on P20.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T24.1 | Add `GET /chat/projects/:projectId/channel` to `chatRoutes.ts`, declared before the `:channelId` routes: `chat:read`, an `isMongoId()` chain on `projectId`, workspace-scoped lookup, get-or-create via `createProjectChannel`, `404` for a project the caller cannot see (EC-040). | FR-090, NFR-035, NFR-036, NFR-038 | AC-093 |
| [x] T24.2 | Add `chatApi.projectChannel(slug, projectId)` returning the channel summary. | FR-090 | AC-093 |
| [x] T24.3 | Add the `Open chat` action to `ProjectDetailPage.tsx` beside `Edit`, `Open board` and `New sprint`, gated on `chat:read`, resolving the channel before navigating so a channel-less project does not land on an empty route. | FR-089 | AC-092, AC-093 |

## P25 - A live message always names its author

*Depends on P20.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T25.1 | Populate `author` on every path that emits `chat:updated` - edit, pin, unpin - so the view shaper receives the same shape `chat:message` already sends, and keep `messageView` the single place that shapes a message. | FR-091 | AC-094 |
| [x] T25.2 | Add `client/src/features/chat/lib/authors.ts`: `resolveAuthor(message, directory)` returning the populated author, else a directory hit by id, else a neutral placeholder only for an id nobody knows, and use it in `MessageItem.tsx` and `MessageList.tsx`. | FR-092, NFR-041 | AC-094, AC-095 |

## P26 - Channel member panel

*Depends on P20. Reuses `listChatMembers` and `ChatPresence`.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T26.1 | Extract `listChatMembers`' workspace-directory query into a reusable resolver and add `GET /chat/:channelId/members`, resolving the audience from the channel kind - project members, workspace members, or the two direct participants (EC-038) - in at most two queries with one `Role` lookup for `roleName` (NFR-030). | FR-094 | AC-097, AC-098 |
| [x] T26.2 | Add `chatApi.channelMembers(slug, channelId)` returning `{ members, count }` typed in `types.ts` with `roleName` and `online`. | FR-094 | AC-097 |
| [x] T26.3 | Add `MembersPanel.tsx`: avatar, name, presence dot, role, `You` badge, online members first then alphabetical, count matching the header, keyboard operable with Escape and focus return, no horizontal scroll at 320px. | FR-095, NFR-033, NFR-034 | AC-097, AC-099 |
| [x] T26.4 | Wire `ChatHeader`'s members control to open the panel in `ChatView.tsx`, replacing the empty `onOpenMembers` handler, and keep the panel's count and the header's count from the same source. | FR-093, FR-095 | AC-096, AC-097 |

## P27 - Hardening and verification

*Depends on P20-P26.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T27.1 | Make each new failure path degrade readably: failed attachment fetch, failed highlight import, failed member query - no unhandled rejection and no console error. | NFR-041 | AC-089, AC-099 |
| [x] T27.2 | Sweep the new surfaces for the security baseline: both routes run `protect` then `requirePermission('chat:read')`, every parameter is an `isMongoId()` chain, every query is workspace-scoped, and no token reaches a URL. | NFR-035, NFR-036, NFR-037, NFR-038, NFR-039, NFR-040 | AC-086, AC-089, AC-093 |
| [x] T27.3 | Run `pnpm --filter server typecheck`, `pnpm --filter client typecheck`, `pnpm --filter client lint` and `pnpm --filter client build`, then check `/{workspace}/chat` and `/{workspace}/projects/:id` in the browser at 320px and by keyboard (CON-305, CON-306). | NFR-033, NFR-034 | AC-096, AC-099 |
