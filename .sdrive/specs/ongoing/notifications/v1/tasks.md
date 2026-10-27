> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# Tasks — Notifications (in-app, email and Web Push)

- **Feature:** `notifications`
- **Version:** v1
- **Machine-readable tasks:** `.sdrive/governance/notifications/v1/tasks.json`

Every task below is already implemented, so all boxes are checked. Requirements in brackets are the
`FR-###` / `NFR-###` ids defined in `.sdrive/governance/notifications/v1/spec.json`.

## P1 — Persistence and delivery rules

- [x] **T1.1 — Model in-app notifications.** `server/src/models/notificationModel.ts`: four `NOTIFICATION_TYPES`, recipient/workspace/actor/task references, 140-character summary, `readAt`, `(user, readAt, createdAt)` index, 90-day TTL index. _(FR-001, FR-011; AC-001, AC-007)_
- [x] **T1.2 — Model push subscriptions.** `server/src/models/pushSubscriptionModel.ts`: unique https endpoint (≤ 2048), base64url `p256dh`/`auth` (≤ 200), `userAgent`, `lastUsedAt`. _(FR-008; AC-014)_
- [x] **T1.3 — Write the pure notification rules.** `server/src/utils/notify.ts`: `addedAssignees`, `planTaskNotifications`, `planCommentNotifications`, `resolveMentions`, `wantsEmail`, `wantsPush` — no HTTP or database access, tested by `server/src/__tests__/notify.test.ts`. _(FR-002, FR-003, FR-004, FR-007, NFR-004; AC-002, AC-003, AC-004, AC-005, AC-012)_
- [x] **T1.4 — Implement delivery with the email channel.** `deliver`, `notifyTaskEvents`, `notifyComment`, `loadMentionCandidates`: membership filtering, one row per recipient, `notificationTemplate` email with escaped HTML, comment excerpt, `$addToSet` of the author into `Task.watchers`. _(FR-001, FR-003, FR-007, NFR-001, NFR-002, NFR-004; AC-001, AC-006, AC-012)_
- [x] **T1.5 — Implement the Web Push sender.** `server/src/utils/webPush.ts`: VAPID configuration, `getPublicKey`, `isPushConfigured`, `pushSentence`, `sendPushToUser` with 24 h TTL, pruning of gone subscriptions and no throwing. _(FR-009, NFR-003, NFR-004; AC-015)_

## P2 — HTTP surface (depends on P1)

- [x] **T2.1 — Serve the caller's notifications.** `listNotifications`, `markNotificationRead`, `markAllNotificationsRead` in `server/src/controllers/notificationController.ts`: caller scope, remaining-workspace filter, cursor paging, unread filter/total, projections, idempotent reads, 404 for foreign ids. _(FR-005, FR-006, NFR-001; AC-007, AC-008, AC-009)_
- [x] **T2.2 — Add the push endpoints.** `getPushPublicKey`, `subscribePush`, `unsubscribePush`: 503 while unconfigured, format validation, upsert by endpoint, caller-scoped delete. _(FR-008, NFR-003; AC-013, AC-014)_
- [x] **T2.3 — Store notification preferences on the profile.** `notifications` block in `server/src/models/userModel.ts` and `updateNotifications` in `server/src/controllers/profileController.ts` (boolean-only, partial update). _(FR-010; AC-011)_
- [x] **T2.4 — Declare the routes and mount the router.** `server/src/routes/notificationRoutes.ts` (six `protect`-only routes, push before `/:id/read`), `app.use('/api/notifications', …)` in `server/src/app.ts`, and `router.put('/notifications', protect, updateNotifications)` in `server/src/routes/profileRoutes.ts`. _(FR-005, FR-006, FR-008, FR-010; AC-007, AC-013)_

## P3 — Producer integration (depends on P1)

- [x] **T3.1 — Notify from the task write paths.** `notifyTaskEvents` calls in `server/src/controllers/taskController.ts` after create, update (previous snapshot), duplicate and bulk status change. _(FR-001, FR-002; AC-001, AC-002, AC-003)_
- [x] **T3.2 — Resolve mentions and notify comment readers.** `server/src/controllers/taskExtrasController.ts`: `resolveMentions` with `loadMentionCandidates`, mentions stored on the comment, `notifyComment` for mentions then the remaining owner/assignees/watchers, author subscribed as watcher. _(FR-003, FR-004; AC-004, AC-005, AC-006)_
- [x] **T3.3 — Cover the rules and the API with tests.** `server/src/__tests__/notify.test.ts`, `server/src/__integration__/notifications.test.ts`, `server/src/__integration__/push.test.ts`, `server/src/__integration__/profile.test.ts`. _(FR-001…FR-007; AC-001…AC-009)_

## P4 — Client surfaces (depends on P2)

- [x] **T4.1 — Build the notification feature module and bell.** `client/src/features/notifications` (types, api, `useNotificationFeed` with the 60 s visible-tab poll, focus refetch and the change event, `NotificationBell`, `NotificationRow`, `lib/format`) rendered from `client/src/components/Sidebar.tsx`. _(FR-012; AC-010)_
- [x] **T4.2 — Build the inbox page.** `client/src/pages/InboxPage.tsx` + `hooks/useNotificationInbox`: all/unread filters, 20-item pages with a cursor, mark-one/mark-all with optimistic updates, empty/loading/error states. _(FR-005, FR-006, FR-012; AC-007, AC-009, AC-010)_
- [x] **T4.3 — Toast new notifications and autocomplete mentions.** `hooks/useNewNotificationToasts`, `lib/newItems.ts`, `lib/mentions.ts`, used by the task comment box `client/src/features/tasks/components/TaskComments.tsx`. _(FR-012, FR-004; AC-010, AC-004)_
- [x] **T4.4 — Add device settings and logout cleanup.** `components/PushDeviceSettings.tsx`, `lib/push.ts`, `hooks/usePushSubscription.ts`, hosted by `client/src/pages/NotificationsPage.tsx`, plus `unsubscribeThisDevice` on logout in `client/src/hooks/useAuthGuard.ts`. _(FR-008, FR-012; AC-013, AC-014)_

## Verification

```bash
pnpm --filter server test notify
pnpm --filter server test:integration notifications push profile
pnpm --filter client test features/notifications
pnpm --filter client test InboxPage NotificationsPage
pnpm --filter server typecheck && pnpm --filter client typecheck && pnpm --filter client lint && pnpm --filter client build
```

Test-id legend: see `spec.md → Verification (retroactive)` (`TEST-001` … `TEST-006`).
