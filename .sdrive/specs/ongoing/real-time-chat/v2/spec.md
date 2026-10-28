---
title: Real-time chat v2 - project chat, rich messages and channel membership
status: backlog
version: v2
created: 2026-10-27
updated: 2026-10-28
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

---

## 9. Amendment - the Project chat entry, a still frame and delivery fixes (update-propose, 2026-10-28)

### Amendment note

This section is the machine- and human-readable record of a maintainer walkthrough after v2 shipped. It **supersedes the sidebar clause of AC-076** and **narrows AC-077**: the seeded team channel is no longer a sidebar row, and a single `Project chat` navigation item replaces the team-chat navigation item on the sidebar. That item is a link to the workspace chat root - it is not a channel of its own - so it opens the view that lists every channel and direct message the member can read. It also **amends AC-056 and AC-065** for that view: the two labelled segments (`Project channels`, `Direct messages`) become one merged, recency-ordered run of rows, while the shared row rendering those criteria established - avatar, name, last-message preview, unread badge, one component for every conversation kind - is kept exactly as it is.

Nothing else about the v2 rename changes: the seeded channel keeps its stored `kind: 'team'`, its `nameKey`, its row, its permissions and the rename backfill, and AC-078 stands untouched. Every other existing requirement, story, acceptance criterion, edge case and task keeps its text, its number and its meaning. Where the two disagree, the requirement in this section wins, because it is later and it is the behaviour the maintainer asked for.

The walkthrough also reported seven defects that no acceptance criterion covered. They are recorded here as new requirements rather than silently fixed, so `/sdrive:test` can cover them (CON-401, CON-405):

| # | Reported | Root cause found in the repository |
|---|---|---|
| 1 | The sidebar still offers a project chat *channel*; it should be the way into every conversation | `SidebarChannels` filters to `mainMenu ?? kind === 'team' \|\| 'general'`, so the seeded team channel is a row that links to `/{slug}/chat/{channelId}`; no desktop entry points at `/{slug}/chat` and `ChatView` redirects that route to a default channel |
| 2 | The channel list scrolls away with the messages | `SidebarProvider` wraps the app in `min-h-svh` and nothing between it and the chat screen bounds the height, so the document scrolls and the message pane's own `overflow-y-auto` never engages |
| 3 | The chat header should float above the messages | `ChatHeader` is a sibling of the message pane inside a column that is not height-bounded; when the document scrolls, the header leaves the viewport |
| 4 | Copy and Download on a code card vanish on hover | `hover:bg-slate-800 hover:text-white` under a `bg-slate-900` card: the dark theme remaps `--color-slate-800` to `#E2E8F0` and only rewrites the plain `bg-slate-800` utility, so the hover background becomes near-white while `hover:text-white` is forced to `#FFFFFF` (about 1.1:1) |
| 5 | 'Could not load this attachment. Retry' for some members | `downloadAttachment` calls `decideChannelAccess` without `isProjectMember`, which answers `not_found` for any project channel to a caller without `chat:moderate`; every other path resolves membership first |
| 6 | The unread badge never clears; a granted channel shows 'No channel selected' until a reload | The sidebar reads its channel list once and prefers the server's `unread` flag over the local read state, and `ChatView` resolves the open channel from a list it loaded before the grant, so a route id it has not listed renders the empty pane |
| 7 | Thread replies and the newest conversation only appear after a reload | `useChatMessages` drops a reply from the channel list and nothing updates the parent's `replyCount`, and the conversation rows are rendered in payload order rather than re-sorted on first paint |

### US-043: The sidebar reaches every conversation

As a workspace member, I want a `Project chat` item in the sidebar that opens every conversation I can read, so that I reach a conversation in one place instead of a channel row I cannot tell apart from the others.

**Acceptance Criteria:**
- AC-100: In the sidebar chat group a single `Project chat` navigation item replaces the seeded team-chat entry: it is a link to `/{workspaceSlug}/chat` (the conversation list, no channel id), it is marked current for both `/{workspaceSlug}/chat` and `/{workspaceSlug}/chat/{channelId}`, and it carries no channel glyph and no permission-specific lock.
- AC-101: Opening `/{workspaceSlug}/chat` with no conversation selected shows the conversation list beside an explicit no-conversation-selected pane and does not redirect to a default channel; a member who can read at least one conversation is told to pick one from the list, never to ask an administrator for access.
- AC-102: The seeded team channel remains a readable conversation inside that list, with its stored `kind: 'team'` and its unread state unchanged, so renaming it and moving its sidebar entry stay display changes.

### US-044: The chat frame stays still while I read

As a workspace member, I want the conversation list and the chat header to stay where they are while I scroll the messages, so that I can read a long conversation and switch conversation without losing my place.

