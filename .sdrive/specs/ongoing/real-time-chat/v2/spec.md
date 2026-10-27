---
title: Real-time chat v2 - project chat, rich messages and channel membership
status: backlog
version: v2
created: 2026-10-27
updated: 2026-10-27
---

# real-time-chat v2 - functional specification

| | |
|---|---|
| Feature | `real-time-chat` |
| Version | 2 |
| Status | Backlog - specification awaiting Gate 1 approval |
| Governance | `.sdrive/governance/real-time-chat/v2/{spec,plan,tasks,traceability}.json` |
| Branch | `feature/chat` (base `main`) |
| Predecessor | `.sdrive/specs/ongoing/real-time-chat/v1/` (review PASS, 75 ACs) |
| Source of the idea | Maintainer walkthrough with five screenshots: renaming team chat to project chat, live project-channel arrival on assignment, a syntax-highlighted code card, image/file previews, an attachment "Not authorized, no token" page, a project-detail header without a chat action, and the chat header member control |

## 1. Overview

### Problem statement

Chat v1 shipped a working channel/message/presence system, but the surface still describes itself as team chat, which no longer matches how
the product is used: conversations are organised around projects, and membership of a project is what grants access. Three further gaps stop
the surface from feeling finished. A person who is assigned a task joins the project, but their open chat does not learn about the new project
channel until the page is reloaded. A message that arrives over the socket can render its author as "Unknown member" until a reload, because
not every socket payload carries a populated author. Code pasted into the composer is shown as prose, images are shown as a filename link,
and every attachment link points at a protected API route that the browser opens without an `Authorization` header, so viewing the file
answers `{"message":"Not authorized, no token"}`. The chat header also renders a member-count button whose handler is an empty function, so
the control looks interactive and does nothing. Finally, the project detail page - the place where a member thinks about a project - has no
way into that project's conversation.

### Proposed solution

A second, backwards-compatible pass over the chat module:

- **Project terminology.** The seeded workspace-wide `team` channel is renamed `Project Chat`, the conversation segment becomes
  `Project channels`, and every "team channel" string becomes "project channel". The stored `kind` value stays `team` so permissions,
  indexes and existing rows are untouched.
- **Live channel membership.** When a task assignment adds someone to a project, the server emits the project channel to that person's socket
  room; the client appends the row and joins the channel room, so the project appears by name without a reload. Project renames refresh the
  row the same way.
- **Rich messages.** A paste of code becomes a fenced block with an inferred language, and code renders as a card with a language label,
  syntax colours, Copy and Download. Images render as thumbnails and open in a lightbox; other files render as file cards and download.
- **Authenticated media.** Attachments are fetched through the existing axios client as blobs, cached per attachment and revoked when unused.
  No attachment is ever opened by navigating the browser to a protected URL, and no token is placed in a URL.
- **Project entry point.** The project detail header gains an `Open chat` action that resolves (or creates) the project's channel.
- **Honest author and membership.** Every socket payload that carries a message carries a populated author, the client falls back to the member
  directory when it receives an id, and the header member control opens a WhatsApp-style panel listing the channel's people with presence,
  workspace role and a "You" badge.

### Target audience

Workspace members who read or write chat (Developer, Team Member, Scrum Master, Product Owner, Administrator) and the project members who gain
a channel through task assignment. No new role or permission is introduced.

### Assumptions

- `assumption: true` - "Team chat" in the request means the seeded workspace-wide channel named `Team Chat`; "team channel" means the
  per-project channel currently labelled `Team channels`. Both are display/data changes, not a new channel type.
- `assumption: true` - The project detail header action is an in-app navigation, not a new tab; the chat screen already supports deep links to
  `/{workspaceSlug}/chat/{channelId}`.
- `assumption: true` - A member's workspace role (`Workspace.members[].roleId`) is the role shown in the member panel; projects have no role of
  their own in the current data model, so no project-level admin/member distinction is invented.
