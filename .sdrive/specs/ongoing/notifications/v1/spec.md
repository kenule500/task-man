> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Notifications (in-app, email and Web Push)

- **Feature:** `notifications`
- **Version:** v1
- **Status:** implemented (documented after the fact from `server/src` and `client/src`)

## Overview

### Problem

Tasks change hands without the people involved noticing. Assignment, completion and comments
all happen in a task the recipient may not have open, and before this feature the only way to
learn about them was to reopen the right board. Task writes therefore needed a fan-out step
that records *what happened to whom*, and — when the recipient allows it — reaches them
outside the app.

### Solution

Recorded task and comment events are converted into recipient plans by **pure rules** in
`server/src/utils/notify.ts`, stored as one `Notification` document per recipient
(`server/src/models/notificationModel.ts`) and then delivered over the channels the recipient
enabled: Web Push (`server/src/utils/webPush.ts`) and email
(`server/src/utils/sendEmail.ts` + `notificationTemplate` in `server/src/utils/emailTemplates.ts`).

Reads are a per-user HTTP API — `server/src/routes/notificationRoutes.ts` mounted at
`/api/notifications` in `server/src/app.ts` — consumed by a bell in the app shell
(`client/src/features/notifications/components/NotificationBell.tsx`, rendered from
`client/src/components/Sidebar.tsx`), an inbox page (`client/src/pages/InboxPage.tsx`), toasts for
new unread items (`client/src/features/notifications/hooks/useNewNotificationToasts.ts`) and a
device panel (`client/src/pages/NotificationsPage.tsx`).

### Target audience

Signed-in workspace members who are assigned tasks, mentioned in comments, own a commented task
or watch a task they commented on; plus the operators who configure the mail provider and VAPID
keys for the API.

### Assumptions

- `notifications.weeklyDigest` is stored and returned by `PUT /api/profile/notifications`, but no
  digest sender, scheduler or cron entry exists anywhere in `server/src` (verified by searching for
  `weeklyDigest`: only `models/userModel.ts`, `controllers/profileController.ts` and
  `__integration__/profile.test.ts` match). The switch is stored-only.
  `assumption: true`
- There is no websocket or background worker in this project
  (`.sdrive/context/architecture-context.md`), so "live" delivery is HTTP polling: the bell polls
  every 60 s while the tab is visible. `assumption: true`
- Web Push to an iOS browser requires the PWA to be installed to the Home Screen; this is encoded
  in `client/src/features/notifications/lib/push.ts` (`isPushSupported`), not verified on a device
  during onboarding. `assumption: true`

### Out of scope

- Sending the weekly digest email (preference exists, sender does not).
- Per-workspace notification preferences — the switches on
  `server/src/models/userModel.ts#notifications` are global to the user.
- Event types other than the four in `NOTIFICATION_TYPES`
  (`server/src/models/notificationModel.ts`): `task.assigned`, `task.completed`,
  `comment.mention`, `comment.reply_on_my_task`.

## User stories and acceptance criteria

### US-001 — Be told when a task is assigned to me

- **Role:** workspace member
- **Want:** an in-app notification when someone adds me as an assignee, plus email or device
  notification when I allow it
- **Benefit:** I start work that is waiting for me without polling the board

| AC | Acceptance criterion |
| --- | --- |
| AC-001 | Adding a member to `task.assignees` creates exactly one `task.assigned` notification for that member and never for the actor (`planTaskNotifications` filters the actor out). |
| AC-002 | Only the assignees *added* by an update are notified — `addedAssignees(previous.assignees, next.assignees)` — so saving an unchanged list notifies nobody. |

### US-002 — Know when work that concerns me is completed

- **Role:** task owner, assignee or watcher
- **Want:** a notification when a task becomes completed
- **Benefit:** I can confirm the work myself instead of discovering the change later

| AC | Acceptance criterion |
| --- | --- |
| AC-003 | Moving a task into `completed` notifies owner, assignees and watchers once each, excluding the actor. Creating a task that is already completed, or saving a completed task again, notifies nobody (the rule only fires when `previous.status !== 'completed'`). |

### US-003 — Reach teammates with @mentions in comments

- **Role:** member commenting on a task
- **Want:** the members I tag to be notified, and the task's other people to hear about the
  comment once
- **Benefit:** the right people see my question without a second channel

| AC | Acceptance criterion |
| --- | --- |
| AC-004 | `resolveMentions` (`server/src/utils/notify.ts`) tags `@First Last` and a `@first` that no other member shares, case-insensitively, only at a word boundary, longest label first, and ignores names that are not members of the workspace. |
| AC-005 | Mentioned members receive `comment.mention`; the remaining owner/assignees/watchers receive `comment.reply_on_my_task` once each; the author is never notified, even when tagging themself. |
| AC-006 | Commenting subscribes the author as a watcher (`notifyComment` does `$addToSet: { watchers: … }`), and comment emails carry the comment excerpt (`excerpt: comment.text`, used only for the two comment types). |

