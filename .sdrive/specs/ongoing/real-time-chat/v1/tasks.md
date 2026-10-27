---
title: Real-time chat — execution tasks
status: backlog
version: v1
created: 2026-10-17
updated: 2026-10-17
---

# real-time-chat — execution tasks

| | |
|---|---|
| Feature | `real-time-chat` |
| Version | 1 |
| Plan | `.sdrive/specs/backlog/real-time-chat/v1/plan.md` |
| Governance | `.sdrive/governance/real-time-chat/v1/tasks.json` |

> **Tests are deliberately absent.** Authoring and running tests belongs to `/sdrive:test` (CON-401). These tasks describe production code
> only. Acceptance criteria are still linked through `traceability.json`, where the Test agent records the test IDs.
>
> **Dependencies are declared, not installed.** `/sdrive:apply` provisions a skill for every `action: "add"` dependency before writing code
> that uses it.

## P1 — Foundation: permissions, config, models

*No dependencies.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T1.1 | Add the `chat` permission area (`chat:read`, `chat:write`, `chat:moderate`, `chat:dm`) to `permissions.ts` and map each into `SYSTEM_ROLES` explicitly, without widening any existing role's non-chat permissions. | FR-033, NFR-007 | AC-002, AC-008, AC-028 |
| T1.2 | Add `chatRetentionDays` (default 365) and the socket origin allow-list to `config/env.ts`, returning them from `readConfig` and documenting them in `.env.example`. | NFR-013, NFR-016 | AC-029, AC-033 |
| T1.3 | Create `ChatChannel` with kind enum, `nameKey`, project reference, participants, `archived`, `lastMessageAt`, `lastMessageAuthor`, and the unique name-key index. | FR-001, FR-009 | AC-001, AC-003, AC-009 |
| T1.4 | Create `ChatMessage` with author, parent, mentions, attachments, `editedAt`, `deletedAt`, `pinnedAt`, plus the `(channel, createdAt, _id)` cursor index. | FR-009, FR-010, NFR-002 | AC-009, AC-010 |
| T1.5 | Create `ChatReaction` with the unique `(message, user, emoji)` index. | FR-016 | AC-016, AC-017 |
| T1.6 | Create `ChatRead` with the unique `(channel, user)` index and the last-read pointer. | FR-022 | AC-023 |
| T1.7 | Create `ChatPresence` with a TTL index on `seenAt` and a `connections` counter. | FR-029, FR-030 | AC-030, AC-031 |

## P2 — Channels and project lifecycle

*Depends on P1.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T2.1 | Implement `utils/chatAccess.ts`: pure visibility and write rules per channel kind, with a direct-channel non-participant resolving to `not_found`. | FR-003, FR-026 | AC-002, AC-027 |
| T2.2 | Implement team/general seeding per workspace plus project backfill that tolerates a duplicate-key race, mirroring `syncProjectsFromTasks`. | FR-002, FR-006 | AC-003, AC-006 |
| T2.3 | Add `GET /channels` with `protect`, `requirePermission('chat:read')` and a validator chain. | FR-003, NFR-007, NFR-010 | AC-002, AC-021 |
| T2.4 | Hook channel creation into `createProject`, reusing an existing channel for the same project rather than inserting a duplicate. | FR-004 | AC-004 |
| T2.5 | Hook channel archival into the `deleteProject` cascade, clearing no message rows and leaving history readable. | FR-005 | AC-005 |
| T2.6 | Mount the chat router under `workspaceRoutes` and add the dedicated chat rate-limit policy in `app.ts`. | NFR-007, NFR-009 | AC-002, AC-008 |

## P3 — Messaging core over Socket.IO