- `assumption: true` - "Their details" means avatar, display name, online state and workspace role. Email addresses are deliberately not
  exposed to every channel reader.
- `assumption: true` - Attachment previews are rendered from the original file. No thumbnail pipeline or image re-encoding is added.
- `assumption: true` - The socket transport remains the only live channel; the existing REST fallback and 10-second activity poll are unchanged.

### Out of scope

- Changing chat permissions, the channel `kind` enum, or the access rules from v1.
- Replacing Socket.IO, adding a second realtime transport, or changing the Vercel serverless entry that cannot host a socket.
- Voice/video, message translation, AI summarisation, bots or inbound webhooks.
- Per-project roles, project-level chat moderation, or a second membership model.
- Server-side image thumbnailing, transcoding or virus scanning beyond the existing upload MIME allow-list (CON-507).
- Rebuilding the composer as a rich-text editor; pasted code is still stored as message text with fences.
- Merging or rebasing `feature/chat` onto the current `main` (recorded as RISK-007, not performed by this feature).

## 2. User stories and acceptance criteria

### US-036 - The chat surface speaks about projects

As a workspace member, I want the chat surface to say project chat and project channel, so that the vocabulary matches the projects the
conversation belongs to.

**Acceptance criteria:**

- AC-076: In every workspace, the seeded `team` channel displays as `Project Chat` in the sidebar, the chat header, search results and
  conversation previews; an existing workspace is migrated by an idempotent backfill rather than a manual step.
- AC-077: The chat screen's channel section is titled `Project channels`, its empty and footer copy says `project channel`, and no
  user-facing string in the chat surface says `Team Chat` or `team channel`.
- AC-078: The API still returns `kind: "team"` for that channel, so stored rows, permissions, indexes and access rules are unchanged.

### US-037 - A new assignee gets the project channel live

As someone newly assigned to a task, I want the project's channel to appear in my chat without reloading, so that I can join the conversation
the assignment just gave me access to.

**Acceptance criteria:**

- AC-079: Assigning a workspace member to a task in a project adds them to that project's members and ensures the project has a channel.
- AC-080: The newly added assignee's open chat screen gains the project's channel row, showing the project's current name, within 2 seconds and
  without a page reload.
- AC-081: The new row carries the channel id and member count, and the assignee's socket joins that channel's room so the next message in it
  arrives live.
- AC-082: A member who was already on the project receives no duplicate row and no event, and a bulk edit emits at most one channel event per
  project and user pair.

### US-038 - Pasted code is shown as code

As a member discussing implementation, I want a pasted snippet to appear as a code block with its language and actions, so that the message is
readable and reusable.

**Acceptance criteria:**

- AC-083: Pasting multi-line code into the composer inserts it as a fenced block with the inferred language and preserves indentation.
- AC-084: A message whose body is fenced code, or is clearly code without fences, renders a code card with a language label, syntax colours,
  `Copy` and `Download`.
- AC-085: `Copy` writes the raw code without the fences to the clipboard and announces success; `Download` saves the snippet with an extension
  derived from the language.
- AC-086: A snippet that is too large or of unknown language still renders readably - labelled `text`, no colour assumptions - and is never
  interpreted as HTML.

### US-039 - Attachments show what they are and open without an error

As a member receiving a file, I want to see the image or a file card and open it inside the app, so that I do not hit an authentication error.

**Acceptance criteria:**

- AC-087: An image attachment renders as a thumbnail in the message; a non-image attachment renders as a file card with its name, size and a
  type icon.
- AC-088: Clicking an image opens an in-app lightbox with the full image; clicking a file downloads it. Neither action navigates the browser to
  a protected API URL.
- AC-089: Attachments are loaded through the authenticated API client, so a fresh load of a message with an attachment never renders
  `Not authorized, no token`.
- AC-090: Object URLs are cached per attachment and revoked when no longer used, so paging or re-rendering does not refetch the same file and
  does not leak unbounded memory.
- AC-091: The composer previews pending attachments as image thumbnails or file cards before sending, and removing a pending attachment still
  works.

