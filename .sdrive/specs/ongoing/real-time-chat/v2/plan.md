---
title: Real-time chat v2 - technical plan
status: in_progress
version: v2
created: 2026-10-27
updated: 2026-10-29
---

# real-time-chat v2 - technical plan

| | |
|---|---|
| Feature | `real-time-chat` |
| Version | 2 |
| Spec | `.sdrive/specs/ongoing/real-time-chat/v2/spec.md` |
| Governance | `.sdrive/governance/real-time-chat/v2/plan.json` |
| Branch | `feature/chat` (existing) |
| Base | `main` |

## 1. Approach

This is a second pass over an existing module, not a new vertical slice. Every change lands in a file chat v1 already owns, or adds a
sibling file in the same folder, so the change set stays reviewable against the ~20 commits that already sit on `feature/chat`
(RISK-007). Nothing is rebased or merged as part of this feature.

Four decisions shape the plan:

1. **Rename the label, not the type.** `ChatChannel.kind` keeps the value `team` (AC-078). Only `DEFAULT_CHANNELS[0].name`, the seeded
   `description` and the user-facing strings change. Existing workspaces are corrected by extending the seeding pass that already runs on
   every list request, so no migration script and no manual step is introduced.
2. **Grant the channel where membership already changes.** `addAssigneesToProjectMembers` is the single place a task assignment makes
   someone a project member. It grows a return value (the ids it actually added) and each caller emits one `chat:channel-granted` per
   project and user. The client treats that event exactly like a channel it already had: append, dedupe, join the room.
3. **Fetch bytes, never navigate to them.** The attachment anchor is the bug: it points at a `protect`ed route that the browser opens
   without a bearer header (AC-089). The fix is the axios client the rest of the app already uses, `responseType: 'blob'`, and a
   `URL.createObjectURL` cache keyed by attachment id. No token in a URL, no signed link, no new storage service.
4. **One renderer, two new children.** `MessageItem` keeps its `data-message-id` contract so search jump, pin panel and thread panel keep
   working (RISK-012); it delegates the body to a code-aware renderer and the attachment list to a card component.

### Why the code card is a separate lazy chunk

Syntax highlighting is the only thing here that grows the bundle. `prism-react-renderer` is imported with `React.lazy` inside the code card,
so a workspace that never pastes code never downloads it (NFR-032). Snippets above 20,000 characters skip highlighting entirely and render
in a `<pre>` with the same Copy and Download actions.

## 2. Architecture

### Server

| Component | Action | Responsibility |
|---|---|---|
| `server/src/controllers/chatChannelController.ts` | modify | `DEFAULT_CHANNELS` name/description, collision-safe rename of the existing `Team Chat` row, `channelCard` extracted from `conversationCard`, `channelMembers` resolver, `projectChannel` get-or-create handler |
| `server/src/utils/projectMembers.ts` | modify | `addAssigneesToProjectMembers` returns the ids it added (diffed against the current member list) instead of `void` |
| `server/src/utils/chatGrant.ts` | create | Pure: given the added ids, the project and the channel, decide who gets an event; collapses bulk duplicates |
| `server/src/controllers/taskController.ts` | modify | After a create/update that changes assignees, ensure the project channel exists and emit `chat:channel-granted` to each newly added assignee |
| `server/src/controllers/projectController.ts` | modify | On rename, emit `chat:channel` for the project's channel so open clients show the new name |
| `server/src/controllers/chatMessageController.ts` | modify | Populate the author on every path that emits `chat:updated`; keep `messageView` the single view shaper |
| `server/src/routes/chatRoutes.ts` | modify | `GET /chat/projects/:projectId/channel` and `GET /chat/:channelId/members`, both declared before the `:channelId` routes |
| `server/src/realtime/bus.ts` | reuse | `emitToUser` + `userRoom` carry the grant; `emitToChannel` carries the rename |

### Client

