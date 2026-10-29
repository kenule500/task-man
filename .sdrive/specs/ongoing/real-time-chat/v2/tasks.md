---
title: Real-time chat v2 - execution tasks
status: in_progress
version: v2
created: 2026-10-27
updated: 2026-10-29
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

## P28 - The Project chat entry point

*Depends on P27 (the build this amendment corrects). Plan section 11.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T28.1 | Add the `Project chat` item to the chat position of the sidebar navigation: a `Link` to `/{workspaceSlug}/chat` with a `MessageSquare` glyph, `aria-current="page"` on the chat root and on any `/{workspaceSlug}/chat/{channelId}`, no permission- or kind-specific glyph, and a tooltip equal to the label. | FR-096 | AC-100 |
| [x] T28.2 | In `ChatView.tsx`, drop the redirect to the default channel and render the conversation list beside an explicit nothing-selected pane: a member with readable conversations is told to pick one from the list, and a member with none is told who can grant access. | FR-097 | AC-101 |
| [x] T28.3 | In `SidebarChannels.tsx`, stop rendering the seeded `team`/`general` channels as sidebar rows, keep the group hidden without `chat:read`, and patch or add rows from `chat:channel-granted` / `chat:channel` instead of reading the list once at mount. | FR-096, FR-104 | AC-100, AC-113 |
| [x] T28.4 | Confirm the seeded team channel is still listed, readable and unread-tracked inside the root list with `kind: 'team'`, and that `ensureDefaultChannels` and the collision-safe rename backfill are untouched. | FR-098 | AC-102 |

## P29 - A still frame: bounded height, two scroll owners