**Acceptance Criteria:**
- AC-103: The chat screen occupies exactly the space below the application header with its own bounded height: scrolling the message pane never scrolls the document, and the page scroll position is unchanged while a conversation is read.
- AC-104: The conversation-list pane and the message pane are independent scroll containers: scrolling the messages leaves the list where it was, and scrolling the list leaves the conversation where it was.
- AC-105: The chat header (conversation name, presence summary and the search, pins and members controls) stays visible while the messages scroll beneath it, and a long message list never pushes it out of view.
- AC-106: The containment holds from 320px to 1920px and at 200% zoom: no horizontal scrolling, no content hidden behind the header or the mobile tab bar, and a keyboard focus ring is never hidden behind the fixed header.

### US-045: Code actions stay readable in every state

As a workspace member, I want the Copy and Download controls on a code card to stay legible when I hover or focus them, so that I can copy a snippet without guessing which control I am about to press.

**Acceptance Criteria:**
- AC-107: The code card's Copy and Download controls keep at least 4.5:1 text contrast and 3:1 icon contrast against their own background in the default, hover, focus-visible and active states, in the light and the dark theme; the hover surface comes from the design tokens that are remapped for dark mode, never from a raw slate step that the dark theme maps to a light colour.

### US-046: Attachments load for everyone who may read the conversation

As a project member, I want a file posted in a project channel to open for me even when I am not an administrator, so that shared screenshots and documents are actually usable by the people doing the work.

**Acceptance Criteria:**
- AC-108: An attachment on a project-channel message is fetched successfully by every project member who may read that channel, not only by holders of `chat:moderate`; the route passes the caller's project membership into the same access decision the socket and message paths use.
- AC-109: A caller who may not read the message's channel still receives 404 with no existence information, for a project channel, a direct conversation and any other channel kind.
- AC-110: A fetch that fails for a network or server reason still renders the retryable placeholder with the file name, and Retry loads the file once the failure clears; no failure navigates the browser away from the app and no token reaches a URL.

### US-047: Unread is one truth and a new conversation arrives live

As a workspace member, I want the unread count to clear when I read a conversation and a newly granted channel to open straight away, so that I trust the badges and never have to reload to reach a conversation I was just given.

**Acceptance Criteria:**
- AC-111: Reading a conversation clears its unread indicator in the sidebar and in the conversation list without a reload, and it stays cleared: a server-side unread flag written before the read must not re-light the badge.
- AC-112: A conversation granted by a task assignment is openable immediately: following its link shows the conversation for a member with access instead of the no-channel-selected pane, and its row is present in the list and in the sidebar without a reload.
- AC-113: A grant or a rename reaches the sidebar as well as the open view, so the two panes never disagree about which conversations exist or what they are called.

### US-048: Replies and order show up live

As a workspace member, I want a thread reply and the most recent conversation to appear without a reload, so that I follow the conversation that is actually newest and never miss a reply someone sent me.

**Acceptance Criteria:**
- AC-114: The conversation list is one WhatsApp-style run of rows: every conversation the member can read - the seeded channels, the project channels and the direct messages - appears in a single sequence ordered by its latest message, newest first, with no per-kind section headings; the order is applied on first paint and again after every live message.
- AC-115: When another member replies in a thread, the reply count on the parent message in the open conversation updates live for every member of that channel, without a reload, whether or not their thread panel is open.
- AC-116: A reply that arrives while its thread panel is open appears in that panel at once for every member viewing it, and a reply for a different parent only updates that parent's count.

### Functional Requirements (new)

- FR-096: The sidebar MUST render one `Project chat` navigation item that links to the workspace chat root and MUST NOT render the seeded team channel as a separate sidebar row; the item MUST be marked current on both the chat root and a conversation route.
- FR-097: The chat root route MUST show the conversation list with no conversation selected and MUST NOT redirect to a default channel; its empty pane MUST offer the list and MUST NOT tell a member who has readable conversations to ask an administrator.
- FR-098: The seeded team channel MUST remain a readable conversation in that list with `kind: 'team'` and its unread state, so no stored row, index, permission or access rule changes with this amendment.
- FR-099: The chat screen MUST bound its height to the space below the application header so the document does not scroll while a conversation is read, and the conversation-list pane and the message pane MUST each own their scroll container.
- FR-100: The chat header MUST stay visible while the message pane scrolls, including while a search bar or a pinned-message panel is open.
- FR-101: The code card's Copy and Download controls MUST take their hover, focus and active surfaces from the design tokens that are remapped for both themes, so text contrast stays at least 4.5:1 in every state and theme.
- FR-102: The attachment download route MUST resolve the caller's project membership and pass it to the same channel access decision the socket and message paths use, so a project member without `chat:moderate` can fetch an attachment of a channel they may read, while a caller who may not read it keeps receiving 404.
- FR-103: After a conversation is marked read, the client MUST clear its unread indicator in the sidebar and in the conversation list without a reload, and MUST treat a server unread flag that predates the read as cleared.
- FR-104: A conversation granted or renamed while a member is connected MUST appear or update in both the conversation list and the sidebar without a reload, and a conversation named by the route MUST open even when the client has not listed it yet.
- FR-105: The conversation list MUST be a single merged, recency-ordered list - seeded channels, project channels and direct messages in one sequence with no per-kind headings - ordered by latest activity on first paint and after every live message, and a thread reply MUST update its parent's reply count live for every member of the channel, with the reply appended to an open thread panel.