| Component | Action | Responsibility |
|---|---|---|
| `client/src/features/chat/lib/code.ts` | create | Pure: detect a pasted snippet, infer the language, map language to file extension, parse fenced bodies |
| `client/src/features/chat/lib/attachments.ts` | create | Pure: MIME-to-kind decision, human size, download filename |
| `client/src/features/chat/hooks/useAttachmentUrl.ts` | create | Module-level `Map<attachmentId, {url, refs}>`; fetch once as a blob, revoke on last unmount |
| `client/src/features/chat/lib/authors.ts` | create | Pure: resolve an author id against the member directory, never return a placeholder for a known id |
| `client/src/features/chat/components/CodeCard.tsx` | create | Language label, lazy highlight, Copy, Download, horizontal scroll |
| `client/src/features/chat/components/AttachmentCard.tsx` | create | Image thumbnail and file card; opens the lightbox or downloads |
| `client/src/features/chat/components/Lightbox.tsx` | create | Modal image viewer, focus trap, Escape, click-outside |
| `client/src/features/chat/components/MembersPanel.tsx` | create | List with presence, role, `You` badge, online-first grouping |
| `client/src/features/chat/components/MessageItem.tsx` | modify | Delegate body to `CodeCard` where applicable; replace the anchor with `AttachmentCard`; drop `attachmentHref` |
| `client/src/features/chat/components/Composer.tsx` | modify | Paste detection into fenced blocks; image/file previews for pending attachments |
| `client/src/features/chat/components/ChatHeader.tsx` | modify | Real `onOpenMembers` wiring; project-channel copy |
| `client/src/features/chat/components/TeamChannelList.tsx` | modify | `Project channels` heading and empty copy; append granted channels |
| `client/src/features/chat/views/ChatView.tsx` | modify | Handle `chat:channel-granted`, open the members panel, drop `attachmentHref` |
| `client/src/features/chat/api.ts` | modify | `projectChannel(slug, projectId)`, `channelMembers(slug, channelId)` |
| `client/src/pages/ProjectDetailPage.tsx` | modify | `Open chat` action gated on `chat:read` |

## 3. Data model

No collection is added, removed or re-indexed.

| Entity | Action | Fields |
|---|---|---|
| `ChatChannel` | update | `name` (`String`) - the `team` row is renamed from `Team Chat` to `Project Chat` by the seeding pass; `kind`, `nameKey`, `project`, `archived` unchanged |
| `ChatMessage` | no_change | `author`, `attachments`, `body` unchanged; the change is that every emit now carries a populated `author` |
| `ChatPresence` | no_change | `online` is derived from the existing presence rows and the socket connection count |
| `Project` | no_change | `members` already carries the assignee addition from v1; v2 only reads the before/after diff |
| `Workspace` | no_change | `members[].roleId` is joined to `Role.name` for the member panel |

### Flow: a task assignment grants the channel

1. `createTask` / `updateTask` resolves the project and computes the incoming assignee ids.
2. `addAssigneesToProjectMembers` runs `$addToSet` and returns the ids that were **not** already members.
3. If that list is non-empty, `createProjectChannel(workspaceId, project)` ensures the channel exists (EC-030).
4. `chatGrant` groups the pairs by project, so a bulk edit yields one event per project and user (EC-033).
5. `emitToUser(userId, 'chat:channel-granted', channelCard)` reaches every tab the assignee has open.
6. The client appends the card, sorts, and `socket.emit('chat:join', channelId)` so the next message arrives live.

An assignee who is offline receives nothing and gets the channel from the normal conversations load (EC-032); no notification row is
written, so nothing stale is replayed.

### Flow: an attachment is rendered

1. `MessageItem` renders `AttachmentCard`, which calls `useAttachmentUrl(id)`.
2. The hook reuses a cached object URL, or calls `api.get('/chat/attachments/:id', { responseType: 'blob' })` through the axios instance that
   already attaches the bearer token and handles 401 by redirecting to login.
3. The image renders from the object URL; a failed fetch renders a retryable placeholder with the file name (EC-037).
4. Refcount drops to zero on unmount, and the URL is revoked then (AC-090).

## 4. API contracts

| Method | Path | Action | Auth | Requirements |
|---|---|---|---|---|
| GET | `/api/workspaces/:slug/chat/projects/:projectId/channel` | create | yes (`chat:read`) | FR-089, FR-090, NFR-035, NFR-036, NFR-038 |
| GET | `/api/workspaces/:slug/chat/:channelId/members` | create | yes (`chat:read`) | FR-094, FR-095, NFR-030, NFR-035 |
| GET | `/api/workspaces/:slug/chat/conversations` | reuse | yes | FR-077 |
| GET | `/api/workspaces/:slug/chat/:channelId/messages` | reuse | yes | FR-091, FR-092 |
| GET | `/api/workspaces/:slug/chat/attachments/:attachmentId` | reuse | yes | FR-086, FR-087, NFR-039 |

