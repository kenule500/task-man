---
title: Real-time chat
status: backlog
version: v1
created: 2026-10-17
updated: 2026-10-18
---
# real-time-chat — functional specification

| | |
|---|---|
| Feature | `real-time-chat` |
| Version | 1 |
| Status | Backlog — specification awaiting Gate 1 approval |
| Governance | `.sdrive/governance/real-time-chat/v1/{spec,plan,tasks,traceability}.json` |
| Branch | `feature/real-time-chat` (CON-607) |
| Source of the idea | Product mock shared by the maintainer (chat panel with `Team Chat`, `Project #1` and `General` channels in a `CHAT` sidebar group) |

## 1. Overview

### Problem statement

TaskMan models work — workspaces, projects, sprints, tasks, wiki pages — but has no place to *talk* about that work. Discussion therefore
leaves the product: a decision about a task ends up in a chat app or an email thread, unlinked from the record it affects. The pieces that a
conversation surface needs are already present but disconnected: workspace-scoped projects, a permission catalogue, an in-app notification
fan-out, and a change feed. What is missing is a message store, a channel model, a user-level presence concept, and a transport that delivers
messages as they are written rather than up to ten seconds later.

### Proposed solution

A Socket.IO-backed chat subsystem that reuses the existing workspace tenancy, RBAC and notification machinery:

- **Channels** are workspace-scoped and typed: one `team` channel and one `general` channel per workspace, plus one `project` channel per
  `Project`, created and archived automatically with it.
- **Messages** are stored in MongoDB, paginated by cursor, and broadcast to the sockets of members who may read the channel.
- **Presence** becomes user-level (online / away / offline) over socket connection state, alongside the existing task-scoped `Presence` rows.
- **Transport unification**: Socket.IO becomes the primary real-time transport for chat **and** for the existing task/project/wiki change feed,
  with the 10-second cursor poll retained as the fallback path for deployments that cannot hold a socket open (see RISK-001).

The client ships one reusable feature module, `client/src/features/chat`, whose public entry is `@/features/chat` (CON-110), plus a `CHAT` group
in the sidebar between `Main Menu` and `General`.

### Target audience

Workspace members (Developer, Team Member, Scrum Master), Product Owners, and workspace administrators across the five seeded system roles in
`server/src/config/permissions.ts`.

### Assumptions

- `assumption: true` — The mock shows `Project #1` as a channel name. This spec reads it as *the channel belonging to project "Project #1"*, so
  the channel name follows the project name, not the literal string.
- `assumption: true` — The mock shows `Online` and a member count in the chat header. This spec implements presence at workspace level (who is
  connected) and read state per channel; it does not infer the member count from presence.
- `assumption: true` — The deployment target that can host a long-lived socket is the Render service in `render.yaml`
  (`node server/dist/server.js`). The Vercel entry `api/index.ts` is a serverless function (`maxDuration: 30`) and cannot host one.
- `assumption: true` — Chat volume is assumed to be team-scale (hundreds of messages per channel per day), not community-scale. Message
  retention and index choices follow from that.
- `assumption: true` — No message content needs end-to-end encryption; content is protected in transit and at rest by the existing
  HTTPS/HSTS and database guarantees (CON-520).

### Out of scope

- Voice and video calls, screen sharing, and huddles.
- Bot or webhook posting into channels (the existing outbound `webhooks` feature is unrelated and unchanged).
- Cross-workspace or federated chat, and any channel readable by more than one workspace.
- Replacing the existing task-scoped "Also viewing" presence (`presenceModel.ts`, `PresenceBar.tsx`); chat presence is additive.
- End-to-end encryption, message translation, and AI summarisation.
- Push notification delivery for chat *messages* beyond reusing the existing web-push path; new push copy is limited to mentions and DMs.

## 2. User stories and acceptance criteria

### US-001 — Channels appear in a dedicated sidebar group
*As a* workspace member *I want* the channels I can read listed in a `CHAT` group next to the main navigation, *so that* I can reach a
conversation in one click.

- **AC-001** The sidebar renders a `CHAT` group between `Main Menu` and `General` listing **only** the `team` and `general` channels, and each item
  navigates to `/{workspaceSlug}/chat/{channelId}`. Project channels are not main-menu items; they are listed on the chat screen (§8, AC-042).
- **AC-002** Only channels the requester may read are listed: a member without `chat:read` sees no `CHAT` group at all, and a project channel is
  visible only to members of that project plus holders of `chat:moderate` (§8, FR-037 / AC-038).
- **AC-003** Each workspace has exactly one `team` channel and one `general` channel; their names are fixed and not editable through any endpoint.
- **AC-034** The two default channels carry distinct, fixed purposes that the API returns and the client shows under the channel title: `general` is the workspace-wide space for announcements, broad discussion and the watercooler; `team` is the narrower space for internal team coordination, workflows, blockers and check-ins. Their purpose is descriptive only — both remain writable by any caller holding `chat:write`, because this data model has no team or department entity to scope an audience to.

### US-002 — Project channels follow the project lifecycle
*As a* workspace member *I want* a project's channel to exist while the project exists and to stop accepting messages once the project is gone,
*so that* project conversation is always available and never orphaned.

- **AC-004** Creating a project through `POST /api/workspaces/:slug/projects` creates its `project` channel in the same request, named after the
  project and carrying a reference to it; a project whose channel already exists does not produce a second channel.
- **AC-005** Deleting a project through `DELETE /api/workspaces/:slug/projects/:id` archives its channel and its messages, exactly as
  `deleteProject` already cascades sprints and wiki pages; the channel becomes read-only, keeps its history, leaves main-menu navigation, and
  stays in the chat screen's team-channel list for auditing (§8, AC-043 / EC-013).
- **AC-006** Projects that exist before this feature is deployed gain a channel on the next `GET /api/workspaces/:slug/channels`, through a
  backfill that mirrors `syncProjectsFromTasks` and tolerates a concurrent duplicate insert.

### US-003 — Send and receive messages live
*As a* channel member *I want* a message I send to appear for everyone in the channel immediately, *so that* conversation feels synchronous.

- **AC-007** A message sent over the socket is persisted before it is acknowledged to the sender and is delivered to every other connected member
  of that channel; the sender's own message is not echoed back to them twice.
- **AC-008** A member without `chat:write`, or one who is not a member of the workspace, is refused both by the socket event and by the REST
  fallback, and no message row is written.
- **AC-009** A message references its workspace, channel, author and optional parent message, and stores the channel's `lastMessageAt` so that
  channel ordering does not require scanning messages.

### US-004 — Read history without gaps or duplicates
*As a* channel member *I want* older messages loaded as I scroll up, *so that* I can catch up without the page becoming slow.

- **AC-010** `GET /api/workspaces/:slug/chat/:channelId/messages` returns at most 50 messages older than the supplied cursor, newest first per
  page, and paging with the returned cursor yields no duplicates and no skipped messages while new ones are arriving.
- **AC-011** The message list loads the newest page on open, shows a loading state while paging, and preserves scroll position when older
  messages are prepended.

### US-005 — Reply in a thread
*As a* channel member *I want* to reply to a specific message in a side thread, *so that* parallel discussions do not interleave.

- **AC-012** Replying to a message stores the reply with a parent reference; the parent shows a reply count and the last replier.
- **AC-013** The thread panel lists that parent's replies in order and accepts new replies without navigating away from the channel.

### US-006 — Mention a teammate
*As a* channel member *I want* to @mention a teammate, *so that* they are pulled into the conversation.

- **AC-014** Typing `@` offers the members of the workspace and inserts a mention that is stored as a reference to the mentioned user, not only
  as text.
- **AC-015** A mentioned user receives an in-app notification through the existing `notify` path, and the notification opens the message.

