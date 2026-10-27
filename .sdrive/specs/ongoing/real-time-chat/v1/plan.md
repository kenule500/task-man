---
title: Real-time chat — technical plan
status: backlog
version: v1
created: 2026-10-17
updated: 2026-10-17
---

# real-time-chat — technical plan

| | |
|---|---|
| Feature | `real-time-chat` |
| Version | 1 |
| Spec | `.sdrive/specs/backlog/real-time-chat/v1/spec.md` |
| Governance | `.sdrive/governance/real-time-chat/v1/plan.json` |
| Branch | `feature/real-time-chat` |

## 1. Approach

Chat is added as a new vertical slice that follows the conventions already established in this repository rather than introducing a
parallel architecture: models in `server/src/models/`, orchestration in `server/src/controllers/`, path + validator + middleware order in
`server/src/routes/`, and rules that need neither HTTP nor the database as pure modules in `server/src/utils/` (CON-103, CON-109).

Three decisions shape the plan:

1. **REST is the contract; the socket is an accelerator.** Every chat operation is available over HTTP through `requirePermission`
   (CON-512). The socket carries the same operations but is an *additional* path, so the Vercel serverless deployment keeps working at reduced
   immediacy and authorisation has exactly one implementation to audit.
2. **Activity-feed push and chat messaging are separate concerns.** Chat messages are a new event family. Task/project/wiki updates keep using
   `Activity` rows; the socket only changes *how* the client learns about them, not what is stored. This is what keeps RISK-002 contained.
3. **The poller is not deleted.** `useLiveChanges` retains the cursor poll as its fallback path (FR-032). The socket becomes the fast path; the
   poll remains the correctness guarantee (NFR-015).

### Why REST-first matters for this feature

`api/index.ts` re-exports the Express app into a serverless function, and `vercel.json` caps it at `maxDuration: 30`. A WebSocket cannot live
there. Making REST the contract means the Vercel deployment is a supported configuration instead of a broken one, and it means
`/sdrive:secure` can audit one authorisation surface rather than two divergent ones.

## 2. Architecture

### Server

| Component | Action | Responsibility |
|---|---|---|
| `server/src/models/chatChannelModel.ts` | create | Channel kinds, unique name key, project reference, participants, denormalised last-message pointer |
| `server/src/models/chatMessageModel.ts` | create | Message body, author, parent, mentions, attachments, edit/delete/pin timestamps, cursor index |
| `server/src/models/chatReactionModel.ts` | create | One row per `(message, user, emoji)` |
| `server/src/models/chatReadModel.ts` | create | Last-read pointer per `(channel, user)` |
| `server/src/models/chatPresenceModel.ts` | create | User-level presence with a TTL so unclean disconnects age out |
| `server/src/utils/chatAccess.ts` | create | Pure: may this caller read/write/moderate this channel kind? Direct-channel non-participant resolves to `not_found` |
| `server/src/utils/chatQuery.ts` | create | Pure: cursor encode/decode, page-size clamping, search predicate |
| `server/src/utils/chatMentions.ts` | create | Pure: extract mention tokens and map them to workspace member references |
| `server/src/utils/chatValidation.ts` | create | One message-payload validator shared by the REST route and the socket event |
| `server/src/utils/chatRetention.ts` | create | Purges messages past `CHAT_RETENTION_DAYS` from a periodic sweep |
| `server/src/controllers/chatChannelController.ts` | create | List/seed/backfill channels, chat member directory, direct-channel creation |
| `server/src/controllers/chatMessageController.ts` | create | Send, history, replies, edit, delete, pin, search, reactions, read state, attachments |
| `server/src/routes/chatRoutes.ts` | create | Paths + `express-validator` chains + `requirePermission('chat:*')` |
| `server/src/realtime/bus.ts` | create | Socket server reference and room helpers, so controllers broadcast without an import cycle |
| `server/src/realtime/socket.ts` | create | Socket.IO server factory: JWT handshake, workspace room membership, per-connection throttle |
| `server/src/realtime/chatEvents.ts` | create | Chat event handlers delegating to the same controllers |
| `server/src/realtime/activityEvents.ts` | create | Pushes `Activity` changes to permission-filtered audiences |
| `server/src/server.ts` | modify | Attach the Socket.IO server to the existing HTTP server (long-running entry only) |
| `server/src/app.ts` | modify | Chat rate-limit policy and the socket-aware CSP/expectations noted in §5 |
| `server/src/config/permissions.ts` | modify | Register the `chat` area and extend system roles explicitly |
| `server/src/config/env.ts` | modify | `chatRetentionDays` (default 365) and socket origin allow-list |
| `server/src/controllers/projectController.ts` | modify | Create the channel in `createProject`; archive it in `deleteProject` |
| `server/src/routes/workspaceRoutes.ts` | modify | Mount `/chat` and `/channels` under the existing permission-scoped router |
| `server/src/models/notificationModel.ts` | modify | Add the `chat.mention` type; `task` becomes optional; add `channel` and `message` |
| `server/src/models/activityModel.ts` | modify | Register the `chat.message_deleted` action |
| `server/src/utils/activity.ts` | modify | Carry the recorded entry `_id` on the listener payload so a push can hand over a cursor |
| `server/src/utils/emailTemplates.ts` | modify | Add the `chat.mention` sentence and subject |