*Depends on P2.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T3.1 | Create the Socket.IO server in `realtime/socket.ts` and attach it to the HTTP server in `server.ts`, authenticating the handshake with the existing JWT and session lookup and closing sockets of revoked sessions. | NFR-005, NFR-006 | AC-008 |
| T3.2 | Validate every socket payload and apply a per-connection event throttle. | NFR-009, NFR-010 | AC-008 |
| T3.3 | Implement message creation: authorize, normalise mentions, persist, then emit to the channel room excluding the author's connection, and acknowledge only after the write. | FR-007, FR-008 | AC-007, AC-008 |
| T3.4 | Implement `GET /chat/:channelId/messages` with the `chatQuery` cursor helpers and a hard page cap of 50. | FR-010, NFR-002 | AC-010 |
| T3.5 | Update `lastMessageAt`/`lastMessageAuthor` on write and order the channel list by them. | FR-009 | AC-009 |
| T3.6 | Implement the REST send path used when no socket is available, sharing the controller with the socket handler. | FR-008, FR-032 | AC-008, AC-033 |

## P4 — Rich messaging

*Depends on P3.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T4.1 | Store threaded replies with a parent reference and project reply count plus last replier onto the parent. | FR-012, FR-013 | AC-012, AC-013 |
| T4.2 | Resolve `@mentions` against workspace members through `chatMentions`, persist user references, and notify through the existing `notify` path. | FR-014, FR-015 | AC-014, AC-015 |
| T4.3 | Implement reaction toggle and broadcast the aggregated state per emoji. | FR-016 | AC-016, AC-017 |
| T4.4 | Implement `PATCH` edit restricted to the author, recording `editedAt`. | FR-017 | AC-018 |
| T4.5 | Implement `DELETE` soft-delete that clears body and attachments, retains the row, and yields a tombstone. | FR-018 | AC-019 |
| T4.6 | Wire attachment upload through the existing `uploadMiddleware` and GridFS helpers, enforce channel access on download, and remove orphaned files when message creation fails. | FR-019, FR-020 | AC-020, AC-021 |
| T4.7 | Broadcast ephemeral typing events that are never persisted. | FR-021 | AC-022 |
| T4.8 | Implement `POST /chat/:channelId/read` and derive unread counts from the stored pointer. | FR-022 | AC-023 |
| T4.9 | Implement channel search that escapes the term, scopes to the workspace, paginates, and honours channel read access. | FR-023, NFR-011 | AC-024 |
| T4.10 | Implement pin and unpin for callers with `chat:write` plus the pinned-message listing. | FR-024 | AC-025 |

## P5 — Direct messages, moderation, retention

*Depends on P4.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T5.1 | Implement `POST /chat/direct` creating or reusing the single direct channel between exactly two members. | FR-025 | AC-026 |
| T5.2 | Enforce `404` for a direct channel the caller does not participate in, including for administrators. | FR-026 | AC-027 |
| T5.3 | Allow `chat:moderate` holders to delete any workspace message and record the action in the activity feed. | FR-027 | AC-028 |
| T5.4 | Enforce the retention window from configuration and exclude purged content from search. | FR-028, NFR-016 | AC-029 |

## P6 — Presence

*Depends on P3.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T6.1 | Track user-level presence from socket connection state, counting one user once across tabs and devices. | FR-029 | AC-030 |
| T6.2 | Refresh presence periodically so a TTL ages out an unclean disconnect instead of leaving a user permanently online. | FR-030 | AC-031 |

## P7 — Transport unification

*Depends on P3.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T7.1 | Emit activity-feed changes over the socket, computing the audience per permission with the existing `hiddenActions` helper. | FR-031, NFR-015 | AC-032 |
| T7.2 | Replay missed activity-feed events from the stored cursor after a reconnect, with no gaps and no duplicates. | FR-031, NFR-015 | AC-032 |
| T7.3 | Deliver the transport state to the client so chat and live updates report degraded mode instead of going stale silently. | FR-032 | AC-033 |
| T7.4 | Update `features/live` to consume socket events while preserving `merge`/`liveStore` semantics and keeping the poller as the fallback path. | FR-031, FR-032 | AC-032, AC-033 |

## P8 — Client chat UI