### US-007 — React to a message
*As a* channel member *I want* to add an emoji reaction, *so that* I can acknowledge something without writing a reply.

- **AC-016** Adding a reaction I already gave removes it, and the resulting state is broadcast so all clients agree.
- **AC-017** Reactions are aggregated per emoji with a count and the list of reactors, and a user has at most one reaction of a given emoji per
  message.

### US-008 — Edit and delete my own messages
*As a* message author *I want* to correct or withdraw my message, *so that* the record stays accurate.

- **AC-018** A message author can edit their own message; the message keeps its original timestamp, gains an `editedAt`, and shows as edited.
- **AC-019** A message author can delete their own message; the row is soft-deleted, its content and attachments are cleared, and the channel
  shows a tombstone instead of the text.

### US-009 — Share a file
*As a* channel member *I want* to attach a file to a message, *so that* I can share a screenshot or document in context.

- **AC-020** Attachments use the existing upload pipeline and GridFS helpers, appear on the message with name, size and type, and are downloadable
  only by members who may read that channel.
- **AC-021** An upload that exceeds the configured size limit or has a disallowed type is rejected with a validation error and no message is
  created.

### US-010 — See who is typing and what I have not read
*As a* channel member *I want* a typing indicator and an unread marker, *so that* I know when to wait and what I missed.

- **AC-022** While another member is composing, the channel shows a typing indicator naming them; it disappears after a short idle period or when
  the message arrives.
- **AC-023** The last-read position is stored per user and channel, the sidebar shows an unread badge for channels with newer messages, and opening
  a channel clears it.

### US-011 — Find and pin messages
*As a* channel member *I want* to search a channel's history and pin important messages, *so that* decisions are not lost in scrollback.

- **AC-024** Search within a channel matches message text case-insensitively for the current workspace only, returns paginated results, and never
  returns messages from a channel the requester cannot read.
- **AC-025** A member with `chat:write` can pin and unpin a message; pinned messages are listed for the channel in pinned order.

### US-012 — Direct messages
*As a* workspace member *I want* a private conversation with one teammate, *so that* I can talk without an audience.

- **AC-026** Starting a direct message with a member creates a `direct` channel between exactly those two users, or reuses the existing one, and
  the same pair never accumulates duplicate direct channels.
- **AC-027** A direct channel's messages are readable only by its two participants; any other member, including an administrator, receives 404
  rather than 403 so the channel's existence is not disclosed.

### US-013 — Moderate and retain
*As a* workspace administrator *I want* to remove abusive messages and bound retention, *so that* the workspace stays usable and compliant.

- **AC-028** A member with `chat:moderate` can delete any message in the workspace; the action is recorded in the activity feed with actor and
  channel.
- **AC-029** Messages older than the configured retention window are removed by a TTL index or a scheduled purge, and deleted or purged messages
  never reappear in search.

### US-014 — Presence
*As a* channel member *I want* to see whether a teammate is online, *so that* I know whether to expect a reply.

- **AC-030** A connected member shows as online; closing the last connection marks them offline after a short grace period, and multiple tabs or
  devices for one user count as one presence.
- **AC-031** Presence reflects a disconnect even when the socket closes uncleanly, because a periodic refresh also ages stale presence out.

### US-015 — One real-time transport, with a safe fallback
*As a* maintainer *I want* task and project updates to arrive over the same socket as chat, *so that* the product has one real-time mechanism
instead of two.

- **AC-032** Task, project, sprint and wiki changes reach connected clients over the socket, and the existing `useLiveChanges` behaviour —
  permission-filtered, cursor-based, no event lost across a reconnect — is preserved.
- **AC-033** When a socket cannot be established or drops, the client falls back to the existing cursor poll within one interval, and the UI
  reports the transport state rather than silently going stale.

## 3. Requirements

### Functional requirements

- **FR-001** The system MUST model channels as workspace-scoped documents of kind `team`, `general`, `project` or `direct`, with a unique
  constraint on `(workspace, kind, nameKey)` for the first three kinds. *(AC-001, AC-003)*
- **FR-002** The system MUST seed one `team` and one `general` channel per workspace and MUST NOT allow either to be renamed or deleted.
  *(AC-003)*
- **FR-034** The system MUST give both default channels a fixed description stating its purpose, MUST return that description
  to the client, and MUST refresh it on every seed pass so existing workspaces pick it up. The description is informational and
  MUST NOT restrict who may read or write either channel. *(AC-034)*
- **FR-003** The system MUST resolve channel visibility from the caller's permissions, the channel kind and, for a `project` channel, the caller's
  membership of that project — hiding a project channel from non-members while permitting holders of `chat:moderate` (§8, FR-037). *(AC-002)*
- **FR-004** The system MUST create a project channel inside the project creation flow and MUST reuse an existing channel for the same project
  instead of creating a duplicate. *(AC-004)*
- **FR-005** The system MUST archive a project's channel and messages when that project is deleted, must leave the history readable, MUST keep the
  channel in the chat screen's team-channel list as read-only for auditing, and MUST NOT delete message rows as part of the project cascade.
  *(AC-005)*
- **FR-006** The system MUST backfill channels for pre-existing projects on channel list, tolerating a concurrent duplicate-key race.
  *(AC-006)*
- **FR-007** The system MUST persist a message before acknowledging it to its author and MUST broadcast only after a successful write.
  *(AC-007)*
- **FR-008** The system MUST authorize every socket event and every REST fallback with the same permission and workspace checks used by the HTTP
  API. *(AC-008)*
- **FR-009** The system MUST store `lastMessageAt` and `lastMessageAuthor` on the channel and MUST order the channel list by them.
  *(AC-009)*
- **FR-010** The system MUST expose cursor-paginated message history with a page size of at most 50 and MUST provide a stable cursor that
  tolerates concurrent inserts. *(AC-010)*
- **FR-011** The system MUST preserve scroll position and show explicit loading state when older pages are prepended. *(AC-011)*
- **FR-012** The system MUST store threaded replies with a parent reference and MUST expose the reply count and last replier on the parent.
  *(AC-012)*
- **FR-013** The system MUST render and accept thread replies in a side panel without navigating away from the channel. *(AC-013)*
- **FR-014** The system MUST store mentions as user references resolved against workspace members, reusing the existing mention resolution.
  *(AC-014)*
- **FR-015** The system MUST notify mentioned users through the existing notification infrastructure rather than a parallel mechanism.
  *(AC-015)*
- **FR-016** The system MUST treat a reaction as a toggle keyed by `(message, user, emoji)` so that a user holds at most one of each emoji per
  message. *(AC-016, AC-017)*
- **FR-017** The system MUST allow a message author to edit their own message, MUST record `editedAt`, and MUST refuse edits by other users.
  *(AC-018)*
- **FR-018** The system MUST soft-delete a message on author or moderator deletion, clearing content and attachment references while retaining the
  row for ordering and reply integrity. *(AC-019)*
- **FR-019** The system MUST store attachments through the existing GridFS helpers and MUST verify channel read access before serving them.
  *(AC-020)*
- **FR-020** The system MUST validate attachment size and content type before creating the message and MUST reject invalid uploads.
  *(AC-021)*
- **FR-021** The system MUST broadcast typing state as an ephemeral event that is never persisted. *(AC-022)*
- **FR-022** The system MUST persist a per-user, per-channel last-read position and MUST derive unread badges from it. *(AC-023)*
- **FR-023** The system MUST provide channel-scoped search that is case-insensitive, workspace-bounded, paginated, and permission-filtered.
  *(AC-024)*
- **FR-024** The system MUST allow pinning and unpinning by callers with `chat:write` and MUST expose a pinned-message list per channel.
  *(AC-025)*