### US-040 - Reach the project chat from the project

As a project member reading the project detail page, I want a chat action in the header, so that I can move from the project's work to its
conversation in one click.

**Acceptance criteria:**

- AC-092: The project detail header shows an `Open chat` action beside `Edit`, `Open board` and `New sprint` for users who can read chat.
- AC-093: The action opens that project's channel, resolving it on demand if it does not exist yet, and is hidden from a user without
  `chat:read`.

### US-041 - A live message always names its author

As a member receiving a message live, I want the author's name and avatar immediately, so that a new message is never anonymous.

**Acceptance criteria:**

- AC-094: A message received over the socket displays the author's name and avatar immediately, with no refresh.
- AC-095: An edit, pin or unpin broadcast also carries the author, and a payload that carries only an author id is resolved against the member
  directory, so `Unknown member` is never shown for a known participant.

### US-042 - See who is in the channel

As a channel member, I want the member control to open a list of everyone in the channel with their details, so that I know who I am talking to.

**Acceptance criteria:**

- AC-096: Clicking the members control in the chat header opens a member panel; the control no longer has an empty handler.
- AC-097: The panel lists each member with avatar, name, online state, workspace role and a `You` badge, online members first, and its member
  count matches the number on the header.
- AC-098: A project channel lists the project's members, the two default channels list workspace members, and a direct conversation lists its
  two participants.
- AC-099: The panel is keyboard operable - it opens with focus inside, closes on Escape and returns focus to the trigger - and at 320px it fits
  without horizontal scrolling.

## 3. Requirements

### Functional requirements

- FR-072: The seeded `team` channel MUST be stored and returned as `Project Chat`; the existing-workspace backfill MUST rename a channel named
  `Team Chat` idempotently and MUST NOT create a second default channel.
- FR-073: Every user-facing chat string MUST read `Project Chat` / `project channel` / `Project channels`; the internal `kind` value MUST remain
  `team`.
- FR-074: The chat screen's channel section MUST be titled `Project channels` and its footer MUST state that only project members can read a
  project channel.
- FR-075: A create or update that changes a task's assignees MUST keep adding the new assignees to the task's project (v1 behaviour) and MUST
  ensure that project's channel exists before any event is emitted.
- FR-076: The server MUST emit a `chat:channel-granted` event to the user room of each assignee newly added to a project, carrying the channel
  card: id, name, project id, avatar URL, member count and archived flag.
- FR-077: The client MUST append a granted channel to the Project channels list, deduplicate by id, refresh ordering, and join its socket room
  without a reload.
- FR-078: The server MUST NOT emit `chat:channel-granted` for an assignee who was already a project member, and MUST collapse a bulk change to
  one event per project and user pair.
- FR-079: When a project is renamed, the server MUST emit the updated channel summary so open chat screens show the new project name.
- FR-080: The composer MUST detect a pasted multi-line code snippet and insert it as a fenced block tagged with an inferred language, preserving
  the pasted indentation and not double-wrapping text that is already fenced.
- FR-081: The message renderer MUST render fenced code and clearly-code bodies as a code card with a language label, syntax highlighting,
  `Copy` and `Download`.
- FR-082: `Copy` MUST copy the raw code without fences; `Download` MUST save it with an extension derived from the language; both MUST work
  without the message being editable.
- FR-083: Snippet detection, language inference and download naming MUST be pure functions in `client/src/features/chat/lib/` covered by unit
  tests (CON-202).
- FR-084: The message renderer MUST show image attachments as thumbnails and non-image attachments as file cards with name, size and a type
  icon, while keeping the attachment name available to assistive technology.
- FR-085: Activating an image attachment MUST open an in-app lightbox; activating a file attachment MUST download the file. Neither action may
  navigate the browser to the API route.
- FR-086: Attachment bytes MUST be fetched with the authenticated API client as blobs; the chat surface MUST NOT place an auth token in a URL,
  query string or anchor `href`.
