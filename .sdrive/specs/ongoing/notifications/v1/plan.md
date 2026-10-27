> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Plan — Notifications (in-app, email and Web Push)

- **Feature:** `notifications`
- **Version:** v1
- **Machine-readable plan:** `.sdrive/governance/notifications/v1/plan.json`

## Architecture

**Approach.** Event-driven fan-out inside the API process. Task and comment handlers keep their
existing write path and then call a notify helper (`server/src/utils/notify.ts`) *after* the write.
The helper derives the recipient plan with pure, unit-testable functions, inserts one `Notification`
row per recipient, and only then attempts the optional channels (Web Push, email) per recipient
according to the switches stored on the user document. Reads are a separate, user-scoped router.
Because the project has no queue or worker (`.sdrive/context/architecture-context.md`), delivery is
awaited inside the request and every failure is swallowed and logged.

**Referenced requirements:** `FR-001`–`FR-012`, `NFR-001`–`NFR-004` (all, see
`plan.json → architecture.referencedRequirementIds`).

### Components

| Component | Action | Role |
| --- | --- | --- |
| `server/src/models/notificationModel.ts` | create | `Notification` schema, four types, TTL 90 days, `(user, readAt, createdAt)` index. |
| `server/src/models/pushSubscriptionModel.ts` | create | `PushSubscription` schema, unique https endpoint, base64url keys. |
| `server/src/utils/notify.ts` | create | Pure rules + `deliver`, `notifyTaskEvents`, `notifyComment`, `loadMentionCandidates`. |
| `server/src/utils/webPush.ts` | create | VAPID configuration, `pushSentence`, `sendPushToUser`. |
| `server/src/utils/emailTemplates.ts` | modify | Adds `notificationTemplate` (escaped HTML). |
| `server/src/utils/sendEmail.ts` | reuse | Provider selection reused unchanged. |
| `server/src/controllers/notificationController.ts` | create | List/mark-read + push endpoints, all scoped to `req.user`. |
| `server/src/routes/notificationRoutes.ts` | create | Six routes behind `protect`; mounted at `/api/notifications`. |
| `server/src/controllers/taskController.ts` | modify | Calls `notifyTaskEvents` after create/update/duplicate/bulk. |
| `server/src/controllers/taskExtrasController.ts` | modify | Resolves mentions, stores them, calls `notifyComment`. |
| `server/src/controllers/profileController.ts` | modify | `updateNotifications` boolean validation. |
| `server/src/models/userModel.ts` | modify | `notifications` preference block. |
| `client/src/features/notifications/` | create | Feature module (api, hooks, lib, components). |
| `client/src/pages/InboxPage.tsx` | create | Inbox screen (filters, paging, mark-all). |
| `client/src/pages/NotificationsPage.tsx` | create | Settings screen hosting the device panel. |
| `client/src/components/Sidebar.tsx` | modify | Renders the bell. |
| `client/src/hooks/useAuthGuard.ts` | modify | Unsubscribes this device on logout. |
| `client/src/features/live/hooks/useLiveChanges.ts` | modify | Announces notification changes so the bell refreshes. |

## Data model

### `Notification` (create)

`user` (ObjectId → User), `workspace` (ObjectId → Workspace), `actor` (ObjectId → User),
`type` (enum of `task.assigned`, `task.completed`, `comment.mention`, `comment.reply_on_my_task`),
`task` (ObjectId → Task), `summary` (String ≤ 140, the task title at the time), `readAt` (Date,
nullable), `createdAt` (timestamps, TTL 90 days).
Indexes: `{ user: 1, readAt: 1, createdAt: -1 }` and `{ createdAt: 1 }` with
`expireAfterSeconds = 90 * 24 * 60 * 60`.

### `PushSubscription` (create)

`user` (indexed), `endpoint` (String ≤ 2048, unique, must parse as `https:`), `keys.p256dh` and
`keys.auth` (base64url, ≤ 200), `userAgent` (≤ 300), `lastUsedAt` (Date), `createdAt`.

### `User` (update)

`notifications.email` (true), `notifications.taskAssigned` (true), `notifications.taskCompleted`
(false), `notifications.weeklyDigest` (true), `notifications.push` (true) in
`server/src/models/userModel.ts`.

### `Task` (update, field unchanged)

`watchers` already existed; this feature writes it (`notifyComment` adds the comment author).
Field action is `no_change` — the plan records the writer, not the owner.

### Flow

1. A task write stores the task, then calls `notifyTaskEvents(req, task, previous?)`; a comment
   write calls `notifyComment(req, task, { text, mentions })`.
2. Pure planners produce `PlannedNotification[]` (`{ type, userIds }`).
3. `deliver()` keeps only ids that are current `workspace.members`, inserts one row per pair
   (`insertMany`, summary truncated to 140), and marks whether the rows were stored.
4. Per recipient: `sendPushToUser` when VAPID is configured and `wantsPush(prefs)`; `sendEmail`
   with `notificationTemplate` when `wantsEmail(prefs, type)`.
5. Reads build their filter from `req.user._id` plus the workspaces the user is still a member of,
   and both mark-read paths match on `user: req.user._id`.
6. Push endpoints upsert/delete `PushSubscription` rows by endpoint; delivery prunes 404/410.

## API contracts

| Method | Path | Action | Auth | Requirements |
| --- | --- | --- | --- | --- |
| GET | `/api/notifications` | create | required | FR-005, FR-011, NFR-001 |
| GET | `/api/notifications/push/public-key` | create | required | FR-008, NFR-003 |
| POST | `/api/notifications/push/subscribe` | create | required | FR-008 |
| POST | `/api/notifications/push/unsubscribe` | create | required | FR-008 |
| POST | `/api/notifications/read-all` | create | required | FR-006, NFR-001 |
| POST | `/api/notifications/:id/read` | create | required | FR-006, NFR-001 |
| PUT | `/api/profile/notifications` | create | required | FR-010 |

Routes are declared in `server/src/routes/notificationRoutes.ts` (comment in the file: "A user's own
notifications across workspaces: no workspace permission, every query filters by the caller") and
`server/src/routes/profileRoutes.ts:25`. The router is mounted with
`app.use('/api/notifications', notificationRoutes)` in `server/src/app.ts:180`. `GET /push/public-key`
is declared before `POST /:id/read` so `push` is never parsed as an id.

## Security considerations

See `plan.json → securityConsiderations` (NFR-001…NFR-004). Summary: caller-scoped queries and
workspace-membership filtering (CON-106, CON-512); escaped email HTML and React text rendering
(CON-517); VAPID/mail configuration read at call time and never logged (CON-206, CON-519);
best-effort delivery that cannot fail the user's write (CON-105).

## Performance considerations

See `plan.json → performanceConsiderations`: indexed reads with `limit + 1` and a single unread
count; one `Project` lookup per page for task keys; parallel, best-effort sends; 60-second
visible-tab polling; TTL index instead of a cleanup job.

## Dependencies

`web-push`, `nodemailer`, Resend HTTP API, Mongoose (incl. TTL index), the client service worker and
the VAPID key pair — details in `plan.json → dependencies`.

## Risks

Delivery latency inside the request; endpoint uniqueness moving a subscription between accounts
(deliberate); name-based mentions changing meaning after a rename. Mitigations in
`plan.json → risks`.