- **FR-025** The system MUST model direct channels as `direct` kind with exactly two participants and MUST reuse an existing pair's channel.
  *(AC-026)*
- **FR-026** The system MUST answer 404 for a direct channel the caller does not participate in, never 403. *(AC-027)*
- **FR-027** The system MUST allow a caller with `chat:moderate` to delete any workspace message and MUST record that in the activity feed.
  *(AC-028)*
- **FR-028** The system MUST purge messages beyond the configured retention window and MUST exclude purged content from search.
  *(AC-029)*
- **FR-029** The system MUST track user-level presence from socket connection state, counting one user once regardless of tab or device count.
  *(AC-030)*
- **FR-030** The system MUST age out presence that did not refresh in time, so an unclean disconnect does not leave a user shown as online.
  *(AC-031)*
- **FR-031** The system MUST deliver activity-feed changes over the socket while preserving per-permission filtering and cursor replay across
  reconnects. *(AC-032)*
- **FR-032** The system MUST fall back to the existing cursor poll when the socket is unavailable and MUST surface the transport state to the
  user. *(AC-033)*
- **FR-033** The system MUST register a `chat` permission area with `chat:read`, `chat:write`, `chat:moderate`, `chat:dm` and MUST wire them into
  the seeded system roles without widening existing roles. *(AC-002, AC-008, AC-028)*

### Non-functional requirements

- **NFR-001** Message delivery from write to connected recipients MUST be under 500 ms at p95 on a local network and under 1 s over the public
  internet. *(AC-007)*
- **NFR-002** Message history queries MUST use an index that satisfies the cursor predicate, so paging cost does not grow with channel history.
  *(AC-010)*
- **NFR-003** The chat UI MUST be operable by keyboard, MUST expose an accessible name for every control, and MUST announce incoming messages to
  assistive technology through a polite live region. *(AC-001, AC-007)*
- **NFR-004** The chat UI MUST be mobile-first and MUST remain usable in the existing mobile tab bar layout. *(AC-001)*
- **NFR-005** A socket connection MUST be authenticated with the existing JWT and MUST NOT be accepted for a session that has been revoked.
  *(AC-008)*
- **NFR-006** *(CON-511 Authentication)* Every socket handshake MUST be authenticated with a JWT bearer token validated by the existing auth
  middleware path, and a revoked session MUST terminate its open sockets. *(AC-008)*
- **NFR-007** *(CON-512 Authorization)* Every chat route MUST run `protect` then `requirePermission('chat:<action>')`, and every query MUST filter
  by `req.workspace._id`. *(AC-002, AC-008)*
- **NFR-008** *(CON-513 Security headers)* Chat HTTP responses MUST inherit the application-wide Helmet middleware; the socket upgrade MUST NOT
  bypass it. *(AC-008)*
- **NFR-009** *(CON-514 Rate limiting)* Chat endpoints MUST be covered by an explicit rate-limit policy, and socket events MUST be throttled per
  connection so a single client cannot flood a channel. *(AC-008)*
- **NFR-010** *(CON-515 Input validation)* Every chat route MUST declare an `express-validator` chain and every socket event MUST validate its
  payload before use. *(AC-021)*
- **NFR-011** *(CON-516 NoSQL/Injection)* Chat queries MUST use cast ObjectIds and validated strings, and MUST NOT interpolate client input into
  query operators. *(AC-024)*
- **NFR-012** *(CON-517 XSS)* Message content MUST be rendered as text or through the existing `react-markdown` path and MUST NOT use
  `dangerouslySetInnerHTML`. *(AC-007)*
- **NFR-013** *(CON-519 Environment security)* The socket origin allow-list MUST come from validated configuration in `config/env.ts`, not from
  a literal in the socket setup. *(AC-033)*
- **NFR-014** *(CON-520 HTTPS/HSTS)* In production the socket MUST be served over TLS, and the client MUST be configured against an `wss:` origin.
  *(AC-033)*
- **NFR-015** A client that reconnects after a drop MUST be able to recover missed activity-feed events without gaps or duplicates, using the
  existing cursor. *(AC-032, AC-033)*
- **NFR-016** Message storage MUST be bounded by a retention policy so that history growth cannot exhaust the database. *(AC-029)*

### Security baseline

Controls are taken from `.sdrive/constitution.md` §5. Required controls are expanded above as NFR-006 … NFR-014 and will be expanded into
dependencies and tasks at Gate 2.

| Control | Status | Treatment in this feature |
|---------|--------|---------------------------|
| CON-511 Authentication | REQUIRED | Expanded as NFR-006. Socket handshake authenticated; revoked sessions drop their sockets. |
| CON-512 Authorization | REQUIRED | Expanded as NFR-007. New `chat:*` permission area, workspace-scoped queries. |
| CON-513 Security Headers | REQUIRED | Expanded as NFR-008. Inherited from `app.use(helmet())`. |
| CON-514 Rate Limiting | REQUIRED | Expanded as NFR-009. REST limits via `express-rate-limit`; per-connection event throttle added. |
| CON-515 Input Validation | REQUIRED | Expanded as NFR-010. Validator chains plus socket payload validation. |
| CON-516 NoSQL / Injection | REQUIRED | Expanded as NFR-011. Cast ObjectIds, no interpolated operators. |
| CON-517 XSS Protection | REQUIRED | Expanded as NFR-012. Text rendering, no raw HTML injection. |
| CON-518 CSRF Protection | NOT APPLICABLE | Unchanged from the baseline: authentication is header-based, there are no cookies, and CORS is an origin allow-list. The socket handshake carries the same bearer token, so there is still no ambient credential to forge. |
| CON-519 Environment Security | REQUIRED | Expanded as NFR-013. Socket origins from validated config. |
| CON-520 HTTPS / HSTS | REQUIRED | Expanded as NFR-014. `wss:` in production. |

## 4. UI/UX and data requirements

### UI/UX

- A `CHAT` group in `client/src/components/Sidebar.tsx` between the existing `Main Menu` and `General` groups, whose items come from the same
  permission-filtered source as the other nav items.
- Chat routes live under the existing `WorkspaceLayout`: `/{workspaceSlug}/chat` (last channel) and `/{workspaceSlug}/chat/:channelId`.
- The channel view shows a header (channel name, presence summary, member count), a virtualised or windowed message list, a composer with
  attachment and emoji entry points, a right-hand thread panel, and a pinned-messages panel.
- Components come from `client/src/components/ui/` and `client/src/components/ds/` (CON-302); theme changes go through the `@theme` tokens in
  `client/src/index.css` (CON-303).
- Empty, loading, error and offline states are explicit: no channel selected, no messages yet, history failed to load, socket disconnected.

### Data

| Entity | Key fields | Notes |
|---|---|---|
| `Channel` | `workspace`, `kind` (`team`/`general`/`project`/`direct`), `name`, `nameKey`, `project?`, `participants[]`, `archived`, `lastMessageAt`, `lastMessageAuthor` | One `team` and one `general` per workspace; `project` and `direct` kinds carry a reference rather than a lookup by name |
| `Message` | `workspace`, `channel`, `author`, `body`, `parent?`, `mentions[]`, `attachments[]`, `editedAt`, `deletedAt`, `pinnedAt`, `createdAt` | `deletedAt` set means content is cleared and a tombstone is rendered |
| `Reaction` | `workspace`, `message`, `user`, `emoji` | Unique per `(message, user, emoji)` |
| `ChannelRead` | `workspace`, `channel`, `user`, `lastReadAt`, `lastReadMessage` | Drives unread badges |
| `ChatPresence` | `user`, `workspace`, `connections`, `seenAt` | TTL-bounded so unclean disconnects age out |