### US-004 — Read and clear my own notifications

- **Role:** signed-in user
- **Want:** a bell with the unread total, an inbox list, and mark-one / mark-all
- **Benefit:** I catch up quickly and clear the badge

| AC | Acceptance criterion |
| --- | --- |
| AC-007 | `GET /api/notifications` returns the caller's notifications newest first with `nextBefore` and `unreadCount`, defaults to 20 items, caps `limit` at 50, supports `unread=1` and answers 400 for a malformed `before` cursor. |
| AC-008 | `POST /api/notifications/:id/read` is idempotent and answers 404 for an unknown id — and for another user's notification, which stays unread. |
| AC-009 | `POST /api/notifications/read-all` marks only the caller's unread notifications and answers `unreadCount: 0`. |
| AC-010 | The bell polls every 60 s while the tab is visible, refetches on focus, shows `99+` above 99 unread, and announces a read so every mounted list refetches (`announceNotificationsChanged` / `useNotificationsChanged`). |

### US-005 — Choose how I am notified

- **Role:** signed-in user
- **Want:** switches for email, per-event email and device notifications
- **Benefit:** I receive what is useful and nothing else

| AC | Acceptance criterion |
| --- | --- |
| AC-011 | `PUT /api/profile/notifications` accepts only real booleans for `email`, `taskAssigned`, `taskCompleted`, `weeklyDigest`, `push`, updates just the provided keys, and answers 400 for any other value. |
| AC-012 | Email is sent only when `notifications.email` **and** the matching event flag allow it (`wantsEmail`: `taskCompleted` for completion, `taskAssigned` otherwise). Push is sent unless `notifications.push === false` (`wantsPush`). |

### US-006 — Get device notifications

- **Role:** user on a supported browser
- **Want:** to switch Web Push on for this device and off again
- **Benefit:** I notice work that needs me even when the app is closed

| AC | Acceptance criterion |
| --- | --- |
| AC-013 | `GET /api/notifications/push/public-key` reports the key with `enabled`; `POST /api/notifications/push/subscribe` answers 503 while the VAPID configuration is incomplete. |
| AC-014 | Subscribing upserts by endpoint, requiring an https endpoint ≤ 2048 characters and base64url `p256dh`/`auth` keys ≤ 200 characters; an endpoint already in use moves to the caller. |
| AC-015 | Sending push deletes subscriptions the push service reports as gone (404/410), refreshes `lastUsedAt` for the others, and never throws. |

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Task create/update handlers record in-app notifications for assignment and completion by calling `notifyTaskEvents` with the task and, on update, the previous assignee/status snapshot (`server/src/controllers/taskController.ts` call sites: create, update, duplicate, bulk status change). |
| FR-002 | The audience is derived from the previous snapshot: only newly added assignees, completion only on the transition into `completed`, owner/assignees/watchers de-duplicated, actor removed. |
| FR-003 | Comment handlers resolve mentions and record mention + follow-up notifications, and commenting adds the author to the task's watchers. |
| FR-004 | Mentions are resolved against current workspace member names (`resolveMentions` + `loadMentionCandidates`, candidates loaded from `Workspace.members` at comment time). |
| FR-005 | `GET /api/notifications` serves the caller's notifications across the workspaces they still belong to, newest first, with cursor pagination, an unread filter, an unread total and projected actor/task/workspace data (task key computed as `<PROJECT KEY|TM>-<number>`). |
| FR-006 | One notification or all of the caller's notifications can be marked read; both are idempotent, caller-scoped, and 404 for an id that is not the caller's. |
| FR-007 | Email is delivered to recipients whose preferences allow it, through `notificationTemplate` (per-type subject and sentence, escaped HTML). |
| FR-008 | A browser's push subscription can be registered and removed, refused with 503 while VAPID is unconfigured, validating endpoint and key format. |
| FR-009 | Web Push is sent to every device of a recipient with a 24 h TTL, pruning 404/410 subscriptions and refreshing `lastUsedAt`. |
| FR-010 | Channel preferences (`email`, `taskAssigned`, `taskCompleted`, `weeklyDigest`, `push`) live on the user document with defaults `true/true/false/true/true` and are updated through `PUT /api/profile/notifications`. |
| FR-011 | In-app notifications are removed by MongoDB after 90 days through the `expireAfterSeconds` TTL index on `Notification.createdAt`. |
| FR-012 | The client surfaces notifications: bell + unread badge, inbox page with all/unread filters and paging, toasts for new unread items (≤ 3, then a "+N more" toast), mention autocomplete in the comment box, and the device settings panel. |

## Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-001 | Every notification read/write is scoped to the authenticated user, and delivery skips recipients who left the workspace (`deliver` intersects the plan with `workspace.members`). *(CON-106, CON-512)* |
| NFR-002 | User-controlled text is rendered as text: `emailTemplates.ts#escapeHtml` for the HTML part, React text nodes on the client. No `dangerouslySetInnerHTML` is used. *(CON-517)* |
| NFR-003 | VAPID and mail credentials are read from the environment at call time and never logged; `readVapid` returns `null` unless all three values are present and the subject is `mailto:` or `https:`. *(CON-206, CON-519)* |
| NFR-004 | Fan-out is best-effort: the in-app row is written first, then channels are attempted with `Promise.allSettled`; every error is logged, never thrown, so a mail or push outage cannot fail the task write. *(CON-105)* |

## Edge cases

| ID | Case | Expected behaviour |
| --- | --- | --- |
| EC-001 | Push unsupported / VAPID missing / permission denied. | `PushDeviceSettings` shows `unsupported`, `unavailable` or `denied`; `public-key` answers `enabled: false` and subscribe answers 503, while in-app rows and email keep working. |
| EC-002 | The only new assignee is the actor. | Nothing is created — the actor is filtered out of every plan. |
| EC-003 | A recipient leaves the workspace before delivery. | `deliver` intersects planned ids with `workspace.members`, so nothing is stored or sent for them. |
| EC-004 | A user comments on their own task and mentions only themself. | No notification is created for that author; the comment and its resolved mentions are still stored. |
| EC-005 | A later page contains unread items older than the newest one already seen. | `findNewUnread` ignores them (`timeOf(item) >= seen.latest`), so paging deeper does not toast history. |

## Dependencies

| Name | Type | Notes |
| --- | --- | --- |
| `web-push` | library | VAPID signing and sending (`server/src/utils/webPush.ts`). |
| `nodemailer` | library | SMTP transport, used only when `EMAIL_HOST` is set (`server/src/utils/sendEmail.ts`). |
| Resend HTTP API | service | Preferred provider through `RESEND_API_KEY`; works on serverless hosts. |
| Mongoose / MongoDB | internal | `Notification`, `PushSubscription`, TTL index. |
| Client service worker (PWA) | internal | `client/src/pwa` + `usePushSubscription`. |
| VAPID key pair | external | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. |

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-001 | A slow provider delays the task write, because delivery is awaited in the request. | Channels are attempted in parallel with `Promise.allSettled`; failures are logged only and the in-app row already exists. |
| RISK-002 | A mention pattern could tag the wrong member when two people share a first name. | `resolveMentions` accepts a first name only when it is unique among members and prefers the longest label. |
| RISK-003 | The collection grows with every recipient of every event. | TTL index (90 days) plus a 50-row page cap on the list endpoint. |

## Verification (retroactive)

| Test id | Test file | What it covers |
| --- | --- | --- |
| TEST-001 | `server/src/__tests__/notify.test.ts` | Pure rules (`addedAssignees`, `planTaskNotifications`, `planCommentNotifications`, `resolveMentions`, `wantsEmail`), template escaping, and the delivery step with mocked mail/push. |
| TEST-002 | `server/src/__integration__/notifications.test.ts` | Access, assignment, completion, comments/mentions, cursor paging, mark-read isolation, departure from a workspace. |
| TEST-003 | `server/src/__integration__/push.test.ts` | Push disabled without VAPID keys, subscription upsert/removal, delivery on notification. |
| TEST-004 | `server/src/__integration__/profile.test.ts` | `PUT /api/profile/notifications`: partial update, defaults and non-boolean rejection. |
| TEST-005 | `client/src/features/notifications/__tests__/NotificationBell.test.tsx`, `newToasts.test.tsx`, `PushDeviceSettings.test.tsx`, `pushLib.test.ts`, `format.test.ts`, `mentions.test.ts` | Bell badge/menu, toast collapsing, device panel states, push state machine, sentence formatting, mention autocomplete. |
| TEST-006 | `client/src/pages/__tests__/InboxPage.test.tsx`, `client/src/pages/__tests__/NotificationsPage.test.tsx` | Inbox filters, mark-read flows and the settings page rendering the device panel. |

Commands

```bash
pnpm --filter server test notify                # TEST-001
pnpm --filter server test automationEngine     # (adjacent feature, not part of this one)
pnpm --filter server test:integration notifications push   # TEST-002, TEST-003
pnpm --filter server test:integration profile              # TEST-004
pnpm --filter client test features/notifications            # TEST-005
pnpm --filter client test InboxPage NotificationsPage       # TEST-006
```

> No `AC-###` identifiers appear in the test names of these files; the acceptance criteria above
> were mapped to them by reading the tests during onboarding. CON-405 (test names carry the AC id)
> is therefore **not** satisfied by the existing suite and is recorded here as a gap rather than
> a claim.
