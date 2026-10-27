---
title: Real-time chat v2 - technical plan
status: in_progress
version: v2
created: 2026-10-27
updated: 2026-10-27
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