### Client

| Component | Action | Responsibility |
|---|---|---|
| `client/src/features/chat/index.ts` | create | Public entry (CON-110); nothing outside imports internals |
| `client/src/features/chat/api.ts` | create | REST calls through `client/src/utils/api.ts` (CON-207) |
| `client/src/features/chat/types.ts` | create | Shared DTOs |
| `client/src/features/chat/hooks/useChatChannels.ts` | create | Channel list, unread counts, seeding trigger |
| `client/src/features/chat/hooks/useChatMessages.ts` | create | Cursor paging, prepend without scroll jump, live append |
| `client/src/features/chat/hooks/useChatSocket.ts` | create | Connection, reconnect, transport state, per-event subscription |
| `client/src/features/chat/lib/messages.ts` | create | Pure: ordering, day grouping, prepend/upsert, unread derivation |
| `client/src/features/chat/lib/mentions.ts` | create | Pure: mention detection at the caret and mapping back to member ids |
| `client/src/features/chat/lib/reactions.ts` | create | The emoji offered by the reaction picker |
| `client/src/features/chat/lib/readState.ts` | create | Per-browser last-visit timestamps behind one module (CON-204) |
| `client/src/features/chat/components/MessageItem.tsx` | create | Message row: inline edit, tombstone, attachments, reactions, author-only actions |
| `client/src/features/chat/components/MessageList.tsx` | create | Day-grouped scroll area, load-older, polite live region |
| `client/src/features/chat/components/Composer.tsx` | create | Composer with mention autocomplete and attachment upload |
| `client/src/features/chat/components/ChatHeader.tsx` | create | Title, online count, transport state, search/pin/members controls |
| `client/src/features/chat/components/ChannelList.tsx` | create | Channel list with unread dots and the DM picker |
| `client/src/features/chat/components/SidebarChannels.tsx` | create | The `CHAT` sidebar group |
| `client/src/features/chat/components/ThreadPanel.tsx` | create | Replies panel |
| `client/src/features/chat/components/Panels.tsx` | create | Search results and pinned messages |
| `client/src/features/chat/views/ChatView.tsx` | create | Route screen composing the module |
| `client/src/pages/ChatPage.tsx` | create | Route page wrapped in `AppShell` |
| `client/src/components/Sidebar.tsx` | modify | New `CHAT` group between `Main Menu` and `General` |
| `client/src/components/MobileTabBar.tsx` | modify | Chat entry stays coherent with the desktop sidebar (CON-306) |
| `client/src/App.tsx` | modify | `/{workspaceSlug}/chat` and `/{workspaceSlug}/chat/:channelId` behind `PermissionRoute` |
| `client/src/features/live/**` | modify | Consume socket events; keep the poller as fallback |
| `client/src/utils/api.ts` | modify | Typed narrowing for the 403 `TWO_FACTOR_REQUIRED` payload (pre-existing type error) |
| `vercel.json` | modify | `connect-src` gains `wss:`, which previously blocked sockets outright |

## 3. Data model

### Entities