## 5. Edge cases and error states

- **EC-001** Two members create a direct channel with each other at the same moment → the unique constraint resolves it and both clients receive
  the same channel.
- **EC-002** A project is deleted while a member has its channel open → the channel view becomes read-only with an explicit "project deleted"
  banner instead of failing to send silently.
- **EC-003** A message is edited or deleted while another member is offline → the next history load reflects the current state, and no client
  shows the stale body as live.
- **EC-004** A user is removed from the workspace while holding an open socket → their sockets are terminated and subsequent events are refused.
- **EC-005** The socket connects but the user has no `chat:read` → the client shows no `CHAT` group and issues no chat requests.
- **EC-006** The server restarts mid-conversation → clients reconnect, replay from their cursor, and no message the user sent is lost or duplicated.
- **EC-007** A message body is empty after trimming → the send is refused client-side and by the validator.
- **EC-008** An attachment upload succeeds but message creation fails → the orphaned GridFS file is removed rather than leaked.
- **EC-009** Search runs while messages are being purged → results contain no purged rows and no duplicates across pages.
- **EC-010** A very long message exceeds the body limit → refused with a validation error naming the limit.
- **EC-011** Presence refresh fails repeatedly → the member is shown as offline rather than indefinitely online.
- **EC-012** A member opens the same channel in two tabs → read state is shared and the unread badge clears in both.

## 6. Dependencies and risks

### Dependencies

| Name | Type | Notes |
|---|---|---|
| `socket.io` | library | New server dependency. Attached to the existing HTTP server in `server/src/server.ts`. Not available on the serverless Vercel entry. |
| `socket.io-client` | library | New client dependency. |
| MongoDB / Mongoose | internal | Message, channel, reaction, read-state and presence collections. |
| Express 5 + `express-validator` | internal | REST fallback and validation for every chat endpoint. |
| Existing RBAC | internal | `permissions.ts`, `requirePermission`, `utils/roleAccess.ts`. |
| Existing notifications | internal | `utils/notify.ts`, `webPush.ts` for mention and DM notifications. |
| Existing uploads | internal | `middleware/uploadMiddleware.ts`, `utils/gridfs.ts` for attachments. |
| Existing change feed | internal | `utils/changeCursor.ts`, `controllers/changeController.ts` retained as the fallback path. |

No external research was required for this specification. The in-repo facts above are the basis; where a library detail was uncertain it is
marked as an assumption rather than stated as fact.

### Risks

- **RISK-001** The Vercel API entry (`api/index.ts`) is a serverless function and cannot hold a WebSocket open, so socket delivery is
  unavailable on that deployment. Chat and live updates would silently degrade. *Mitigation:* keep the cursor poll as a first-class fallback
  (FR-032), report transport state in the UI (AC-033), and treat Vercel as polling-only until hosting changes.
- **RISK-002** Moving the activity feed from pull to push changes where permission filtering happens; a mistake could deliver audit or
  project-change entries to a caller who may not see them. *Mitigation:* filter per socket audience explicitly (FR-031), reuse
  `hiddenActions(permissions)`, and add a regression test per hidden action group.
- **RISK-003** Sockets lose events while disconnected, so a pure push design can silently drop changes. *Mitigation:* retain cursor replay on
  reconnect (NFR-015) rather than assuming the socket is reliable.
- **RISK-004** The live module is covered by eight existing test files that encode current merge and poller behaviour; rewriting them alongside a
  new chat feature makes a bisect ambiguous. *Mitigation:* land the transport change as its own reviewable commit sequence before chat UI work,
  and keep the poller tests in place for the fallback path.
- **RISK-005** Rendering user-authored message text is the highest XSS-risk surface added by this feature. *Mitigation:* render as text or via
  the existing `react-markdown` path, add no `dangerouslySetInnerHTML`, and cover it in `/sdrive:secure`.
- **RISK-006** The Render service is on the free plan, which suspends an idle instance; sockets die on suspend. *Mitigation:* document the
  limitation, rely on reconnect plus cursor replay, and do not treat socket availability as guaranteed.

## 7. Anti-redundancy check

Existing assets were searched before planning anything new. Decisions:

| Existing asset | Decision | Reason |
|---|---|---|
| `server/src/models/projectModel.ts` | `reuse` | Project channels reference this model; no new project concept. |
| `server/src/controllers/projectController.ts` (`createProject`, `deleteProject`) | `modify` | Channel creation and archival hook into the existing flows and cascade. |
| `server/src/models/presenceModel.ts` | `reuse` (unchanged) | Task-scoped "also viewing" presence stays as-is; chat presence is a separate user-level concern. |
| `server/src/utils/notify.ts`, `webPush.ts` | `reuse` | Mention and DM notifications extend the existing fan-out. |
| `server/src/middleware/uploadMiddleware.ts`, `utils/gridfs.ts` | `reuse` | Attachments use the established upload and storage path. |
| `server/src/utils/changeCursor.ts`, `controllers/changeController.ts` | `modify` | Retained as the fallback and as the replay source; push is layered on top. |
| `client/src/features/live/**` | `modify` | Transport changes; merge and cache semantics retained. |
| `client/src/features/notifications/**` | `reuse` | Chat notifications surface through the existing bell and feed. |
| `client/src/components/Sidebar.tsx` | `modify` | New `CHAT` group added to the existing nav sources. |
| `server/src/config/permissions.ts` | `modify` | New `chat:*` area registered; existing roles extended explicitly. |
| Chat channels, messages, reactions, read state, chat presence | `create` | Nothing comparable exists; no duplicate of an existing model. |

## 8. Change set — team channels scoped to project members

> Added by `/sdrive:update-propose` on 2026-10-17. This section **appends** to the specification above; no existing ID was
> renumbered, deleted or reworded. Where a new requirement supersedes an earlier one, see §8.5.

### 8.1 Context

The original design treated `team`, `general` and `project` channels alike: all three appeared in one sidebar group and all
were visible to anyone holding `projects:read`. That made the two default channels indistinguishable and left project
conversation readable by the whole workspace. This change set gives the three kinds distinct roles:

| Channel | Audience | Where it appears |
|---|---|---|
| `general` | Every member of the workspace | Main menu |
| `team` | Every member of the workspace | Main menu |
| `project` (a "Team channel") | Only the members assigned to that project, plus Product Owners | The chat screen's team-channel list only |

### 8.2 User stories and acceptance criteria

#### US-016 — The Team screen becomes the Members screen
*As a* workspace member *I want* the "Team" navigation item to be called "Members" at an address that says what it is, *so that*
the label matches the screen and existing links keep working.

- **AC-035** The main navigation item is labelled `Members` and routes to `/{workspaceSlug}/members`; the previous
  `/{workspaceSlug}/team` path redirects to it so bookmarks and existing links still resolve.
- **AC-036** Any in-app link that previously pointed at `/{workspaceSlug}/team` points at `/{workspaceSlug}/members` after the
  change, with no dead links left behind.

#### US-017 — A team channel belongs to its project's members
*As a* project member *I want* a channel that only the people on my project can see, *so that* internal coordination stays out
of the workspace-wide conversation.

- **AC-037** Each project owns exactly one channel of kind `project`. It is created in the same request that creates the
  project, and creating it twice does not produce a duplicate.
- **AC-038** A project's `members` list is the sole source of its channel's audience. A caller who is not in that list
  receives `404` for the channel, never `403`, so the channel's existence is not disclosed.
- **AC-039** A caller holding `chat:moderate` — the capability the Product Owner role carries — may read and post in every
  team channel in the workspace, whether or not they are assigned to the project.
- **AC-040** Assigning a user to a task in a project adds them to that project's `members`, so they can read and post in its channel without any
  separate invitation step; they lose access only when removed from the workspace.