*Depends on P28. Plan section 11.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T29.1 | Bound the chat route on the box chain: pass `h-svh min-h-0 overflow-hidden` to `SidebarInset` when the path is the chat route, and make `#main-content` and the chat screen `min-h-0` with a real height, so the document itself never scrolls while a conversation is read. | FR-099 | AC-103 |
| [x] T29.2 | Give the conversation-list pane and the message pane their own `overflow-y-auto` scroll owner with `min-h-0` at every level, so scrolling one leaves the other where it was. | FR-099 | AC-104 |
| [x] T29.3 | Take the chat header (and an open search bar or pinned-message panel) out of the message scroll container so it stays visible while the messages scroll beneath it, without introducing a new z-index. | FR-100 | AC-105 |
| [x] T29.4 | Check the containment at 320px, 1920px and 200% zoom: no horizontal scrollbar, the composer above the mobile tab bar, nothing hidden behind the header, and a keyboard focus ring never covered (record the check in the plan's verification section). | NFR-042 | AC-103, AC-106 |

## P30 - Readable code actions and attachments that load

*Depends on P28. Plan section 11.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T30.1 | Replace the code card's `hover:bg-slate-800 hover:text-white` with the inverse-surface tokens plus the documented translucent-white hover state layer, and check the label, icon and focus ring of Copy and Download in the light and the dark theme. | FR-101 | AC-107 |
| [x] T30.2 | In `downloadAttachment`, resolve the caller's project membership for a project channel (one workspace-scoped `Project.exists`) and pass `isProjectMember` to `decideChannelAccess` exactly as the socket path does, keeping 404 for a caller who may not read the message's channel. | FR-102 | AC-108, AC-109 |
| [x] T30.3 | Sweep the attachment failure path: an offline or server failure keeps the retryable card with the file name, Retry refetches and succeeds once the failure clears, nothing navigates away from the app, and no token is placed in a URL. | FR-102, NFR-046 | AC-110 |

## P31 - Unread is one truth

*Depends on P28. Plan section 11.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T31.1 | Make the unread decision read the client's stored read state first and treat a server flag written before the read as cleared, in both the merged list row and the sidebar. | FR-103 | AC-111 |
| [x] T31.2 | After `markRead` resolves, update the affected row's unread state without re-fetching the whole list, with no polling interval and at most one read-state write per conversation open. | FR-103, NFR-045 | AC-111 |
| [x] T31.3 | Update the sidebar rows when a conversation is granted or renamed (the events the view already handles), so the sidebar and the open view never disagree about which conversations exist or what they are called. | FR-104, NFR-045 | AC-112, AC-113 |

## P32 - One conversation list and live threads

*Depends on P28. Plan section 11.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T32.1 | Resolve a conversation named by the route that the list does not hold yet (freshly granted channel, deep link): merge it into the list, or fetch it, before deciding there is nothing to show, so the empty pane is only reached after access was checked and refused. | FR-104 | AC-112 |
| [x] T32.2 | Extract `ConversationRow` from `ConversationSection` (delegating rows so existing callers keep working), add `ConversationList` (picker first, one row per conversation, its own scroll owner, view-level loading and empty copy) and `mergeConversations(directs, teams)` in `lib/conversations.ts`, then make `ChatView` render that single list ordered by latest activity with no per-kind headings. | FR-105 | AC-114 |
| [x] T32.3 | Add `server/src/utils/chatThread.ts` (pure shaper for `{ channelId, messageId, replyCount, lastReplyAuthor }`) and emit `chat:thread` to the channel room from `createMessageInChannel` after the parent increment, so the socket send path emits it as well. | FR-105, NFR-044 | AC-115, AC-116 |
| [x] T32.4 | Handle `chat:thread` in `useChatSocket`, add `patchParentReply(messages, update)` to `lib/messages.ts`, apply it in `useChatMessages` so the parent's count changes without a reload, and append the arriving reply to the open thread panel while leaving a reply for another parent to that parent's own row. | FR-105, NFR-044 | AC-115, AC-116 |
| [x] T32.5 | Sweep the amendment for the baseline and the gates: every touched route still runs `protect` then `requirePermission`, the only new access input is project membership, no token reaches a URL, then run `pnpm --filter server typecheck`, `pnpm --filter client typecheck`, `pnpm --filter client lint`, `pnpm --filter client build` and `node .sdrive/scripts/validate-governance.js`, and finish with the browser pass at 320px, 200% zoom and by keyboard with a second account. | NFR-043, NFR-046 | AC-106, AC-107, AC-109 |

## P33 - Sidebar composition

*Depends on P28. Plan section 12.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T33.1 | In `SidebarChannels.tsx`, render the workspace-wide `general` channel as the only row (filter `kind === 'general'`), keep the group hidden without `chat:read`, keep the read-state badge, and keep the grant/rename notice subscription for a rename. | FR-106 | AC-117 |
| [x] T33.2 | Confirm `General` needs no project membership: it is a base kind in `visibleChannelClause`, so every member with `chat:read` sees it, and its row's badge comes from that member's own read state. | FR-107 | AC-118 |

## P34 - Pane and overlay

*Depends on P33. Plan section 12.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T34.1 | Centre the nothing-selected pane: wrap `EmptyState` in a centred flex container that fills the pane and narrow its description (`max-w-sm`, balanced lines) so the block reads as composed rather than edge to edge. | FR-108, NFR-047 | AC-119 |
| [x] T34.2 | Replace the lightbox backdrop `bg-slate-900/80` with a theme-independent dark scrim (`bg-black/80`), keeping the title, close and download controls on the inverse tokens so they stay legible in both themes. | FR-109, NFR-047 | AC-120 |

## P35 - Badge and ordering

*Depends on P33. Plan section 12.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T35.1 | Add `markConversationRead(cards, channelId)` to `lib/conversations.ts` (pure, a no-op when the card is absent) and apply it to both lists when a conversation is opened, so the list badge clears with the sidebar and without a request. | FR-110, NFR-048 | AC-121 |
| [x] T35.2 | Add `applySentMessage(cards, message, currentUserId)` sharing `applyIncomingMessage`'s preview and ordering, and apply it to the sender's lists for every successful send (socket ack and REST response, replies included), so the conversation rises to the top on the sender's screen too. | FR-111, NFR-048 | AC-122 |

## P36 - The reply reaches its author

*Depends on P35. Plan section 12.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| [x] T36.1 | Server: return the parent summary (`thread`, shaped by `threadUpdateOf`) from `sendMessage` and from the `chat:send` acknowledgement, so a reply's author receives exactly what `chat:thread` gives everyone else. | FR-111 | AC-123 |
| [x] T36.2 | Client: type the acknowledgement's `thread` in `useChatSocket`, return it with the sent message, and patch the parent row (and the open thread's parent) from it in `useChatMessages`/`ChatView`, keeping the `chat:thread` handler for everybody else. | FR-111 | AC-123 |
| [x] T36.3 | Run the gates: `pnpm --filter server typecheck`, `pnpm --filter client typecheck`, `pnpm --filter client lint`, `pnpm --filter client build`, `node .sdrive/scripts/validate-governance.js` and `sdrive verify` (recording the CON-614 attribution if it fails), then the browser pass over the chat root, a channel, an opened image and a thread at 320px and in the dark theme. | NFR-047 | AC-119, AC-120 |