- **`ChatChannel`** (create) — `workspace` (ObjectId, indexed), `kind` (`team|general|project|direct`), `name`, `nameKey`, `description`,
  `project?`, `participants[]` (direct only, exactly two), `archived`, `lastMessageAt`, `lastMessageAuthor`, timestamps.
  Unique `(workspace, kind, nameKey)` for `team`/`general`/`project`; a separate uniqueness rule for the direct participant pair.
  `description` states the channel's purpose and is informational only — it never restricts read or write (FR-034).
- **`ChatMessage`** (create) — `workspace`, `channel`, `author`, `body`, `parent?`, `mentions[]`, `attachments[]`, `editedAt`, `deletedAt`,
  `pinnedAt`, `pinnedBy`, `createdAt`. Compound index `(channel, createdAt, _id)` to satisfy the cursor predicate.
- **`ChatReaction`** (create) — `workspace`, `message`, `user`, `emoji`; unique `(message, user, emoji)`.
- **`ChatRead`** (create) — `workspace`, `channel`, `user`, `lastReadAt`, `lastReadMessage`; unique `(channel, user)`.
- **`ChatPresence`** (create) — `workspace`, `user`, `connections` (number), `seenAt`; TTL index on `seenAt`.
- **`Project`** (no change) — read and referenced; no schema change is required for channels to attach.
- **`Notification`** (update) — the `type` enum gains `chat.mention`; `task` becomes optional (it was required) so a
  chat notification can exist without one; `channel` and `message` references are added. This lets chat mentions travel
  through the existing store instead of a second notification mechanism (FR-015).
- **`Activity`** (no change to the schema) — the action vocabulary gains `chat.message_deleted` at the call site, and
  `utils/activity.ts` now passes the recorded entry's `_id` to listeners so a pushed change can also carry a cursor.

### Flow: sending a message

1. Client calls `POST /chat/:channelId/messages` (or emits `chat:message` when a socket is up).
2. Route runs `protect` → `requirePermission('chat:write')` → validator chain.
3. Controller loads the channel scoped to `req.workspace._id`, resolves access through `chatAccess.canWrite`, rejects archived channels, and
   normalises mentions through `chatMentions`.
4. `ChatMessage.create`, then `ChatChannel.updateOne` sets `lastMessageAt`/`lastMessageAuthor`.
5. Only after the write succeeds, the socket layer emits `chat:message` to the channel room minus the author's connection, and the REST caller
   receives `201` with the stored message.
6. Mention notifications go through the existing `notify` path, not a new fan-out.

## 4. API contracts

Base: `/api/workspaces/:slug` — every route runs `protect` then `requirePermission`.

| Method | Path | Action | Auth | Requirements |
|---|---|---|---|---|
| GET | `/channels` | create | yes | FR-002, FR-003, FR-006 |
| GET | `/chat/members` | create | yes | FR-014, FR-025 |
| POST | `/chat/direct` | create | yes | FR-025 |
| GET | `/chat/:channelId/messages` | create | yes | FR-010, FR-011, FR-026 |
| POST | `/chat/:channelId/messages` | create | yes | FR-007, FR-008, FR-020 |
| GET | `/chat/:channelId/messages/:messageId/replies` | create | yes | FR-012, FR-013 |
| PATCH | `/chat/:channelId/messages/:messageId` | create | yes | FR-017 |
| DELETE | `/chat/:channelId/messages/:messageId` | create | yes | FR-018, FR-027 |
| POST | `/chat/:channelId/messages/:messageId/reactions` | create | yes | FR-016 |
| DELETE | `/chat/:channelId/messages/:messageId/reactions/:emoji` | create | yes | FR-016 |
| POST | `/chat/:channelId/messages/:messageId/pin` | create | yes | FR-024 |
| DELETE | `/chat/:channelId/messages/:messageId/pin` | create | yes | FR-024 |
| GET | `/chat/:channelId/pins` | create | yes | FR-024 |
| GET | `/chat/:channelId/search` | create | yes | FR-023 |
| POST | `/chat/:channelId/read` | create | yes | FR-022 |
| POST | `/chat/:channelId/attachments` | create | yes | FR-019, FR-020 |
| GET | `/chat/attachments/:attachmentId` | create | yes | FR-019 |

Socket events (all authenticated by the handshake, all validated per event):