- FR-087: Loaded attachment object URLs MUST be cached per attachment id and revoked when the last consumer unmounts.
- FR-088: The composer's pending-attachment list MUST preview images as thumbnails and other files as cards, and MUST keep the existing remove
  control.
- FR-089: The project detail header MUST render an `Open chat` action for callers with `chat:read` that links to that project's channel.
- FR-090: The API MUST expose the channel for one project, get-or-create semantics included, so the project header can link directly without
  loading every conversation.
- FR-091: Every socket payload that carries a message MUST carry a populated author (name and avatar), including `chat:message`, `chat:updated`
  and the REST responses they mirror.
- FR-092: The client MUST resolve an author id against the channel member directory when a message payload carries only an id, and MUST NOT
  render `Unknown member` for a known participant.
- FR-093: The chat header member control MUST open a member panel instead of calling an empty handler.
- FR-094: The API MUST expose the members of one channel - project members for a project channel, workspace members for the two default
  channels, and the two participants for a direct conversation - with id, name, avatar URL, workspace role name and online state.
- FR-095: The member panel MUST show avatar, name, online state, role and a `You` badge, group online members first, and state a count equal to
  the header's member count.

### Non-functional requirements

- NFR-029: A project channel granted by a task assignment MUST be visible on an already-open chat screen within 2 seconds p95 on a normal
  connection, or on the next load if the assignee is offline; no polling interval may be added to achieve it.
- NFR-030: The channel-members endpoint MUST resolve the list in at most two database queries and MUST NOT query once per member.
- NFR-031: Attachment object URLs MUST be shared per attachment id for the life of the message list, so the same file is fetched once, and MUST
  be revoked when the last consumer unmounts.
- NFR-032: Syntax highlighting MUST be lazy-loaded on the client and MUST NOT delay first paint or typing; a code block above 20,000 characters
  MUST fall back to plain monospace text.
- NFR-033: The code card, lightbox and member panel MUST be keyboard operable, expose accessible names, trap focus where they are modal, close
  on Escape and restore focus to the trigger (CON-305).
- NFR-034: The lightbox and the member panel MUST be usable at 320px without horizontal scrolling, and the code card MUST scroll its own
  horizontal overflow rather than widening the conversation (CON-306).
- NFR-035: Every new route MUST run `protect` then `requirePermission('chat:read')` and MUST resolve the channel through the existing
  `loadChannelForCaller` rules, so project membership is enforced exactly as in v1 (CON-511, CON-512).
- NFR-036: Every new path parameter MUST be validated as an ObjectId and every query MUST filter by `req.workspace._id`; no user input may be
  interpolated into a query (CON-515, CON-516).
- NFR-037: Code and message bodies MUST be rendered as React text nodes; `dangerouslySetInnerHTML` MUST NOT be introduced (CON-517).
- NFR-038: The new routes MUST inherit the application Helmet headers and the general API rate limiter; no new bypass or direct `process.env`
  read may be added (CON-513, CON-514, CON-206, CON-519).
- NFR-039: Attachment access MUST keep using the bearer token over HTTPS and MUST NOT introduce a token in a URL, a long-lived public link or a
  new storage service (CON-520).
- NFR-040: The upload MIME allow-list and filename sanitisation MUST remain the only content gate; the stored `type` MAY be used for rendering
  decisions but MUST NOT be trusted as proof of content (CON-507).
- NFR-041: A failed attachment fetch, a failed code highlight and a failed member query MUST each degrade to a readable fallback without
  unhandled rejections or console errors.

### Security baseline

The v1 expansion of the constitution's REQUIRED controls remains the baseline. This version adds no new authentication mechanism, no new
secret, no cookie and no HTML sink, so CON-518 (CSRF) stays NOT APPLICABLE for the same reason: authentication is header-based.