#### US-018 — Team channels listed like a group-chat inbox
*As a* member *I want* my project conversations in one list beside the conversation, *so that* I can move between projects the
way I would in a group messenger.

- **AC-041** The main-menu chat entries are only `Team Chat` (kind `team`) and `General` (kind `general`). Project channels
  are not main-menu navigation items.
- **AC-042** The chat screen shows a team-channel list beside the conversation, each row carrying the channel's avatar, name,
  a last-message preview and its unread state, and selecting a row opens that channel.
- **AC-043** The team-channel list contains only channels the caller may read, and when a caller may read none the list shows
  an explicit empty state rather than disappearing without explanation.

#### US-019 — The Product Owner can rename and re-picture a team channel
*As a* Product Owner *I want* to rename a team channel and give it an avatar, *so that* it reads like a group conversation
rather than a database record.

- **AC-044** A caller holding `chat:moderate` may rename a team channel and set its avatar. The new name and avatar appear in
  the list for every member and are broadcast to open channel views.
- **AC-045** A caller without `chat:moderate` receives `403` for both actions, and no name or avatar is changed.
- **AC-046** A channel name falls back to the project name when no override has been set, and an override survives a project
  rename rather than being silently reset.
- **AC-047** A channel avatar is an image uploaded through the existing `uploadMiddleware` size and content-type validation,
  stored in GridFS, and served only to callers who may read that channel. A rejected upload leaves the previous avatar intact.

### 8.3 Functional requirements

- **FR-035** The system MUST maintain `Project.members` as a **materialised** audience that is populated automatically: assigning a user to a task
  belonging to that project MUST add them to the project's `members`, and they MUST gain access to its channel with no separate invitation step.
  Membership MUST NOT be revoked automatically when their tasks change, so a member is never silently cut out of an audited conversation. The
  materialised list is what authorization queries filter on, so access never requires a per-request task lookup. *(AC-038, AC-040)*
- **FR-044** The system MUST remove a user from every project's `members` when they leave the workspace, so a departed member cannot retain channel
  access. *(AC-040)*
- **FR-036** The system MUST create one `project` channel inside project creation and MUST reuse an existing channel for the
  same project instead of inserting a duplicate. *(AC-037)*
- **FR-037** The system MUST authorize access to a `project` channel by the caller's presence in that project's `members` list,
  MUST answer `404` for a non-member rather than `403`, and MUST allow any `chat:moderate` holder full access. *(AC-038, AC-039,
  AC-040)*
- **FR-038** The system MUST restrict the main-menu chat entries to kinds `team` and `general` and MUST expose `project`
  channels only through the chat screen's team-channel list. *(AC-041, AC-042)*
- **FR-039** The system MUST return, for each team channel, the avatar, the display name, the last message preview and the
  caller's unread state, so the list renders in one request. *(AC-042)*
- **FR-040** The system MUST let a `chat:moderate` holder rename a team channel and replace its avatar, MUST broadcast both
  changes, and MUST refuse them with `403` for every other caller. *(AC-044, AC-045)*
- **FR-041** The system MUST store a per-channel name override and avatar separately from the project, MUST fall back to the
  project name when no override exists, and MUST keep an override when the project is renamed. *(AC-046)*
- **FR-042** The system MUST serve a channel avatar only to callers who may read that channel, using the existing GridFS
  pipeline and upload validation. *(AC-047)*
- **FR-043** The system MUST label the team directory `Members`, route it at `/{workspaceSlug}/members`, and redirect the
  previous `/{workspaceSlug}/team` path. *(AC-035, AC-036)*

### 8.4 Non-functional requirements

- **NFR-017** Team-channel authorization MUST be part of the database query filter, not a post-query check, so a non-member
  cannot receive another project's messages even if a broadcast is misrouted. *(AC-038)*
- **NFR-018** Channel avatar uploads MUST reuse `server/src/middleware/uploadMiddleware.ts` and `utils/gridfs.ts`; no second
  upload surface MAY be introduced, and the existing size and content-type limits MUST apply unchanged. *(AC-047)*
- **NFR-019** The team-channel list MUST resolve in a single request per open of the chat screen, without a query per channel.
  *(AC-042)*

### 8.5 Amended requirements

Per the maintainer's direction, the four statements this change set narrows were **rewritten in place** rather than left
contradicted, because a specification the test agent cannot satisfy twice is worse than a logged edit. Each rewrite is
minimal — only the clause that changed — and is recorded here so the original intent stays traceable:

| ID | What changed | Why |
|---|---|---|
| AC-001 | Dropped "then project channels by project name" from the sidebar listing. | Project channels leave main-menu navigation; they are listed on the chat screen instead (AC-042). |
| AC-002 | Replaced "hidden from a member without `projects:read`" with visibility by project membership plus `chat:moderate`. | `projects:read` was a workspace-wide gate; the audience is now per project (FR-037). |
| AC-005 | Replaced "removed from the sidebar" with "leaves main-menu navigation, stays in the team-channel list for auditing". | Archived channels are kept for audit rather than disappearing (AC-043, EC-013). |
| FR-003 | Replaced the `projects:read` gate with project membership, retaining the `chat:moderate` override. | Same reason as AC-002. |