`chat:send`, `chat:edit`, `chat:delete`, `chat:react`, `chat:pin`, `chat:read`, `chat:typing`, and the server-side `chat:message`,
`chat:updated`, `chat:deleted`, `chat:reaction`, `chat:typing`, `chat:presence`, `activity:changed`.

## 5. Security considerations

Baseline controls from `.sdrive/constitution.md` §5, expanded from the spec:

| Requirement | Implementation |
|---|---|
| NFR-006 (CON-511) | Handshake reads the bearer token, validates it through the existing auth path, and looks up the session; a revoked or expired session is refused and its open sockets are closed. |
| NFR-007 (CON-512) | Every REST route declares `requirePermission('chat:<action>')`; every query filters `req.workspace._id`. Direct channels return `not_found` rather than `forbidden` so existence is not disclosed. |
| NFR-008 (CON-513) | Chat routes are mounted on the same Express app, so `app.use(helmet())` already applies; the socket upgrade does not create a second HTTP surface. |
| NFR-009 (CON-514) | A dedicated chat limiter is added alongside the existing `apiLimiter`, plus a per-connection token bucket on socket events so one client cannot flood a channel. |
| NFR-010 (CON-515) | `express-validator` chains on every chat route; socket payloads validated by the same pure validators before reaching a controller. |
| NFR-011 (CON-516) | ObjectIds are cast and strings validated; no client input is interpolated into a Mongo operator. Search escapes the term before building its regex. |
| NFR-012 (CON-517) | Message bodies render as text through the existing markdown path; no `dangerouslySetInnerHTML` is introduced. |
| NFR-013 (CON-519) | Socket origins come from `config/env.ts` (`corsOrigins`), not a literal, and are validated at startup. |
| NFR-014 (CON-520) | Production sockets use `wss:`; `vercel.json` `connect-src` must be extended with the socket origin, because it currently allows `'self'` only. |
| CON-518 (CSRF) | Not applicable and unchanged: no cookies, header-based auth, CORS allow-list. The socket carries the same bearer token. |

## 6. Performance considerations

| Requirement | Strategy |
|---|---|
| NFR-001 | Persist then emit; no per-recipient query on the hot path. Room membership is resolved once at connect, not per message. |
| NFR-002 | Compound index `(channel, createdAt, _id)` makes the cursor predicate a range scan; page size capped at 50. |
| NFR-016 | Retention enforced by TTL index on message age plus a documented purge, so history growth is bounded without a maintenance job. |
| NFR-015 | Reconnect replays from the stored cursor instead of refetching a full page, keeping reconnection cheap. |

## 7. Dependencies

| Name | Type | Action | Notes |
|---|---|---|---|
| `socket.io` | library | add | Server transport. Skill to be provisioned by `/sdrive:apply` before use. |
| `socket.io-client` | library | add | Client transport. |
| `express-rate-limit` | library | no_change | Already installed; chat gets its own limiter instance. |
| `express-validator` | library | no_change | Already installed; used for chat chains. |
| `mongoose` | library | no_change | Already installed. |
| Existing RBAC | internal | no_change | Extended with a new permission area, not replaced. |
| Existing notifications | internal | no_change | Reused for mention and direct-message notifications. |
| Existing uploads | internal | no_change | Reused for attachments. |
| Existing change feed | internal | no_change | Retained as the fallback path. |

## 8. Risks

| Risk | Mitigation |
|---|---|
| RISK-001 — Vercel is serverless and cannot hold a socket | REST-first contract; poller retained; transport state surfaced in the UI |
| RISK-002 — push changes where permission filtering happens | Per-audience emit using `hiddenActions(permissions)`, with a regression check per hidden group |
| RISK-003 — events lost while disconnected | Cursor replay on reconnect |
| RISK-004 — 8 live-module tests encode current behaviour | Land transport work as its own commit sequence before chat UI; keep poller tests |
| RISK-005 — user-authored text is the largest XSS surface added | Text rendering only, no raw HTML, verified by `/sdrive:secure` |
| RISK-006 — Render free plan suspends idle instances | Document; rely on reconnect + replay |

## 9. Verification approach

Tests are **not** in this plan. Authoring and running them belongs to `/sdrive:test` (CON-401, and the no-test-tasks rule). Verification tasks
here are limited to linting, typechecking, the SpecDrive governance validator, and manual checks (keyboard, narrow screens, transport states).