| Control | Decision for v2 |
|---|---|
| CON-511 Authentication | Reused. New routes sit behind `protect`; attachments keep using the bearer token (NFR-035, NFR-039). |
| CON-512 Authorization | Expanded. New routes use `requirePermission('chat:read')` plus `loadChannelForCaller`, so project membership gates project members (NFR-035). |
| CON-513 Security headers | Reused. Routes are mounted under the existing `helmet()` app (NFR-038). |
| CON-514 Rate limiting | Reused. The general API limiter covers the two new GET routes; no socket input is added (NFR-038). |
| CON-515 Input validation | Expanded. `:channelId` and `:projectId` are ObjectId-validated (NFR-036). |
| CON-516 NoSQL protection | Expanded. Cast ids and `req.workspace._id` filters only (NFR-036). |
| CON-517 XSS protection | Expanded. Code and bodies render as text nodes; no HTML sink (NFR-037). |
| CON-518 CSRF | NOT APPLICABLE. Header-based auth, no cookies (unchanged from v1). |
| CON-519 Environment security | Reused. No new environment variable (NFR-038). |
| CON-520 HTTPS/HSTS | Reused. Blob fetches ride the existing API origin (NFR-039). |

## 4. UI/UX and data requirements

### UI/UX

- **Terminology.** Sidebar `# Project Chat`, section `Project channels`, footer `Only project members can read a project channel`. The word
  "team" disappears from chat copy; internal code identifiers may keep it where renaming would add churn without user value.
- **Granted channel.** The new row appears in the Project channels segment with the project's avatar tile and name, exactly like a row loaded
  from the API. No modal interrupts the member; the row carries the existing unread treatment.
- **Code card.** Bordered surface, header row on a dark code surface with the language label on the left and `Copy` / `Download` on the right,
  monospace body with horizontal scrolling, following the calm semantic tokens in `DESIGN.md` rather than a second palette.
- **Attachments.** Image thumbnails are constrained to a small preview (about 240px wide, 4:3 maximum) with rounded corners and the file name
  beneath; file cards use a type icon, a truncated name and a size line. The composer mirrors both shapes at chip size.
- **Lightbox.** Centred dialog over a scrim with the image contained, the name and size beneath, a download action, and a close control.
- **Member panel.** Right-hand sheet at desktop and full-width sheet on phones, grouped `Online` then `Offline`, each row: avatar with presence
  dot, name plus `You`, role as secondary text. Header repeats `N members`.
- **Project header.** `Open chat` uses the same outline button treatment as `Open board`, with a message icon, and sits before the primary
  `New sprint` button.

### Data

- `ChatChannel.name` for the default `team` channel becomes `Project Chat`; no field is added or removed.
- No schema change is required for messages, attachments or members. The socket payload adds the existing channel-card shape on a new event
  name; the author population change reuses the existing `PUBLIC_USER_FIELDS`.
- The member panel reads `Workspace.members[].roleId` and `Role.name` for the role label, and `ChatPresence` rows for the online state already
  broadcast on `chat:presence`.

## 5. Edge cases and error states

- EC-030: An assignment lands on a project whose channel does not exist yet -> the channel is created first, then the card is emitted.
- EC-031: The assignee is already a project member -> no event and no duplicate row; their existing card stays.
- EC-032: The assignee is offline -> no event is stored; the channel appears on their next `/chat/conversations` load, and the event is never
  replayed as a stale notification.
- EC-033: The same task is edited twice in a bulk operation -> at most one `chat:channel-granted` per project and user.
- EC-034: Pasted text already contains a fence -> it is sent as-is rather than double-wrapped.
- EC-035: Pasted text is prose with a single line break -> it stays prose; detection requires code signals, not just a newline.
- EC-036: A code block exceeds the highlight limit -> plain monospace with Copy/Download still available.
- EC-037: An attachment fetch fails (expired session, file removed) -> the message shows a retryable placeholder with the name, never a broken
  image or an auth error page.