### Non-Functional Requirements (new)

- NFR-042: Scroll containment MUST hold from 320px to 1920px and at 200% zoom without a horizontal scrollbar, and no interactive content may be hidden behind the fixed chat header or the mobile tab bar (`perfect-ui-rules.md` section 4, WCAG 2.4.11).
- NFR-043: Every state of the surfaces this amendment touches (default, hover, focus-visible, active, disabled) MUST meet at least 4.5:1 text contrast and 3:1 icon and focus-ring contrast in both themes, and the pairs MUST be verifiable from the token map in `client/src/index.css` (`perfect-ui-rules.md` section 4).
- NFR-044: A thread reply MUST reach every other member of the channel within 2 seconds p95 on a normal connection, and the count MUST be correct after a reload when the socket is unavailable; no polling interval may be added to achieve it.
- NFR-045: Unread reconciliation MUST NOT add a request per render: at most one read-state write per conversation open, no polling, and no re-fetch of the channel list on every navigation.
- NFR-046: The attachment route MUST keep its disclosure rules: 404 for a caller who may not read the message's channel, no existence leak, no token in a URL, and a readable retryable failure state otherwise.

### Edge Cases and Error States (new)

- EC-043: The `Project chat` item is clicked while a conversation is open → the chat root opens the list with no conversation selected; the conversation that was open stays in the list and in the socket room list; no channel id is added to the URL.
- EC-044: A member can read no conversation at all → the chat root shows an explicit empty state that names who can grant access, not a blank pane and not a broken layout.
- EC-045: A conversation is opened by route id before the client has listed it (deep link, freshly granted channel, bookmark) → the view resolves that conversation and opens it for a member with access; the no-channel-selected pane is shown only after access was checked and refused.
- EC-046: An attachment fetch fails because the browser is offline or the API answered an error → the retryable placeholder is shown with the file name, Retry fetches again and succeeds once the failure clears, and nothing navigates away from the app.
- EC-047: A reply arrives for a parent message that is older than the loaded page → no count is invented for a row that is not loaded; the parent is correct the next time its page is loaded.
- EC-048: A reply arrives for a different parent than the one whose thread panel is open → only the arriving parent's reply count changes; the open panel is left untouched.
- EC-049: A tap leaves the pointer-hover state applied on a touch device → the control does not stay in its hover surface and contrast remains at least 4.5:1 whether or not the hover state is applied (`perfect-ui-rules.md`, no sticky hover on touch).

### Anti-redundancy check (new)

| Need | Existing asset | Decision |
|---|---|---|
| A sidebar entry for the conversation list | `components/Sidebar.tsx` nav config and `features/chat/components/SidebarChannels.tsx` | modify: one nav item, the seeded team row leaves the sidebar |
| A conversation list with no conversation selected | `features/chat/views/ChatView.tsx` (list pane, `EmptyState`) | modify: drop the default-channel redirect, keep the list beside the empty pane |
| Conversation ordering by activity | `features/chat/lib/conversations.ts` `sortConversations`, server `listConversations` `byRecency` | reuse; apply on first paint instead of trusting payload order |
| A bounded, page-independent screen | the chat branch of `#main-content` in `components/Sidebar.tsx`, `components/ui/sidebar.tsx` `SidebarProvider`/`SidebarInset`, the `MessageList` scroll container | modify: bound the height and give each pane its own scroll owner |
| A header that stays put | `features/chat/components/ChatHeader.tsx` | modify |
| Readable action states in both themes | the token map in `client/src/index.css` (`inverse`, `inverse-text`, hover state layer), `DESIGN.md` conventions | reuse; the card stops using a raw slate step |
| Project membership for channel access | `server/src/utils/chatAccess.ts` `decideChannelAccess`, `server/src/utils/projectMembers.ts` | reuse; the attachment route starts passing the same fact |
| Read state | `features/chat/lib/readState.ts`, `useChatChannels.markRead`, `chatApi.markRead` | modify: reconcile the local read with the server flag |
| A granted or renamed conversation arriving live | `server/src/utils/chatGrant.ts`, `realtime/bus.ts` `emitToUser`, `features/chat/lib/conversations.ts` `grantChannel`/`renameChannel`, `useChatChannels.addChannel` | reuse; the sidebar subscribes to the same events |
| Opening a conversation the client has not listed | `chatApi.channels`, `chatApi.conversations`, `useChatChannels` | modify: resolve the route id before deciding there is no channel |
| A live thread update | `realtime/chatEvents.ts` with `channelRoom`, `chatMessageController.createMessageInChannel` (already increments `replyCount`), `useChatMessages` | modify: one event carrying the authoritative parent summary |
| Real-time transport | `socket.io` / `socket.io-client`, existing rooms | reuse; no second transport, no polling |