## 11. Amendment log

| Date | Change | Reason |
|---|---|---|
| 2026-10-17 | Added `GET /chat/members` and the `chatChannelController` member directory. | The only existing member endpoint (`GET /members`) requires `users:read`, which the Viewer role does not hold. Without a chat-scoped directory a Viewer could not use @mentions (AC-014) or start a direct conversation (AC-026). |
| 2026-10-17 | `Notification` model: `chat.mention` type added, `task` made optional, `channel`/`message` references added. | FR-015 requires chat mentions to use the existing notification infrastructure. The model previously required `task`, so a chat notification could not be stored. |
| 2026-10-17 | `utils/activity.ts` passes the recorded `_id` to listeners. | T7.2 requires a cursor on each pushed change so a reconnecting client can replay without gaps or duplicates (NFR-015). |
| 2026-10-17 | `client/src/utils/api.ts` types the 403 `TWO_FACTOR_REQUIRED` payload. | Pre-existing type error (`data?.code` on `{}`) that failed the client typecheck, blocking CON-402 gates. Not a chat change. |
| 2026-10-17 | Directory placeholders `features/chat/lib` and `features/chat/components` replaced with the concrete files; `pages/ChatPage.tsx`, `chatRetention.ts`, `chatValidation.ts`, `realtime/bus.ts`, `Panels.tsx` and others recorded. | The plan listed folders where the implementation produced named files, which made `sdrive verify` report them missing. |
| 2026-10-17 | `ChatChannel.description` added (FR-034, AC-034); `General` and `Team Chat` documented as one workspace-wide space and one internal-team space. | The two seeded channels were identical apart from their label, so members had no way to know where to post. The distinction is descriptive only: there is no team or department entity in the data model to scope an audience to, so both channels stay writable by anyone with `chat:write`. |

## 12. Phase summary

| Phase | Name | Depends on |
|---|---|---|
| P1 | Foundation: permissions, config, models | — |
| P2 | Channels and project lifecycle | P1 |
| P3 | Messaging core over Socket.IO | P2 |
| P4 | Rich messaging | P3 |
| P5 | Direct messages, moderation, retention | P4 |
| P6 | Presence | P3 |
| P7 | Transport unification | P3 |
| P8 | Client chat UI | P2, P4 |
| P9 | Navigation wiring | P8 |
| P10 | Hardening and verification | P7, P9 |

## 13. Change set — team channels scoped to project members

Added by `/sdrive:update-propose` (2026-10-17). Implements US-016..US-019, FR-035..FR-044, NFR-017..NFR-019, EC-013..EC-017.

### 13.1 Approach

Membership is **materialised, not derived at read time**. Assigning someone a task in a project writes them into that
project's `members` array; channel authorization then filters on that array. Deriving membership from `Task.assignees` on
every channel read would mean a subquery per request and a per-broadcast fan-out lookup — NFR-017 requires the check to be
in the query filter, so the list has to exist. The *trigger* stays automatic (task assignment), which is what "they only get
put on a project when a task is assigned" asks for; the *storage* is a list so reads stay single-query.

Membership is additive: unassigning a task does not remove access. Silent revocation would drop someone out of an audited
conversation mid-thread. Leaving the workspace is the one automatic removal (FR-044).

### 13.2 Server components

| Component | Action | Responsibility |
|---|---|---|
| `server/src/models/projectModel.ts` | modify | Materialised `members` array plus index |
| `server/src/utils/projectMembers.ts` | create | Pure merge / de-duplicate / remove helpers |
| `server/src/controllers/taskController.ts` | modify | Add assignee to the project's members on assignment |
| `server/src/controllers/workspaceController.ts` | modify | Remove a departing member from every project |
| `server/src/utils/chatAccess.ts` | modify | Project channels gated by membership, `chat:moderate` overrides |
| `server/src/controllers/chatChannelController.ts` | modify | Team list with previews, rename, avatar handlers |
| `server/src/routes/chatRoutes.ts` | modify | Team list, rename, avatar upload and download routes |

### 13.3 Client components