Still valid and unchanged: AC-003 (fixed default channel names), AC-004 / FR-004 (channel created with the project), FR-006
(backfill), AC-034 / FR-034 (the two default channels' stated purposes).

### 8.6 Membership model

`Project.members` is created and maintained **automatically**; nothing in the UI asks anyone to add a person to a project.

1. Assigning a user to a task adds that user to the task's project's `members` (additive, idempotent).
2. Removing a user from a task does **not** remove them from `members`. Automatic revocation would cut someone out of a
   conversation mid-thread and lose their place in the audit history; explicit removal, if it is ever wanted, becomes its own
   change.
3. Leaving the workspace removes the user from every project's `members` (FR-044).
4. A project with no assigned tasks has an empty `members`, so its channel is visible only to `chat:moderate` holders (EC-015).
5. Authorization filters on the materialised list, never on a task subquery, so a channel read stays a single indexed query
   (NFR-017).

### 8.6 Edge cases and error states

- **EC-013** A project is deleted while members have its channel open → the channel becomes read-only for everyone, shows the
  archived banner, and stays in the team-channel list for auditing.
- **EC-014** A member is removed from a project while holding the channel open → their next send is refused with `404` and the
  channel leaves their list on the next load.
- **EC-015** A project has no members → its channel still exists and is visible only to `chat:moderate` holders; it is never
  deleted for being empty.
- **EC-016** A `chat:moderate` holder renames a team channel whose project is then deleted → the override is retained on the
  archived channel so audit history keeps the name it was known by.
- **EC-017** A channel avatar upload is rejected → the previous avatar is kept and an error is shown; the channel is not left
  without an avatar.


## 14. Change set — conversation ergonomics

> Added by `/sdrive:update-propose` on 2026-10-17. Appends only; no existing ID renumbered or deleted.

### 14.1 User stories and acceptance criteria

#### US-020 — A conversation reads like a group chat
*As a* channel member *I want* my own messages on one side and everyone else's on the other, *so that* I can follow who said
what at a glance.

- **AC-048** The caller's own messages render right-aligned in a tinted bubble without their own avatar; every other member's
  messages render left-aligned with their avatar and name. Each bubble carries its time, the edited marker and the pinned mark.

#### US-021 — Mentions behave like a chat app
*As a* channel member *I want* my own name kept out of the mention list and mentions highlighted in the message, *so that*
referencing people is quick and I can see who was addressed.

- **AC-049** The mention suggestion list never contains the signed-in user, because mentioning yourself has no effect.
- **AC-052** A mention that matches a member's name renders highlighted inside the message body. A token that does not match a
  known member, such as part of an email address, renders as ordinary text.

#### US-022 — Send several attachments at once
*As a* channel member *I want* to attach more than one file to a message, *so that* I can share a set of screenshots together.

- **AC-053** The attachment picker accepts several files in one selection. Each uploads independently, so one rejected file
  does not discard the others, and every accepted file is attached to the message that is sent.
- **AC-054** A message's attachments are stored with its name, size and type and are downloadable only by callers who may read
  the channel.

#### US-023 — See at a glance where the new messages are
*As a* channel member *I want* an unread indicator on the default channels and the team list, *so that* I know which
conversation to open.

- **AC-050** The chat screen lists `New direct message` first, then the member's direct conversations, then the team channels.
- **AC-055** `Team Chat` and `General` in the main menu show an unread indicator while they hold messages newer than the
  member's last visit, cleared when the channel is opened. The state comes from the server, so it survives across devices.

#### US-024 — Member counts tell the truth
*As a* channel member *I want* the member count to match the channel I am in, *so that* I know who can see the conversation.

- **AC-051** The count shown for a channel equals the number of people who can read it: workspace members for `Team Chat` and
  `General`, the project's members for a team channel, and two for a direct conversation.

### 14.2 Functional requirements

- **FR-045** The system MUST render the caller's own messages right-aligned without their own avatar and other members'
  messages left-aligned with avatar and name. *(AC-048)*
- **FR-046** The system MUST exclude the signed-in user from the mention suggestion list. *(AC-049)*
- **FR-047** The system MUST highlight a mention token in the message body when it matches a known member name, and MUST
  render a non-matching token as text. *(AC-052)*
- **FR-048** The system MUST accept multiple attachment ids per message, MUST resolve each to its stored name, size and type,
  and MUST refuse an id that was not uploaded to that channel. *(AC-053, AC-054)*
- **FR-049** The system MUST order the chat side panel as `New direct message`, then direct conversations, then team channels.
  *(AC-050)*
- **FR-050** The system MUST return, for each channel, whether it has messages newer than the caller's last visit, and the
  client MUST show that state on the default channels. *(AC-055)*
- **FR-051** The system MUST return a per-channel member count derived from the channel kind: workspace members, project
  members, or the two direct participants. *(AC-051)*

### 14.3 Non-functional requirements

- **NFR-020** Mention highlighting MUST be produced by segmenting the message text into React nodes; message bodies MUST NOT
  be injected as raw HTML, so a name containing markup cannot become script. *(AC-052)*

### 14.4 Edge cases and error states

- **EC-018** A member types `@` and their own name appears in the text but not in the suggestion list → the typed text is
  left as written and is highlighted like any other mention, but no self-notification is created.
- **EC-019** A message references an attachment id uploaded to a different channel → that id is dropped and the message is
  stored with the remaining attachments, so no cross-channel file is exposed.
- **EC-020** A channel has more unread messages than the badge can show → the badge reads `9+`.

### 14.5 Defect fixed in this change set

`Path nameKey is required.` appeared when creating a task in a project, even though the task was created. Cause: the
project-membership hook loaded the project with a partial projection (`select('members')`) and then called `save()`, so
Mongoose validated required fields it had never loaded. Fixed by replacing the load-and-save with a single atomic
`updateOne` using `$addToSet`, which performs no full-document validation. No requirement change; recorded here so the
failure mode is not reintroduced.

### 14.6 Suggested but not implemented

Recorded for a later version, not part of this change set: message forwarding; per-channel mute and notification
preferences; drag-and-drop file upload onto the conversation; an in-conversation jump-to-unread marker; and read receipts
("seen by") for team channels.

## 15. Change set — direct messages segmented like team channels

> Added by `/sdrive:update-propose` on 2026-10-18. Appends only; no existing ID was renumbered, deleted or reworded.

### 15.1 Context

The chat panel is where a member reads conversations, and it currently presents two different shapes. Project
channels — the "Team channels" of §8 — render as *segmented cards*: a section heading, one row per conversation
carrying the channel avatar, name, last-message preview and an unread dot, a footline stating who may read the
section, and explicit loading and empty states. Direct conversations render through the generic `ChannelList`, a lock
glyph and a name, because that component was written for the sidebar's `CHAT` group. No avatar, no preview, no unread
dot, no heading.

The difference is a presentation defect, not a design decision: both kinds are conversations, both open the same
channel view, and both already carry last-message and read-state data. This change set makes direct messages a
segmented section rendered by the same row component as team channels, placed above them, and served by one request.
Authorization is unchanged: a direct channel remains readable only by its two participants and is answered with `404`
for everyone else (FR-025, FR-026).

| Section | Kind | Audience | Rows come from |
|---|---|---|---|
| `Direct messages` | `direct` | Its two participants only (FR-025, FR-026) | `GET /chat/conversations` → `directs` |
| `Team channels` | `project` | Project members plus `chat:moderate` holders (FR-037) | `GET /chat/conversations` → `teams` |

The two default channels stay main-menu navigation (AC-001, AC-041) and do not appear in either section.

### 15.2 User stories and acceptance criteria

#### US-025 — Direct messages are a section of the conversation panel
*As a* workspace member *I want* my private conversations listed as cards beside the team channels, *so that* the
whole side panel reads the same way.

- **AC-056** The chat side panel renders exactly two labelled conversation sections, `Direct messages` above
  `Team channels`, and each readable conversation appears in exactly one of them according to its kind; the two
  default channels remain main-menu entries and are not repeated in either section.
- **AC-057** A direct row carries the other participant's avatar and display name, the last message as an
  author-prefixed preview (`Attachment` when the body is empty, `No messages yet` when there is none), an unread dot
  while the conversation holds messages newer than the caller's last read, and an `Archived` marker only when the
  channel is archived; selecting the row opens `/{workspaceSlug}/chat/{channelId}`.
- **AC-058** Direct and team rows render through one shared row component, so avatar size, name and preview
  typography, spacing, hover and active treatment, the unread dot and `aria-current` are identical; apart from the
  team-channel settings affordance (§8, AC-044), the sections differ only in heading, loading copy, empty copy and
  footline.
- **AC-059** The side panel obtains both sections in a single request; while it loads each section shows its own
  loading copy, and a section with no conversations shows its empty copy instead of being omitted — the direct empty
  state names the `New direct message` control it expects the member to use.
- **AC-060** Starting a direct conversation adds its row to `Direct messages` in place and selects it, without a full
  page reload and without duplicating a row that already existed.

#### US-026 — A direct conversation is named after the person
*As a* workspace member *I want* a direct conversation to carry the other person's name and picture, *so that* I can
recognise it without opening it.

- **AC-061** A direct row's name and avatar come from the other participant and never from the stored channel name or
  the caller's own name; when that account cannot be resolved the row falls back to `Direct message` with the default
  avatar and still opens for the remaining participant.

### 15.3 Functional requirements

- **FR-052** The system MUST return the caller's direct conversations and readable team channels in a single response
  — `GET /api/workspaces/:slug/chat/conversations` returning `{ directs, teams }` — each row carrying its display name,
  avatar URL, last-message preview, archived flag and the caller's unread state. *(AC-056, AC-057, AC-059)*
- **FR-053** The system MUST render direct and team rows through one shared component, so the two sections cannot
  drift in layout, unread treatment or keyboard behaviour. *(AC-058)*
- **FR-054** The system MUST derive a direct conversation's display name and avatar from the other participant, MUST
  NOT label a row with the caller's own name, and MUST fall back to a neutral `Direct message` row when that account
  cannot be resolved. *(AC-057, AC-061, EC-021)*
- **FR-055** The system MUST keep direct-channel authorization unchanged: a direct conversation is listed only for its
  two participants and every other caller receives `404`. *(AC-056)*
- **FR-056** The system MUST give each section a heading, a loading state and an empty state, and MUST NOT hide a
  section because it is empty. *(AC-059)*
- **FR-057** The system MUST keep the `New direct message` control above both sections and MUST add a newly created
  conversation to `Direct messages` in place. *(AC-059, AC-060)*

### 15.4 Non-functional requirements

- **NFR-021** The side panel MUST resolve both sections in one request per open of the chat screen and MUST NOT issue a
  request per conversation (extends NFR-019). *(AC-059)*
- **NFR-022** Each section MUST be a labelled navigation landmark with a heading, the open conversation MUST carry
  `aria-current="page"`, and keyboard order MUST follow the visual order: `New direct message`, `Direct messages`,
  `Team channels` (CON-305). *(AC-058)*

### 15.5 Edge cases and error states

- **EC-021** The other participant in a direct conversation is no longer in the workspace → the row shows a neutral
  `Direct message` name with the default avatar, and the conversation still opens with its history for the remaining
  participant; no other member's identity is substituted.
- **EC-022** A member has no direct conversations → the `Direct messages` section renders its empty copy and the
  `New direct message` control stays reachable above it; the section is not collapsed.
- **EC-023** A caller's `chat:read` is revoked while the panel is open → the next panel load is refused by the existing
  authorization check and the client hides the chat panel rather than rendering stale rows (extends EC-005).

### 15.6 No supersession

Nothing above narrows an earlier requirement. AC-050 and FR-049 already require the panel order `New direct message`,
then direct conversations, then team channels; this change set gives the direct half of that order the same row design
the team half already had. AC-042 and FR-039 (the team list's contents) are unchanged, as are FR-025/FR-026
(direct-channel identity and 404 behaviour) and AC-055 (unread on the default channels).

## 16. Change set — conversation list polish and honest counts

> Added by `/sdrive:update-propose` on 2026-10-18. Appends only; no existing ID was renumbered or reworded.

### 16.1 Context

Walking the side panel and the channel header turned up three defects and three gaps worth closing now, because all six
live on the same two surfaces the previous change set touched.

| # | Observed | Cause | Fix in this change set |
|---|---|---|---|
| 1 | `New direct message` is easy to miss | it renders as a 28px `text-xs` text link (`px-2 py-1.5`) beside 44px conversation cards | make it a full-height row (US-029) |
| 2 | A two-person group reads **1 member** | a project channel counts `Project.members`, which only task assignment populates; the creator is never added | add the creator and backfill (US-030, FR-064) |
| 3 | A direct conversation opened from `New direct message` can read the workspace count | `startDirect` returns the raw channel, with no `memberCount`, so the client falls back to `members.length` | return the count and remove the fallback (US-030, FR-063) |
| 4 | Conversations are unsorted and previews go stale | the list is rendered once from a name-sorted response and never re-read | order by recency and update the row on arrival (US-027) |
| 5 | Unread is a dot | the list exposes a boolean, not a count | return and render a count (US-028) |
| 6 | A DM header shows a lock glyph | the header is built for channels, not people | show the other participant (US-031) |

None of these changes authorization. Item 2 does add the project creator to `Project.members`, which is an access
change for exactly one person — the person who created the project — and is recorded in §16.5.

### 16.2 User stories and acceptance criteria

#### US-027 — The conversation list follows recent activity
*As a* workspace member *I want* the conversation with the newest message first and its preview up to date, *so that* I
can see where the conversation is without opening every row.

- **AC-062** Each section is ordered by its most recent message, newest first, with a conversation that has no messages
  after those that do and then ordered by name; the order comes from the server, so two devices show the same list.
- **AC-063** When a message arrives in a conversation that is not currently open, that row's preview and unread state
  update in place and the row moves to the top of its section, with no page reload and no duplicate row.

#### US-028 — Unread counts are actionable
*As a* workspace member *I want* to see how many messages are waiting, *so that* I can decide which conversation needs me.

- **AC-064** A row with unread messages shows their number, capped at `9+`, instead of a bare dot; the number clears when
  the conversation is opened and comes from the same read state as the main-menu badge.

#### US-029 — The New direct message control is a first-class row
*As a* workspace member *I want* a control I cannot miss, *so that* starting a private conversation is as obvious as
opening one.

- **AC-065** `New direct message` renders as a full-width row at least 44px tall with an icon and a visible label, styled
  as a peer of the conversation cards, and remains the first item above both sections; the teammate list it opens has
  rows of the same height.
- **AC-066** The control is operable by keyboard, exposes an accessible name and `aria-expanded`, and its expanded list
  is a labelled list of teammates.

#### US-030 — A group's member count matches its members
*As a* channel member *I want* the header count to name the people in the conversation, *so that* I know who is in it.

- **AC-067** The count for a team channel equals the number of people in that project's member list, including the
  project's creator; a `chat:moderate` holder who can read the channel without being a member is not counted.
- **AC-068** The count for a direct conversation is exactly two, including immediately after it is opened from
  `New direct message`; no channel ever falls back to the workspace member count.

#### US-031 — A direct conversation's header shows the person
*As a* workspace member *I want* the header of a private conversation to carry the other person's avatar and name,
*so that* I know who I am talking to.

- **AC-069** A direct conversation's header shows the other participant's avatar and display name in place of the lock
  glyph, with their online state; a team or default channel keeps its channel avatar and name.

### 16.3 Functional requirements

- **FR-058** The system MUST order both conversation sections by `lastMessageAt` descending, with never-used
  conversations last and ordered by name, and MUST include the row's unread count in the same response.
  *(AC-062, AC-064)*
- **FR-059** The system MUST update the affected row's preview, unread count and position when a message arrives in a
  conversation that is not open, reusing the existing socket subscription rather than a new poller. *(AC-063)*
- **FR-060** The system MUST return an unread **count** per conversation, not only a boolean, and the client MUST cap the
  rendered value at `9+`. *(AC-064)*
- **FR-061** The system MUST render `New direct message` as a row of at least 44px with an icon and label, as a peer of
  the conversation cards, and MUST keep it above both sections. *(AC-065)*
- **FR-062** The system MUST make that control keyboard operable with an accessible name and `aria-expanded`, and MUST
  label its expanded teammate list. *(AC-066)*
- **FR-063** The system MUST derive a channel's member count from its kind — project members including the creator,
  exactly two participants for `direct`, workspace members for the two defaults — and MUST NOT fall back to the
  workspace count for a direct conversation. *(AC-067, AC-068)*
- **FR-064** The system MUST add the project's creator to `Project.members` when the project is created, idempotently,
  and MUST backfill the creator into existing projects once. *(AC-067)*
- **FR-065** The system MUST render a direct conversation's header with the other participant's avatar and display
  name, never the caller's own identity and never a generic glyph. *(AC-069)*

### 16.4 Non-functional requirements

- **NFR-023** Ordering and unread counts MUST be computed in the existing list request, without a query per row, so
  NFR-019 and NFR-021 still hold. *(AC-062, AC-064)*
- **NFR-024** The 44px control and teammate rows MUST keep the panel scrollable and usable at 320px width (CON-306).
  *(AC-065)*
- **NFR-025** The live row update MUST reuse the socket the message list already subscribes to and MUST NOT add a
  polling loop. *(AC-063)*

### 16.5 Membership and count semantics

`Project.members` gains one automatic entry: the user who creates the project. Task assignment still adds assignees
(FR-035), leaving the workspace still removes a user everywhere (FR-044), and nothing in the UI asks anyone to manage
the list by hand (§8.6).

The count is therefore the **group's members**, not everyone who can read the channel. A `chat:moderate` holder who is
not a member may open a team channel for moderation (AC-039) but is not counted, because they are not in the group.
AC-051's parenthetical "equals the number of people who can read it" is read as "equals the number of members of that
group" from this change set onward; where the two differ, FR-063 is authoritative.

The backfill is one idempotent pass over projects whose creator is missing from `members`, run alongside the channel
backfill, so an existing workspace corrects itself on the next channel list rather than needing a migration command.

### 16.6 Edge cases and error states

- **EC-024** A project has a creator but no assigned tasks → its channel reports 1 member and is readable by the
  creator, instead of reporting 0 and being invisible to them.
- **EC-025** Messages arrive in two different conversations while the panel is open → both rows update and the more
  recent conversation sorts first; neither row is duplicated.
- **EC-026** A member's display name is longer than the row → the name truncates with an ellipsis and the row keeps its
  44px height rather than wrapping to two lines.

### 16.7 Deferred

Recorded for a later version, not part of this change set: per-conversation drafts; jump-to-first-unread; message
forwarding; "seen" receipts for direct messages; drag-and-drop and paste-to-upload; per-conversation mute; and a
`Ctrl/Cmd+K` conversation switcher.

## 17. Change set — search that behaves like an editor find widget

> Added by `/sdrive:update-propose` on 2026-10-18. Appends only; no existing ID was renumbered or reworded.

### 17.1 Context

Search exists (`GET /chat/:channelId/search`, FR-023) but its surface does not. `SearchPanel` renders a 224px box of
non-interactive rows under the header and nothing else: no selected row, no way to step through matches, no way to open
one, and it ignores the cursor the API already returns. The comment above the component claims each result "can be
jumped to", but no row has a handler.

The result is the shape in the screenshot: a small dropdown of text that answers "does this word appear" and nothing
more. An editor find widget answers the question a reader actually has — *where* the matches are and *which one* is
next — so this change set replaces the dropdown with that pattern: an inline find bar, a full-height result list, arrow
navigation with wrapping, a position counter, and a jump that lands on the message.

| Concern | Today | This change set |
|---|---|---|
| Surface | 224px dropdown under the header | inline find bar + full-height result list |
| Selection | none | one selected row, pointer or keyboard |
| Navigation | none | `ArrowDown`/`ArrowUp` wrap, `Enter` opens, `Shift+Enter` previous |
| Counter | none | `3 of 12`, `3 of 12+` while more pages exist |
| Paging | first page only, cursor discarded | next page fetched when the selection reaches the end |
| Jump | none | closes search, loads the message if needed, scrolls to it, highlights it briefly |
| Keyboard | none | input keeps focus; `Esc` closes and returns to the composer |

### 17.2 User stories and acceptance criteria

#### US-032 — Search is a find bar, not a dropdown
*As a* channel member *I want* search to open as a bar above the conversation, *so that* it feels like a tool rather
than a popup.

- **AC-070** Search opens as an inline bar between the channel header and the conversation, holding the input, a match
  counter, previous and next buttons and a close button; it spans the conversation width, never floats over or clips
  the message list, and no dropdown or popover is rendered. It opens from the header search button and from
  `Ctrl/Cmd+F` while the chat surface has focus, and `Esc` closes it.

#### US-033 — Results are a navigable list
*As a* channel member *I want* the matches listed and selectable, *so that* I can step through them instead of reading
a clipped box.

- **AC-071** While a query is active the conversation body shows the matches as a full-height, scrollable list; each row
  carries the author, the date and a snippet with every occurrence of the term highlighted, and exactly one row is
  selected at a time. The list is a labelled `listbox` and each row an `option`, and rows are also selectable by
  pointer.
- **AC-073** The counter shows the selected position and the loaded count (`3 of 12`), with a trailing `+` while the
  server reported another page; when the selection moves past the last loaded row, the next page is fetched and
  appended without resetting the selection and without duplicates.

#### US-034 — Arrow keys move through the matches
*As a* keyboard user *I want* to step through results without leaving the input, *so that* searching stays one motion.

- **AC-072** `ArrowDown` and `ArrowUp` move the selection one row and wrap at both ends; `Enter` opens the selected
  message; `Shift+Enter` moves to the previous match; focus stays in the input throughout and the selected row is
  announced through `aria-activedescendant`. `Esc` closes search and returns focus to the composer.
- **AC-075** The bar and the list are operable by keyboard alone with a visible focus ring; the counter is announced
  politely when the selection changes, and the selected row is distinguishable without relying on colour alone.

#### US-035 — Opening a result lands on the message
*As a* channel member *I want* the message to be there when I pick a result, *so that* the search actually takes me to
the conversation.

- **AC-074** Opening a result closes search, scrolls that message into view and highlights it for a short time; if the
  message is not in the loaded pages, older pages are fetched until it is found (bounded to the current channel), and
  the bar shows a loading state until the jump completes. A message that no longer exists reports that it is gone and
  leaves search open.

### 17.3 Functional requirements

- **FR-066** The system MUST render search as an inline find bar with an input, a position counter, previous and next
  controls and a close control, and MUST NOT render search results in a dropdown or popover. *(AC-070)*
- **FR-067** The system MUST render the matches as a full-height selectable list, one row per message, carrying the
  author, the date and a snippet with every occurrence of the term highlighted. *(AC-071)*
- **FR-068** The system MUST implement the keyboard contract — `ArrowDown`/`ArrowUp` with wrapping, `Enter` to open,
  `Shift+Enter` for the previous match, `Esc` to close — while keeping focus in the search input. *(AC-072, AC-075)*
- **FR-069** The system MUST fetch the next result page when the selection reaches the last loaded row and the server
  reported one, appending without duplicates and without resetting the selection. *(AC-073)*
- **FR-070** The system MUST open the selected message by closing search, ensuring the message is loaded, scrolling it
  into view and highlighting it briefly, and MUST report when the message is no longer available. *(AC-074)*
- **FR-071** The system MUST expose the list as a labelled `listbox` with `option` rows, keep the input as the active
  combobox with `aria-activedescendant`, and announce the counter through a polite live region. *(AC-075)*

### 17.4 Non-functional requirements

- **NFR-026** The result list MUST cap the number of rows it renders at once (windowing or a bounded list) so a broad
  term cannot freeze the panel, and MUST keep the selected row scrolled into view. *(AC-071, AC-073)*
- **NFR-027** Snippet highlighting MUST segment the text into React nodes; the body MUST NOT be injected as HTML, so a
  message containing markup cannot become script. *(AC-071)*
- **NFR-028** In-flight searches, page fetches and jumps MUST be cancelled when the query or the channel changes, and a
  late response MUST NOT render rows or scroll a message from another channel. *(AC-073, AC-074)*

### 17.5 Edge cases and error states

- **EC-027** A query matches nothing → the bar reads `0 of 0`, both arrows are disabled, and the list shows
  `No messages matched “…”`.
- **EC-028** The user types a new term while the next page of the previous term is still loading → the late page is
  discarded and only the new term's rows are shown.
- **EC-029** The selected message was deleted between the search and the jump → search stays open and the bar reports
  that the message is no longer available, with the next match still selectable.

### 17.6 Out of scope

Workspace-wide search (search stays inside the open channel), search operators (`from:`, `before:`, `has:link`), saved
searches, and replacing the pinned-messages panel. Those are recorded here rather than added to the change set.

Thread replies are also outside this change set: the find widget navigates the conversation body, so search returns
top-level messages only. A reply lives inside its thread panel and is not a jump target; including it would produce a
result that could not be opened. Searching inside a thread is a separate change.