*Depends on P2, P4.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T8.1 | Scaffold `client/src/features/chat` with `index.ts` as the public entry, `api.ts` calling through `utils/api.ts`, and shared `types.ts`. | FR-001 | AC-001 |
| T8.2 | Implement `useChatChannels` covering the channel list, unread counts and seed trigger. | FR-022 | AC-023 |
| T8.3 | Implement `useChatMessages` with cursor paging, prepending older pages without scroll jump, and live append. | FR-010, FR-011 | AC-010, AC-011 |
| T8.4 | Build the channel view: header, message list and composer, rendering bodies as text or through the existing markdown path. | FR-007, NFR-012 | AC-007 |
| T8.5 | Build the thread side panel. | FR-013 | AC-013 |
| T8.6 | Build the mention autocomplete backed by workspace members. | FR-014 | AC-014 |
| T8.7 | Build the reaction bar with aggregated counts. | FR-016 | AC-017 |
| T8.8 | Build edit and delete affordances restricted to the author. | FR-017, FR-018 | AC-018, AC-019 |
| T8.9 | Build the attachment picker and message attachment preview. | FR-019, FR-020 | AC-020, AC-021 |
| T8.10 | Build the typing indicator and read/unread markers. | FR-021, FR-022 | AC-022, AC-023 |
| T8.11 | Build the search panel and the pinned-messages panel. | FR-023, FR-024 | AC-024, AC-025 |
| T8.12 | Add the direct-message entry point from the channel list. | FR-025 | AC-026 |
| T8.13 | Show presence in the channel header. | FR-029 | AC-030 |
| T8.14 | Make the chat surface keyboard operable with accessible names and a polite live region for incoming messages. | NFR-003 | AC-001, AC-007 |
| T8.15 | Make the chat layout mobile-first and usable in the existing mobile shell. | NFR-004 | AC-001 |
| T8.16 | Implement the empty, loading, error and offline states. | FR-011, FR-032 | AC-011, AC-033 |

## P9 — Navigation wiring

*Depends on P8.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T9.1 | Add the `CHAT` group to `Sidebar.tsx` between `Main Menu` and `General`, fed from the same permission-filtered channel source. | FR-003 | AC-001, AC-002 |
| T9.2 | Register the chat routes in `App.tsx` under `WorkspaceLayout` behind `PermissionRoute` with `chat:read`. | FR-003 | AC-002 |
| T9.3 | Keep the mobile tab bar coherent with the new sidebar group. | NFR-004 | AC-001 |

## P10 — Hardening and verification

*Depends on P7, P9.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T10.1 | Extend `vercel.json` `connect-src` with the socket origin, which is currently `'self'` and blocks `wss:` outright. | NFR-014 | AC-033 |
| T10.2 | Source socket origins from validated configuration and use `wss:` in production. | NFR-013, NFR-014 | AC-033 |
| T10.3 | Confirm the application-wide Helmet middleware covers the chat HTTP surface and that the socket upgrade does not bypass it. | NFR-008 | AC-008 |
| T10.4 | Confirm every chat route has a validator chain and every socket event validates its payload, with no interpolated query operators. | NFR-010, NFR-011 | AC-021, AC-024 |
| T10.5 | Confirm no chat component introduces `dangerouslySetInnerHTML` and that bodies render through the safe path. | NFR-012 | AC-007 |
| T10.6 | Run the typecheckers, the client linter, `node .sdrive/scripts/validate-governance.js`, and manually check keyboard navigation, narrow screens, and the connected/degraded transport states. | NFR-003, NFR-004 | AC-001, AC-033 |

## P11 — Project membership materialisation

*Depends on P10.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T11.1 | Add the `members` list to the `Project` model, indexed and initialised empty. | FR-035 | AC-038 |
| T11.2 | Implement `utils/projectMembers.ts`: pure merge, de-duplicate and remove helpers. | FR-035 | AC-040 |
| T11.3 | Add an assignee to the project's `members` when a task is assigned, idempotently. | FR-035 | AC-040 |
| T11.4 | Remove a departing member from every project's `members`. | FR-044 | AC-040 |
| T11.5 | Gate project channels by project membership, answering `404` for a non-member and letting `chat:moderate` through. | FR-003, FR-037, NFR-017 | AC-038, AC-039 |

## P12 — Team channel audience, naming and avatar