| Component | Action | Responsibility |
|---|---|---|
| `client/src/features/chat/components/TeamChannelList.tsx` | create | Group-chat list beside the conversation, with empty state |
| `client/src/features/chat/components/ChannelSettingsDialog.tsx` | create | Rename and avatar editing, `chat:moderate` only |
| `client/src/features/chat/components/SidebarChannels.tsx` | modify | Only `team` and `general` remain main-menu items |
| `client/src/features/chat/views/ChatView.tsx` | modify | Compose the list, archived read-only banner |
| `client/src/features/chat/api.ts` | modify | Team list, rename, avatar calls |
| `client/src/features/chat/types.ts` | modify | Team summary and override types |
| `client/src/components/Sidebar.tsx` | modify | "Team" → "Members" |
| `client/src/App.tsx` | modify | `/:slug/members` plus a redirect from `/:slug/team` |

### 13.4 Data model

- **`Project`** (update) — gains `members: ObjectId[]`, indexed, maintained automatically. `action: modify`.
- **`ChatChannel`** (update) — gains `nameOverride`, `avatarFileId`, `avatarType`. The display name is
  `nameOverride ?? project.name`; the override survives a project rename (AC-046).

### 13.5 API contracts

| Method | Path | Purpose | Requirements |
|---|---|---|---|
| GET | `/chat/teams` | Team-channel list: avatar, name, preview, unread in one request | FR-038, FR-039, NFR-019 |
| PATCH | `/chat/:channelId` | Rename a team channel (`chat:moderate`) | FR-040, FR-041 |
| POST | `/chat/:channelId/avatar` | Replace the avatar (`chat:moderate`), existing upload limits | FR-040, FR-042, NFR-018 |
| GET | `/chat/:channelId/avatar` | Stream the avatar to readers only | FR-042 |

### 13.6 Security and performance

- **NFR-017** — membership is part of the query filter, so a misrouted broadcast cannot deliver another project's messages.
- **NFR-018** — avatars reuse `uploadMiddleware` + `utils/gridfs.ts`; no second upload surface, same size and type limits.
- **NFR-019** — the team list is one aggregation joining last-message previews and unread counts, not a query per channel.
- A non-member receives `404`, never `403`, so a channel's existence is not disclosed (same convention as direct channels).

### 13.7 Open dependency

Nothing in the UI assigns project membership by hand, by design. A project with **no assigned tasks** therefore has an empty
`members` list and its channel is visible only to `chat:moderate` holders (EC-015). That is intended, not a defect — but it
means a freshly created project's channel looks empty to everyone else until the first task is assigned.

## 14. Change set — conversation ergonomics

Implements US-020..US-024, FR-045..FR-051, NFR-020, EC-018..EC-020.

### 14.1 Approach

All presentation changes stay inside the chat feature module; the only cross-cutting edit is the attachment
metadata, which reuses the existing GridFS helpers rather than adding a second storage path. Mentions are
highlighted by **segmenting the body into React nodes**, never by injecting HTML, so the XSS surface is unchanged
(NFR-020).

Attachments gain a channel stamp in GridFS metadata at upload time, and a message only accepts ids stamped with its
own channel. Without that, a member could attach a file from a channel they can read into one whose readers cannot,
leaking the file across audiences (EC-019).

### 14.2 Defect fixed

`Path nameKey is required.` on task creation: the membership hook loaded the project with `select('members')` and
then called `save()`, so Mongoose validated required fields it had never loaded. Replaced with a single atomic
`updateOne` using `$addToSet`, which performs no full-document validation.

### 14.3 Unread and member counts

Both are computed server-side on the existing `GET /channels` response, in two extra queries for the whole list
rather than one per channel, so the badge survives a device change and the count always matches the channel.

### 14.4 Deferred

Message forwarding, per-channel mute preferences, drag-and-drop upload, a jump-to-unread marker, and read receipts
for team channels are recorded in spec §14.6 and not implemented here.

## 15. Change set — direct messages segmented like team channels

Implements US-025..US-026, FR-052..FR-057, NFR-021..NFR-022, EC-021..EC-023.

### 15.1 Approach

The panel becomes two instances of one presentational component. `ConversationSection` owns the heading, the row
anatomy (avatar, name, preview, unread marker, archived chip, `aria-current`), the loading and empty copy, the footline
and the settings affordance. `TeamChannelList` and `DirectMessageList` are thin wrappers that supply copy and data, so
the two sections cannot drift.