`GET .../projects/:projectId/channel` resolves through `loadChannelForCaller` semantics: a project the caller cannot see is `404`, not
`403`, so the endpoint leaks no project existence. It creates the channel only when the caller is a project member, reusing
`createProjectChannel`.

`GET .../chat/:channelId/members` returns
`{ members: [{ _id, name, avatarUrl, roleName, online }], count }`, resolved in two queries: the channel's audience (project members /
workspace members / direct participants) and one `Role` lookup for the distinct `roleId`s (NFR-030).

## 5. Security considerations

- **Project membership is the only gate.** Both new routes run `protect` then `requirePermission('chat:read')` and resolve the channel with
  the v1 `loadChannelForCaller` rules, so a non-member gets the same answer as a nonexistent channel (NFR-035).
- **No token leaves the header.** Attachment bytes travel over the authenticated axios client; no `?token=`, no signed URL, no cookie change
  (NFR-039, CON-520).
- **Object ids are validated before use.** `projectId` and `channelId` go through an `express-validator` `isMongoId()` chain, and every
  query filters by `req.workspace._id` (NFR-036, CON-515/516).
- **No HTML injection.** Code and bodies render as React text nodes; `dangerouslySetInnerHTML` is not introduced, and the highlighter emits
  tokens as elements (NFR-037, CON-517).
- **Stored MIME types are hints.** An attachment typed `image/*` that fails to decode falls back to the file card; the upload allow-list stays
  the only content gate (NFR-040, CON-507).
- **Existing middleware applies.** Helmet, the general rate limiter, and the error handler are inherited; no `process.env` read is added
  (NFR-038).

## 6. Performance considerations

- **Grant latency.** The event rides the existing user room, so the only added work is one `$addToSet` diff and one `findOneAndUpdate`
  upsert per granted project; NFR-029's 2-second budget is met by the socket path, with no poll added.
- **Member list.** Two queries per request regardless of member count (NFR-030).
- **Highlighting.** Lazy chunk, one small language set, and a 20,000-character cap that drops to plain monospace (NFR-032).
- **Attachment bytes.** One fetch per attachment id for the life of the message list, refcounted and revoked (NFR-031).
- **No list re-render storm.** A granted channel is appended with a functional state update and deduplicated by id, so a burst of grants does
  not re-fetch conversations (FR-077).

## 7. UI/UX

- **Copy.** `Project Chat` is the seeded channel; the section heading is `Project channels`; the footer says only project members can read a
  project channel. `Team Chat` and `team channel` disappear from the chat surface.
- **Code card.** Header row: language label, `Copy`, `Download`. Body: highlighted `<pre>` that scrolls its own horizontal overflow
  (NFR-034). Unknown language renders as `text` with no colour assumptions (AC-086). Copy announces via the existing toast pattern.
- **Attachment card.** Images render at a bounded thumbnail height inside the bubble; other files render an icon, name and size. A click on an
  image opens the lightbox; a click on a file downloads it. Both are `<button>`s with an accessible name that includes the file name.
- **Lightbox.** Modal, `role="dialog"`, focus trapped, Escape closes, click-outside closes, focus returns to the thumbnail.
- **Members panel.** A right-hand sheet on desktop, a full-height sheet on mobile. Rows: avatar, name, `You` badge, role, presence dot.
  Online members first, then alphabetical. `aria-live` count matches the header.
- **Project header.** `Open chat` sits with `Edit`, `Open board`, `New sprint`, uses the outlined button variant, and resolves the channel
  before navigating so a project without a channel does not land on an empty route.

## 8. Dependencies

| Dependency | Type | Action | Notes |
|---|---|---|---|
| `prism-react-renderer` | library | add | Lazy-loaded token renderer; no stylesheet, themes come from the token map |
| `axios` | library | no_change | Blob fetches and the bearer interceptor |
| `socket.io` / `socket.io-client` | library | no_change | One new event on the existing user room |
| `lucide-react` | library | no_change | `Code`, `Copy`, `Download`, `FileText`, `Image`, `X` |
| `ChatChannel` / `ChatMessage` / `ChatPresence` | internal | no_change | No schema change |

## 9. Risks

| Risk | Mitigation |
|---|---|
| RISK-007 - `feature/chat` drifts from `main` | Confine edits to the files listed in §2; treat the merge as a separate reviewed step |
| RISK-008 - highlighter weight | Lazy import, small language set, 20,000-character cap |
| RISK-009 - blob memory growth | One cache entry per attachment id, revoked on last unmount, only rendered messages fetched |
| RISK-010 - event storm on bulk edit | Diff then collapse by project and user before emitting |
| RISK-011 - rename collides on `(workspace, kind, nameKey)` | Rename only when no `team` row already holds `project chat`; otherwise leave that row and stop |
| RISK-012 - renderer regression | Keep the body renderer a child component and preserve `data-message-id` |