- EC-038: The channel is a direct conversation -> the panel lists exactly the two participants, and the header count stays 2.
- EC-039: A presence event is missed while the panel is open -> the member shows as offline until the next event; no invented "last seen".
- EC-040: A user without `chat:read` opens a project page -> the `Open chat` action is absent and no channel request is made.
- EC-041: The project is archived or the channel is read-only -> the granted card shows the archived treatment and posting stays disabled.
- EC-042: A project is renamed while a member has the chat open -> the row and header update to the new name without a reload.

## 6. Dependencies and risks

### Dependencies

- `prism-react-renderer` (new, client): token-based syntax highlighting without a stylesheet; lazy-loaded with the code card. A matching skill
  is expected for this dependency before implementation.
- `axios` (reuse): the existing authenticated client carries the blob fetches.
- `socket.io` / `socket.io-client` (reuse): the granted-channel event uses the existing user room and channel rooms.
- `lucide-react` (reuse): message, file, image and download icons.
- `react-markdown` (reuse, only if the renderer is shared): code cards for chat messages, without adding a second markdown pipeline.

### Risks

- RISK-007: `feature/chat` is ~100 commits behind `main` and 20 ahead, so the eventual merge into `main` will conflict in the chat files. The
  mitigation is to keep v2 changes inside the files this spec names, and to rebase/merge `main` as a separate, reviewed step.
- RISK-008: A syntax highlighter can add bundle weight. Mitigation: lazy import, a single small language set, and the 20,000-character cap.
- RISK-009: Caching image blobs can grow memory in a long session. Mitigation: one cache entry per attachment id, revoked on last unmount, and
  only the rendered page is fetched.
- RISK-010: A bulk assignment could emit many channel events. Mitigation: diff the member list and collapse by project and user.
- RISK-011: Renaming the stored channel can collide with an existing `Project Chat` row under the unique (workspace, kind, nameKey) index.
  Mitigation: rename only when no `team` row already holds the target name, and otherwise leave the existing row untouched.
- RISK-012: The client must not regress the v1 search jump, pin panel or thread panel while the message renderer changes. Mitigation: keep the
  message body renderer a child component and preserve the `data-message-id` contract used by search.

## 7. Anti-redundancy check

| Need | Existing asset | Decision |
|---|---|---|
| Channel/message models, cursor paging, access rules | `server/src/models/chat*`, `utils/chatAccess.ts` | reuse |
| Real-time transport and rooms | `server/src/realtime/{socket,chatEvents,bus}.ts` | reuse; add one event |
| Default-channel seeding | `ensureDefaultChannels` in `chatChannelController.ts` | modify (rename) |
| Project channel lifecycle | `createProjectChannel`, `backfillProjectChannels` | reuse |
| User-targeted events | `emitToUser` + `userRoom` | reuse |
| Task assignment -> project membership | `addAssigneesToProjectMembers` | modify (return the added ids / ensure channel) |
| Channel card shape | `conversationCard` in `chatChannelController.ts` | reuse / extract |
| Member directories | `listChatMembers`, `Workspace.members`, `Role` | reuse; add channel-scoped endpoint |
| Presence | `ChatPresence`, `chat:presence`, `PresenceMap` | reuse |
| Message rendering | `MessageItem.tsx`, `MessageList.tsx` | modify |
| Composer | `Composer.tsx` | modify (paste detection, previews) |
| Project header actions | `ProjectDetailPage.tsx` | modify |
| Icon set | `lucide-react` | reuse |
| File bytes | axios `api`, `responseType: 'blob'`, `URL.createObjectURL` | reuse (built-in) |
| Syntax highlighting | none in the client | create (one dependency) |

No duplicate channel model, message store, socket transport, member model or notification path is introduced.

## 8. Traceability summary

Every requirement above maps to at least one acceptance criterion, and the matrix now also maps each of the 37 requirements (24 FR, 13 NFR)
to a plan section and one or more of the 32 tasks in P20-P27. All 24 acceptance criteria are linked. The machine-readable matrix is
`.sdrive/governance/real-time-chat/v2/traceability.json`; test ids remain for `/sdrive:test` to assign (CON-404, CON-405).