Both lists are served by one endpoint, `GET /chat/conversations` → `{ directs, teams }`, computed with the same
aggregation that already backs `/chat/teams`: one query for channels, one for last messages, one for read state, one
for the other participants' names. `/chat/teams` stays for callers that need half of it.

A direct card's label and avatar come from the other participant's `User`, resolved in the same request; the stored
channel name (`Direct message`) is never shown. Authorization is untouched: the direct query stays
`{ kind: 'direct', participants: caller }` and a non-participant still gets `404`.

### 15.2 Components

| File | Action | Note |
|---|---|---|
| `client/src/features/chat/components/ConversationSection.tsx` | create | the shared section: heading, row, states, footline, keyboard |
| `client/src/features/chat/components/DirectMessageList.tsx` | create | DM copy over the shared section |
| `client/src/features/chat/components/TeamChannelList.tsx` | modify | becomes a thin wrapper, keeps the settings affordance |
| `client/src/features/chat/views/ChatView.tsx` | modify | renders the two sections and loads the payload once |
| `client/src/features/chat/types.ts` | modify | `ConversationCard`, `ConversationsPayload`; `TeamChannelSummary` aliased |
| `client/src/features/chat/api.ts` | modify | `conversations()`; `teams()` retyped |
| `client/src/features/chat/index.ts` | modify | exports |
| `server/src/controllers/chatChannelController.ts` | modify | `listConversations`, shared `conversationCard` helper |
| `server/src/routes/chatRoutes.ts` | modify | `GET /chat/conversations` |

### 15.3 API

| Method | Path | Note |
|---|---|---|
| GET | `/chat/conversations` | `{ directs, teams }`, each row `{ _id, name, project, avatarUrl, archived, lastMessage, unread }`; `chat:read` |

### 15.4 Anti-redundancy

`ConversationSection` is new because the row anatomy did not exist as a component; everything else is reuse.
`ChannelList` keeps its sidebar role. No new dependency, no new model, no new permission.

### 15.5 Verification

Typecheck, lint, validator; panel with two sections, one empty section, a DM with an unread message, and a 320px
viewport.

## 16. Change set — conversation list polish and honest counts

Implements US-027..US-031, FR-058..FR-065, NFR-023..NFR-025, EC-024..EC-026.

### 16.1 Approach

Two server defects and four presentation gaps.

The count defect is a data problem, not a rendering problem: `Project.members` is populated only when a task is
assigned, so a project's creator is not a member and a channel shared by two people reports one. The fix adds the
creator at creation and backfills existing projects inside `backfillProjectChannels`, which already runs on every
channel list. Counting stays `members.length`; `chat:moderate` readers who are not members are deliberately not counted
(spec §16.5).

The second defect is client-side: `startDirect` returns a channel without `memberCount`, and the header falls back to
the workspace member count. The response gains `memberCount` and the fallback becomes kind-aware.

The list gains recency ordering, unread counts and live row updates. Ordering is done in the aggregation
(`lastMessageAt` desc, never-used last, then name), not in the client, so it is stable across devices. The unread count
is one extra aggregate over the same channels, capped client-side. Live updates reuse the `message:new` socket event
the message list already handles; when the event is for another channel, the row's preview, count and position are
patched in place.

The `New direct message` control is rebuilt as a 44px row (CON-305 target size), with the teammate picker below it.

### 16.2 Components

| File | Action | Note |
|---|---|---|
| `server/src/controllers/projectController.ts` | modify | creator joins `members` at creation |
| `server/src/utils/projectMembers.ts` | modify | `ensureCreatorMember` + backfill helper |
| `server/src/controllers/chatChannelController.ts` | modify | ordering, unread counts, count by kind, `startDirect` returns `memberCount` |
| `client/src/features/chat/components/NewDirectMessage.tsx` | create | 44px row + labelled picker |
| `client/src/features/chat/components/ChannelList.tsx` | delete | The picker moved to `NewDirectMessage`; the chat panel never rendered this list. |
| `client/src/features/chat/components/ConversationSection.tsx` | modify | unread count pill, 44px rows |
| `client/src/features/chat/components/ChatHeader.tsx` | modify | avatar + name for `direct` |
| `client/src/features/chat/views/ChatView.tsx` | modify | live row patch, no workspace-count fallback |

### 16.3 API