*Depends on P11.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T12.1 | Add `nameOverride`, `avatarFileId` and `avatarType` to the channel model. | FR-041 | AC-046 |
| T12.2 | Serve the team-channel list — avatar, display name, preview, unread — in one aggregation. | FR-038, FR-039, NFR-019 | AC-042, AC-043 |
| T12.3 | Mark project channels list-only so the sidebar shows just `team` and `general`. | FR-038 | AC-041 |
| T12.4 | Let a `chat:moderate` holder rename a team channel, falling back to the project name; `403` for everyone else. | FR-040, FR-041 | AC-044, AC-045, AC-046 |
| T12.5 | Let a `chat:moderate` holder set the avatar through the existing upload pipeline, keeping the previous one on rejection. | FR-040, FR-042, NFR-018 | AC-045, AC-047 |
| T12.6 | Stream the avatar to readers only; `404` otherwise. | FR-042 | AC-047 |
| T12.7 | Broadcast rename and avatar changes to open channel views. | FR-040 | AC-044 |

## P13 — Members navigation and team-channel list UI

*Depends on P12.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T13.1 | Rename the sidebar item to "Members". | FR-043 | AC-035 |
| T13.2 | Serve `/:slug/members` and redirect the previous `/:slug/team`. | FR-043 | AC-035, AC-036 |
| T13.3 | Limit `SidebarChannels` to `team` and `general`. | FR-038 | AC-041 |
| T13.4 | Build the group-chat list: avatar, name, preview, unread dot. | FR-038, FR-039 | AC-042 |
| T13.5 | Show an explicit empty state when no team channel is readable. | FR-038 | AC-043 |
| T13.6 | Build the channel settings dialog, rendered only for `chat:moderate`. | FR-040, FR-042 | AC-044, AC-045 |
| T13.7 | Wire the list into the chat screen, opening the selected channel and showing the archived banner. | FR-038, FR-005 | AC-042 |
| T13.8 | Keyboard accessibility for the list, dialog and avatar picker. | NFR-003 | AC-042 |

## P14 — Conversation ergonomics

*Depends on P13.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T14.1 | Lay the conversation out like a group chat: own messages right without own avatar, others left with avatar and name. | FR-045 | AC-048 |
| T14.2 | Exclude the signed-in user from the mention suggestion list. | FR-046 | AC-049 |
| T14.3 | Highlight `@mentions` that match a known member, segmenting text rather than injecting HTML. | FR-047, NFR-020 | AC-052 |
| T14.4 | Persist multiple attachments on a message, refusing an id uploaded to another channel. | FR-048 | AC-053, AC-054 |
| T14.5 | Accept several files in the attachment picker, uploading each independently. | FR-048 | AC-053 |
| T14.6 | Order the side panel: New direct message, then DMs, then team channels. | FR-049 | AC-050 |
| T14.7 | Return server-side unread state per channel for the default-channel badge. | FR-050 | AC-055 |
| T14.8 | Return an accurate per-channel member count by channel kind. | FR-051 | AC-051 |
| T14.9 | Fix the `Path nameKey is required` error on task creation (atomic `updateOne` instead of load-and-save). | FR-035 | AC-040 |

## P15 — Direct-message segmentation

*Depends on P14.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T15.1 | Extract `ConversationSection`: heading, row, loading/empty copy, footline, unread marker and keyboard handling. | FR-053, NFR-022 | AC-058 |
| T15.2 | Render team channels through `ConversationSection`, keeping the rename/avatar settings affordance. | FR-053 | AC-058 |
| T15.3 | Add `DirectMessageList` and render direct rows with the other participant's avatar and name. | FR-054 | AC-057, AC-061 |
| T15.4 | Serve `GET /chat/conversations` with `{ directs, teams }`, previews and unread state, in one request. | FR-052, NFR-021 | AC-056, AC-059 |
| T15.5 | Resolve each direct card's name and avatar from the other participant, with the `Direct message` fallback. | FR-054 | AC-061 |
| T15.6 | Compose the panel as New direct message → Direct messages → Team channels, with per-section loading and empty copy. | FR-056, FR-057 | AC-056, AC-059 |
| T15.7 | Add a newly created direct conversation to the direct section in place and select it. | FR-057 | AC-060 |
| T15.8 | Extract the New direct message picker from `ChannelList` and remove the empty-list shim in the chat screen. | FR-057 | AC-059, AC-060 |
| T15.9 | Run the typecheckers, the client linter and the governance validator, then check the panel at 320px and by keyboard. | NFR-022 | AC-058 |