## 10. Verification

Production code only; test authoring and execution belong to `/sdrive:test` (CON-401). Before hand-off the change is checked by
`pnpm --filter server typecheck`, `pnpm --filter client typecheck`, `pnpm --filter client lint` and `pnpm --filter client build`, plus a
browser pass over `/{workspace}/chat` and `/{workspace}/projects/:id` at 320px and with the keyboard only.

---

## 11. Amendment - project chat entry, chat shell and delivery fixes (update-propose, 2026-10-28)

### 11.1 Approach

This is a third, deliberately small pass over the same module: every change lands in a file chat v1 or v2 already owns, or adds a sibling
in the same folder. Nothing is rebased or merged (RISK-007), no dependency is added, and no schema, index, permission or route is created.

Five decisions shape the plan:

1. **The sidebar entry becomes navigation, not a channel.** The chat root is a destination of its own, so a `Project chat` item joins the
   navigation and `SidebarChannels` stops rendering the seeded `team` channel as a row. `ChatView` stops redirecting the root route, so the
   root shows the list with nothing selected (AC-100, AC-101). The stored row, its `kind: 'team'`, its permissions, its unread state and the
   v2 rename backfill are untouched (AC-102, AC-078).
2. **One bounded frame, two scroll owners.** The flex chain from `SidebarInset` down to the chat screen gets a real height (`h-full` plus
   `min-h-0` at every level) so the document itself never scrolls; the conversation list and the message pane each own `overflow-y-auto`, and
   the header sits outside the message scroll container instead of inside it (AC-103, AC-104, AC-105). No `position: sticky` and no new
   z-index is introduced; the fix is layout, not stacking.
3. **One merged, recency-ordered list.** The two labelled segments are replaced by a single run of rows ordered by latest activity, with the
   new-direct-message picker staying first. The shared row rendering that AC-056 established is extracted rather than rewritten, so every kind
   of conversation still reads identically (AC-114, and the AC-056/AC-065 amendment recorded in the spec).
4. **The access fact travels with the request.** `downloadAttachment` resolves project membership exactly the way the socket path already does
   and hands it to `decideChannelAccess` (AC-108), while the 404-for-outsiders rule is unchanged (AC-109). No token reaches a URL and the
   failure path stays the retryable card (AC-110).
5. **One truth for unread, one event for a reply.** After a conversation is marked read the client reconciles rather than trusting the
   server's older flag (AC-111), the sidebar subscribes to the grant/rename events the view already handles (AC-113), and a reply emits the
   parent's authoritative post-increment count so every member's row updates without a reload (AC-115, AC-116).

### 11.2 Architecture

#### Server

| Component | Action | Responsibility |
|---|---|---|
| `server/src/controllers/chatMessageController.ts` | modify | `downloadAttachment` resolves the caller's project membership (one `Project.exists` against the message's channel) and passes it to `decideChannelAccess`, the same shape the socket path uses, keeping 404 for a caller who may not read the channel; `createMessageInChannel` emits the thread update after the `replyCount` increment |
| `server/src/utils/chatThread.ts` | create | Pure: given the parent document after the increment, shape `{ messageId, channelId, replyCount, lastReplyAuthor }` so the event carries the authoritative count instead of a delta |
| `server/src/realtime/bus.ts` | modify | The `chat:thread` event name beside the existing `chat:message`/`chat:updated` helpers; the channel room and `emitToChannel` are reused as they are |
| `server/src/realtime/chatEvents.ts` | reuse | The socket send path keeps using `createMessageInChannel`, so a message sent over the socket emits the thread update too |
| `server/src/utils/chatAccess.ts` | reuse | No rule change; the missing input (project membership) is what was wrong, not the rule |
| `server/src/routes/chatRoutes.ts` | no_change | No route, path, validator or permission changes |

#### Client