| Method | Path | Change |
|---|---|---|
| GET | `/chat/conversations` | add `unreadCount`, sort by `lastMessageAt` |
| GET | `/channels` | unchanged: the unread count is computed only for the conversation list, so the sidebar keeps its existing read state |
| POST | `/chat/direct` | response gains `memberCount: 2` |

### 16.4 Data

No new collection. `Project.members` gains the creator; the backfill reuses the existing channel backfill pass, so no
migration command and no downtime.

### 16.5 Anti-redundancy

`ConversationSection` and `NewDirectMessage` are extended, not duplicated. Unread counting reuses `ChatRead` (the same
rows the badge uses). Live update reuses `useChatSocket`. No dependency is added.

### 16.6 Verification

Typecheck, lint, validator; a project created by the signed-in user reports 1 member; a DM opened from the picker
reports 2; a message in a background conversation moves its row; 320px viewport; keyboard through the picker.

## 17. Change set — search that behaves like an editor find widget

Implements US-032..US-035, FR-066..FR-071, NFR-026..NFR-028, EC-027..EC-029.

### 17.1 Approach

Search becomes a mode of the conversation, not a popup: `SearchBar` sits under the channel header, and
`SearchResults` takes the full height of the conversation body while a query is active. The two are siblings of the
message list, so nothing overlaps, clips or scrolls independently of the panel.

The keyboard model is the ARIA combobox/listbox pattern: the input keeps focus, `aria-activedescendant` points at the
selected row, and the arrow handler lives on the input. `lib/search.ts` owns the parts that must be pure and testable —
`nextIndex` (wrapping), `formatCounter` (`3 of 12`, `3 of 12+`), and `segmentSnippet` (highlight every occurrence
without HTML).

Paging is client-side on the cursor the search endpoint already returns; the server needs no change. The fetch is
triggered by the selection reaching the last loaded row rather than by scrolling, so keyboard navigation can page
without touching the scroll container. Every request carries a term marker, and a response whose marker is stale is
dropped (NFR-028).

Jumping reuses the loaded history: the message list gains stable `id="message-<id>"` anchors and a
`scrollToMessage(id)` prop plus a `highlightedMessageId`; `ChatView` closes search, fetches older pages (bounded) when
the id is not loaded, then scrolls and clears the highlight after a short delay. A message that is gone is reported in
the bar and search stays open.

The result list is bounded: rows are capped at 100 rendered at once with the selected row kept in view, so a broad term
cannot make the panel heavy (NFR-026).

### 17.2 Components

| File | Action | Note |
|---|---|---|
| `client/src/features/chat/components/SearchBar.tsx` | create | input, counter, previous/next, close; owns the key handler |
| `client/src/features/chat/components/SearchResults.tsx` | create | labelled listbox of option rows with author, date and highlighted snippet |
| `client/src/features/chat/lib/search.ts` | create | `nextIndex`, `formatCounter`, `segmentSnippet` |
| `client/src/features/chat/components/Panels.tsx` | modify | `SearchPanel` removed; `PinnedPanel` stays |
| `client/src/features/chat/views/ChatView.tsx` | modify | search state machine, paging, jump |
| `client/src/features/chat/components/MessageList.tsx` | modify | message anchors, `scrollToMessage`, temporary highlight |
| `client/src/features/chat/components/MessageItem.tsx` | modify | stable element id and highlight treatment |
| `client/src/features/chat/api.ts` | modify | `search(slug, channelId, term, cursor?)` |
| `client/src/features/chat/index.ts` | modify | exports |

### 17.3 API

| Method | Path | Change |
|---|---|---|
| GET | `/chat/:channelId/search` | no shape change; the client now sends the `before` cursor the endpoint already accepted, and the query excludes thread replies so every result is a message the list can open |

### 17.4 Anti-redundancy

`PinnedPanel` and the search endpoint are reused unchanged. The highlight segmentation reuses the approach already
used for mentions (`lib/mentions.ts`), and the scroll targets reuse the message list's existing container instead of
introducing a virtualiser. No dependency is added.

### 17.5 Verification

Typecheck, lint, validator; keyboard-only run through a term with matches on two pages; jump to a message in the
loaded page and to one behind the "load older" boundary; 320px viewport; `Esc` returns focus to the composer.