## P16 — Conversation list polish and honest counts

*Depends on P15.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T16.1 | Order both sections by last-message time, never-used last, then name, in the conversations query. | FR-058, NFR-023 | AC-062 |
| T16.2 | Return an unread count per card and cap the rendered value at `9+`. | FR-060, FR-058 | AC-064 |
| T16.3 | Patch the affected row's preview, count and position from the existing socket message event. | FR-059, NFR-025 | AC-063 |
| T16.4 | Rebuild `New direct message` as a 44px row with icon, label and a labelled teammate list. | FR-061, FR-062, NFR-024 | AC-065, AC-066 |
| T16.5 | Add the project's creator to `Project.members` when the project is created. | FR-064 | AC-067 |
| T16.6 | Backfill the creator into existing projects during the channel backfill. | FR-064 | AC-067 |
| T16.7 | Compute the member count by kind: project members, two for direct, workspace members for the defaults. | FR-063 | AC-067, AC-068 |
| T16.8 | Return `memberCount` from `startDirect` and drop the workspace-count fallback in the header. | FR-063 | AC-068 |
| T16.9 | Show the other participant's avatar and name in a direct conversation's header. | FR-065 | AC-069 |
| T16.10 | Run the typecheckers, the client linter and the governance validator, then check the 44px control at 320px and by keyboard. | NFR-024 | AC-065, AC-066 |

## P17 — Search as a find widget

*Depends on P16.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T17.1 | Build `SearchBar`: input, position counter, previous/next, close, `Ctrl/Cmd+F` open and `Esc` close. | FR-066 | AC-070 |
| T17.2 | Build `SearchResults`: labelled listbox of option rows with author, date and highlighted snippet. | FR-067, FR-071, NFR-026 | AC-071, AC-075 |
| T17.3 | Add `lib/search.ts`: `nextIndex` with wrapping, `formatCounter`, `segmentSnippet`. | FR-067, NFR-027 | AC-071 |
| T17.4 | Replace the `SearchPanel` dropdown with the bar and the result list in `ChatView`. | FR-066 | AC-070 |
| T17.5 | Wire the keyboard contract and keep focus in the input with `aria-activedescendant`. | FR-068, FR-071 | AC-072, AC-075 |
| T17.6 | Page results on demand with the cursor, discarding stale responses. | FR-069, NFR-028 | AC-073 |
| T17.7 | Jump to the selected message: anchors, scroll, temporary highlight, load older pages when missing. | FR-070, NFR-028 | AC-074 |
| T17.8 | Accessibility polish: polite counter, focus ring, non-colour selection cue. | FR-071 | AC-075 |
| T17.9 | Run the typecheckers, the client linter and the governance validator, then keyboard-check a two-page match set at 320px. | NFR-026 | AC-070, AC-072 |

## P18 — Review remediation

*Depends on P17. Added by `/sdrive:review` on 2026-10-18.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T18.1 | Perform the CON-703 browser pass on the chat routes with a seeded local MongoDB: channel list, conversation, thread overlay and find widget at 320/768/1024px and by keyboard. | NFR-004 | AC-001 |

## P19 — Review remediation (coverage and spec drift)

*Depends on P18. Added by `/sdrive:review` on 2026-10-19.*

| ID | Task | Requirements | Acceptance criteria |
|---|---|---|---|
| T19.1 | Point the dashboard “Invite teammate” step at `/{slug}/members` instead of the retired `/{slug}/team` link, and update `GetStartedChecklist.test.tsx` to assert the new href. | FR-043 | AC-036 |
| T19.2 | Document the chat surface in `README.md`: how to reach it, the `chat:*` permissions, and that search is channel-scoped and excludes thread replies. | FR-043 | AC-035, AC-036 |