| Component | Action | Responsibility |
|---|---|---|
| `client/src/components/Sidebar.tsx` | modify | Render the `Project chat` navigation item in the chat position (link to `/{slug}/chat`, current on the root and on any conversation route, no channel glyph), and pass a viewport-bounded class (`h-svh min-h-0 overflow-hidden`) to `SidebarInset` on the chat route only, so the app header (`shrink-0`, `min-h-14`) plus the chat screen fill the viewport and the panes scroll inside |
| `client/src/components/ui/sidebar.tsx` | reuse | No change. `SidebarInset` already merges a `className` (`cn("relative flex w-full min-w-0 flex-1 flex-col bg-background …", className)`), and the provider's `min-h-svh` wrapper stays as it is: a route-scoped height on the inset is enough to bound the chat screen without changing how every other page scrolls |
| `client/src/features/chat/components/SidebarChannels.tsx` | modify | Stop rendering the seeded `team`/`general` rows as channel entries (the root item replaces them), patch rows from the grant/rename events, and reconcile the unread indicator with the client read state |
| `client/src/features/chat/views/ChatView.tsx` | modify | No root redirect; one merged conversation list; bounded list pane and message pane; the header outside the message scroll container; resolve a channel named by the route that the list does not hold yet; apply the thread update |
| `client/src/features/chat/components/ConversationList.tsx` | create | The merged, recency-ordered list for the chat root: the picker first, then every conversation as one row, its own scroll owner, the loading/empty copy for the whole view, and the settings affordance |
| `client/src/features/chat/components/ConversationRow.tsx` | create | The single row extracted from `ConversationSection` - avatar, name, preview, unread badge, `aria-current` - so every conversation kind renders identically (the substance of AC-056) |
| `client/src/features/chat/components/ConversationSection.tsx` | modify | Delegate its rows to `ConversationRow`; its props and behaviour are otherwise unchanged, so its existing callers and tests keep working |
| `client/src/features/chat/components/TeamChannelList.tsx`, `client/src/features/chat/components/DirectMessageList.tsx` | modify | Stop being rendered by the chat root (its copy moves into the merged list's empty state); they are kept, not deleted, because this amendment does not author tests (CON-401) and `/sdrive:review` may decide to retire them with their tests in a follow-up |
| `client/src/features/chat/lib/conversations.ts` | modify | Add `mergeConversations(directs, teams)` (interleave then `sortConversations`) so the merged order has one implementation and stays covered by the existing pure-logic test file |
| `client/src/features/chat/lib/messages.ts` | modify | Add `patchParentReply(messages, update)` (pure): set the reply count and last reply author on the parent, leave every other row and an unloaded parent alone |
| `client/src/features/chat/hooks/useChatSocket.ts` | modify | Listen for `chat:thread` and pass the update to the view |
| `client/src/features/chat/hooks/useChatMessages.ts` | modify | Apply the parent patch; still refuse to add a reply to the channel list |
| `client/src/features/chat/hooks/useChatChannels.ts` | modify | Merge a channel the route names but the list does not hold (the granted-channel case) and expose it so the view can open it before the next list load |
| `client/src/features/chat/lib/readState.ts` | modify | Expose the local read timestamp in a form the unread decision can compare with the server flag, so a stale flag cannot re-light a badge |
| `client/src/features/chat/components/CodeCard.tsx` | modify | Replace `hover:bg-slate-800 hover:text-white` with the token-based inverse surface plus the documented hover state layer, so contrast holds in both themes |
| `client/src/index.css` | no_change | The `inverse`/`inverse-text` tokens and the hover state layer already exist and are remapped for dark mode |

### 11.3 Data model

| Entity | Action | Fields | Notes |
|---|---|---|---|
| `ChatChannel` | no_change | - | No field, index or `kind` change; the seeded `team` row keeps its `nameKey` and its unread state (AC-102) |
| `ChatMessage` | no_change | - | `replyCount` and `lastReplyAuthor` already exist and are already incremented; this amendment only reads the post-increment values |
| `ChatRead` | no_change | - | The existing read state is reused; the client stops trusting a stale server flag (AC-111) |
| `Project` | no_change | - | Membership is read, never written, by the attachment route (AC-108) |

No migration, no backfill and no new collection: the amendment is display, layout, access-decision and event-shape work.

### 11.4 API contracts

| Method | Path | Action | Notes |
|---|---|---|---|
| GET | `/chat/attachments/:attachmentId` | modify (behaviour only) | Same path, validators and `chat:read` permission; the controller now resolves project membership and passes it to `decideChannelAccess` (AC-108). A caller who may not read the channel still gets 404 (AC-109) |
| GET | `/chat/channels`, `/chat/conversations` | reuse | Unchanged; the client merges and orders the payload itself instead of asking for a new shape |
| GET | `/chat/:channelId/messages` | reuse | Unchanged; the reply count arrives on the parent row as it already does |
| socket | `chat:thread` | create (event, not a route) | Emitted to the channel room after a reply is persisted and its parent incremented, carrying `{ channelId, messageId, replyCount, lastReplyAuthor }`; `chat:message` still carries the reply itself (AC-115, AC-116) |

No endpoint is added, removed or renamed, and no permission or validation chain changes.

### 11.5 Security

- **Access decision gets its missing input.** The attachment route resolves `Project.exists({ _id: channel.project, members: userId })` for a project channel and passes it exactly like `resolveChannel` in the socket path, so a project member without `chat:moderate` can read a file they are entitled to while an outsider keeps receiving 404 (AC-108, AC-109, NFR-046).
- **No disclosure change.** The not-found answer stays identical for a direct conversation the caller is not part of, a project channel they are not a member of, and a channel that does not exist, so no existence information leaks.
- **No token in a URL.** The blob fetch keeps using the authenticated axios client (FR-086/AC-089 unchanged); the amendment adds no signed link, no query token and no download route.
- **Socket audience unchanged.** `chat:thread` goes to `channelRoom(channelId)`, the same audience `chat:message` already reaches; membership was checked by the existing send path before the emit, and a member without access is never in that room.
- **Route and workspace scoping unchanged.** No new route means no new middleware order to get wrong; every query this amendment touches stays workspace-scoped (CON-106).

### 11.6 Performance

- **The merged list is one sort over memory.** `mergeConversations` concatenates two arrays the client already holds and sorts them once (`O(n log n)` with `n` = conversations the member can read); no extra request is issued on navigation or on a live message.
- **Unread reconciliation is one write per open.** The client compares its stored read timestamp with the channel's last activity and writes at most one read state per conversation open; no polling interval is added (NFR-045).
- **A reply costs one small emit.** The thread update is a four-field payload on a room the member is already in, and it replaces a delta the client would otherwise have to guess, so the parent row updates without a refetch (NFR-044).
- **The frame does not thrash.** Bounding the height is a static layout change: no resize observer, no virtualisation, and the existing message page sizes are untouched.
- **The sidebar stays calm.** Rows are patched from events the view already handles (grant/rename) rather than re-fetching the channel list on every navigation (NFR-045).

### 11.7 UI/UX

- **Sidebar.** One `Project chat` row in the chat position with a `MessageSquare` glyph, `aria-current="page"` on the root and on any conversation route, no `#`/lock glyph, and a tooltip with the same label. It carries no badge of its own: unread stays on the conversation rows the item opens (AC-111).
- **Chat root.** The list owns the left pane and the new-direct-message picker stays its first element (the part of AC-065 that survives); with nothing selected the right pane explains that a conversation must be picked, and says so honestly to a member who has none (AC-101, EC-044).
- **One merged list.** Every conversation is one row - avatar, name, last-message preview, unread badge, `Archived` chip when relevant - ordered by latest activity, with no `Project channels`/`Direct messages` headings (AC-114).
- **Scroll.** The list pane and the message pane each own their scroll; the header (name, presence, transport, search, pins, members) sits above the message scroll container so it never leaves the viewport, and day separators keep their existing sticky treatment inside the message pane (AC-103, AC-104, AC-105).
- **Code card.** Copy and Download use the inverse surface tokens with the documented hover state layer (a translucent white in both themes) instead of `hover:bg-slate-800 hover:text-white`, so label, icon and focus ring keep their contrast in light and dark (AC-107).
- **Threads.** The reply count on the parent row is a live value; an open thread panel appends the arriving reply; a reply for another parent only changes that parent's count (AC-115, AC-116).
- **Failure states.** An unreadable attachment keeps the retryable card with the file name, an unreachable conversation keeps the empty pane only after access was checked, and a disconnected socket still says `Reconnecting` in the header (AC-110, EC-045).

### 11.8 Dependencies

| Dependency | Type | Action | Notes |
|---|---|---|---|
| `socket.io` / `socket.io-client` | library | no_change | One more event on the existing room; the `socket-io` skill already covers the pattern |
| `axios` | library | no_change | Carries the attachment blob fetch as it does today |
| `lucide-react` | library | no_change | `MessageSquare` for the nav item and the existing code-card icons |
| `tailwindcss` | library | no_change | Layout utilities and the token map in `client/src/index.css` |
| `prism-react-renderer` | library | no_change | Untouched by this amendment |
| `ConversationSection` / `TeamChannelList` / `DirectMessageList` | internal | no_change | Kept and refactored to delegate rows; retirement is a separate decision |

### 11.9 Risks

| Risk | Mitigation |
|---|---|
| RISK-013 - a bounded height clips content on a short viewport, at 200% zoom or with the software keyboard open | `min-h-0` at every flex level, the composer outside the scroll container, and a browser check at 320x568 and 200% zoom |
| RISK-014 - the sidebar item removes the desktop shortcut to the seeded channel | The channel stays a row in the merged list with its unread state, and the browser pass confirms it is reachable |
| RISK-015 - `/chat` no longer redirects, so older links land on the list | The root shows the list with an explicit empty pane, `/chat/:channelId` is unchanged, and the README update is a documentation task |
| RISK-016 - a patched reply count can drift if an event is missed while disconnected | The count is re-derived from `listMessages` on the next load and the event carries the authoritative value, not a delta |
| RISK-017 - one merged list changes a surface AC-056/AC-065 fixed | The row rendering is extracted, not rewritten, so previews, badges and the picker position are preserved, and the spec records the amendment explicitly |

### 11.10 Verification

Production code only; test authoring and execution belong to `/sdrive:test` (CON-401). Before hand-off the change is checked by
`pnpm --filter server typecheck`, `pnpm --filter client typecheck`, `pnpm --filter client lint`, `pnpm --filter client build` and
`node .sdrive/scripts/validate-governance.js`, plus a browser pass over `/{workspace}/chat` (root, list, conversation, thread, attachment)
at 320px, at 200% zoom and with the keyboard only, and a second account to confirm that a granted project channel opens without a reload and
that a non-moderator project member can open a posted file (CON-703).

---

## 12. Amendment 2 - sidebar composition, overlay contrast and delivery (update-propose, 2026-10-29)

### 12.1 Approach

A fourth, small pass over the same module. Every change lands in a file the feature already owns; nothing is rebased, and no
dependency, route, model or permission is added.

Four decisions:

1. **The sidebar shows the workspace-wide channel again.** `SidebarChannels` swaps its filter from `kind === 'direct'` to
   `kind === 'general'`, so the chat group is `Project chat` plus `General` and no direct-message row (AC-117). `General` needs no
   access work: `visibleChannelClause` already lists `general` among the base kinds every member with `chat:read` can see, so
   FR-107 pins existing behaviour, and the row keeps deriving its badge from the member's read state (AC-118).
2. **Centre the block, not only its text.** `EmptyState` is already `text-center`; the pane now centres it in the available space
   and narrows its description, so the state reads as one composed block instead of a line that spans the pane (AC-119).
3. **A scrim the theme cannot remap.** `Lightbox` stops using `bg-slate-900/80` - `.bg-slate-900` is rewritten to
   `--color-inverse` in the dark theme, which turns the scrim into a light wash - and uses a fixed black scrim instead (AC-120).
4. **Patch what the client already holds.** Opening a conversation clears its card in place (`markConversationRead`) and a
   successful send patches the sender's card (`applySentMessage`), so neither costs a request (AC-121, AC-122, NFR-048). The reply
   path completes the same idea on the server: the acknowledgement and the REST response carry the parent summary
   (`threadUpdateOf`), so the author's count is as live as everyone else's (AC-123).

### 12.2 Architecture

| Component | Action | Responsibility |
|---|---|---|
| `client/src/features/chat/components/SidebarChannels.tsx` | modify | Filter to `kind === 'general'`; keep the group hidden without `chat:read`, the read-state badge and the grant/rename notice subscription |
| `client/src/features/chat/views/ChatView.tsx` | modify | Centre the nothing-selected pane and narrow its description; clear the opened card; patch the sender's card on the ack and on the REST response; apply the parent summary a send returns |
| `client/src/features/chat/lib/conversations.ts` | modify | `markConversationRead(cards, channelId)` (pure, a no-op when the card is absent) and `applySentMessage(cards, message, currentUserId)` sharing `applyIncomingMessage`'s ordering |
| `client/src/features/chat/components/Lightbox.tsx` | modify | Replace the remapped surface with a fixed dark scrim and keep the dialog chrome on inverse tokens |
| `client/src/components/ds/primitives.tsx` | reuse | `EmptyState` unchanged; the pane supplies the centring and the narrower description through `className` |
| `client/src/features/chat/hooks/useChatSocket.ts` | modify | Type the acknowledgement's `thread` summary and return it with the sent message |
| `client/src/features/chat/hooks/useChatMessages.ts` | modify | Patch the parent from the send result, including the open thread's parent |
| `server/src/controllers/chatMessageController.ts` | modify | Return the parent summary (`thread`) from `sendMessage`, reusing the value that already feeds `chat:thread` |
| `server/src/realtime/chatEvents.ts` | modify | Put the same summary on the socket acknowledgement |
| `server/src/utils/chatThread.ts` | reuse | The shaper stays the single place the summary is shaped |

### 12.3 Data model

| Entity | Action | Fields | Notes |
|---|---|---|---|
| `ChatChannel` | no_change | - | `kind` still decides the audience; `general` stays a base kind |
| `ChatMessage` | no_change | - | `replyCount`/`lastReplyAuthor` are read after the increment, as before |
| `ChatRead` | no_change | - | The list badge reuses the same read state the sidebar uses |

No migration, no backfill, no new collection.

### 12.4 API contracts

| Method | Path | Action | Notes |
|---|---|---|---|
| POST | `/api/workspaces/:slug/chat/:channelId/messages` | modify (response body) | The 201 body gains `thread` (parent summary) when the message is a reply; nothing else changes |
| socket | `chat:send` | modify (ack payload) | The ack gains the same `thread` summary; `chat:thread` keeps going to the room for everyone else |
| GET | `/chat/channels`, `/chat/conversations` | reuse | Unchanged; the sidebar filters what it already receives |

No endpoint is added, removed or renamed, and no permission or validation chain changes.

### 12.5 Security

- **No access change.** `General` is already readable by every member with `chat:read`; the sidebar only stops hiding it, and it
  never exposes a channel the API would refuse (`chatApi.channels` is already scoped).
- **No new route.** The send response only gains a summary of a parent the caller was already allowed to read.
- **Same disclosure rules.** A parent outside the caller's channel is never returned; the summary is shaped from the parent row the
  send already updated.
- **No token in a URL**, and the overlay still renders bytes from the object-URL cache rather than a protected link.

### 12.6 Performance

- **Zero extra requests.** Clearing a badge and raising the sender's card are local state patches over data already loaded.
- **One write per open, unchanged.** `markRead` keeps its single POST; the card patch rides the same render.
- **The ack carries one small object.** No extra query: the parent is already loaded to increment its count.
- **No polling.** The list order and badges stay event-driven.

### 12.7 UI/UX

- **Sidebar.** `Project chat` (destination) then `General` (channel) with its unread badge; no direct-message rows. On mobile the
  group closes the sheet after navigation, as before.
- **Empty pane.** Icon, title and description centred as one block; description constrained (`max-w-sm`, balanced lines) so it never
  runs edge to edge (AC-119).
- **Image overlay.** A fixed dark scrim (at least 80% black) behind the image, with the title, close and download controls on the
  inverse tokens so they stay legible in both themes (AC-120, NFR-047).
- **List feedback.** Opening a row clears its badge immediately; sending moves the row to the top with the new preview; a reply
  updates the parent's count for everyone, including its author (AC-121..AC-123).

### 12.8 Dependencies

| Dependency | Type | Action | Notes |
|---|---|---|---|
| `socket.io` / `socket.io-client` | library | no_change | The ack payload grows one field |
| `tailwindcss` | library | no_change | A fixed black scrim uses existing utilities; no token is added |
| `ChatChannel` / `ChatMessage` / `ChatRead` | internal | no_change | No schema change |
| `EmptyState` / `Lightbox` / `lib/conversations.ts` | internal | reuse / modify | Existing assets, no new component |

### 12.9 Risks

| Risk | Mitigation |
|---|---|
| RISK-018 - a fixed dark scrim can swallow the dialog's own controls in the light theme | Keep the chrome on the inverse tokens and re-check contrast in both themes |
| RISK-019 - an optimistic card patch can disagree with the server order when clocks differ | Use the timestamp from the server response and let the next list load replace it |

### 12.10 Verification

Production code only; test authoring belongs to `/sdrive:test` (CON-401). Before hand-off: `pnpm --filter server typecheck`,
`pnpm --filter client typecheck`, `pnpm --filter client lint`, `pnpm --filter client build`, `node .sdrive/scripts/validate-governance.js`
and `sdrive verify` (recording the CON-614 attribution if it reports fail again), plus a browser pass over the chat root, a channel,
an opened image and a thread at 320px and in the dark theme where the environment allows it.