No new channel model, message store, transport, member model, upload path or notification path is introduced, and no dependency is added.

### Risks (new)

- RISK-013: Bounding the chat screen height can clip content on a short viewport, at high zoom or with the software keyboard open. Mitigation: `min-h-0` on every flex ancestor, the composer outside the scroll container, and a browser check at 320x568 and 200% zoom.
- RISK-014: Replacing the sidebar entry removes the only desktop shortcut to the seeded team channel. Mitigation: the channel stays a row inside the chat root list with its unread state, and the browser pass confirms it is reachable without a channel id in the sidebar.
- RISK-015: Removing the chat root redirect changes what `/{workspaceSlug}/chat` does for existing links and bookmarks. Mitigation: the root renders the list with an explicit empty pane, `/{workspaceSlug}/chat/{channelId}` is unchanged, and the documentation pass updates the README chat section.
- RISK-016: Patching a parent reply count from live events can drift if an event is missed while the socket is disconnected. Mitigation: `listMessages` re-derives the count on every load, and the thread event carries the authoritative post-increment count rather than a delta.
- RISK-017: One merged conversation list changes a surface that AC-056 and AC-065 fixed. Mitigation: the row rendering is extracted rather than rewritten, so previews, unread badges and the picker position are preserved, and the amendment to those two criteria is recorded in the note above.

### Traceability summary (new rows)

This amendment adds 6 user stories, 17 acceptance criteria (AC-100..AC-116), 10 functional requirements (FR-096..FR-105), 5 non-functional requirements (NFR-042..NFR-046), 7 edge cases (EC-043..EC-049) and 4 risks (RISK-013..RISK-016). Every new requirement maps to at least one acceptance criterion and to the plan section and tasks appended in `plan.md`/`tasks.md` (P28-P32); the rows are in `.sdrive/governance/real-time-chat/v2/traceability.json` with status `in_progress`, and their task column is provisional until Gate 2 approves the plan.

Two notes for the reviewer:

1. **Supersession.** AC-076's sidebar clause and AC-077's section scope are superseded by FR-096/FR-097 as described in the amendment note. Both keep their text and their number, and the matrix keeps their existing rows.
2. **Decided at Gate 1 (2026-10-28).** AC-114 and FR-105 order one merged list instead of two labelled segments, so AC-056 and AC-065 are amended for this view: every conversation - the seeded channel, a project channel or a direct message - is one row in one recency-ordered run, and each row still shows the avatar, name, last-message preview and unread badge through the single row component AC-056 introduced. The parts of AC-056/AC-065 that made the two segments read identically are therefore preserved; only the grouping goes.

### Research sources and assumptions

- **No external research available.** The `ux-ui-library`, Stackwise and Context7 MCP servers named by the update-proposal agent are not available in this environment, so no version-specific library documentation or component guidance was fetched for this amendment.
- Verified in-repository sources: `DESIGN.md` (token names, contrast expectation, scroll behaviour of wide content, touch targets), `perfect-ui-rules.md` (section 4 contrast and state layers, no sticky hover on touch, WCAG 2.4.11), `.sdrive/constitution.md` (CON-101..CON-204, CON-401, CON-703), `client/src/index.css` (the dark-theme remap of `slate-800`/`slate-900`, the `inverse` tokens and the hover state layer), `.sdrive/skills/socket-io/SKILL.md`, `.sdrive/skills/client-feature-module/SKILL.md`, and the chat module sources listed in the anti-redundancy table.
- Assumption recorded rather than invented: the seeded team channel keeps existing as a conversation (AC-102). The maintainer's instruction covered the sidebar entry, not the stored row, and renaming or deleting the stored row would touch indexes, permissions and the v2 backfill that AC-078 protects.
