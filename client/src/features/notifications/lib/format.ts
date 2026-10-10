import type { AppNotification, NotificationType } from '../types';

const VERBS: Record<NotificationType, string> = {
  'task.assigned': 'assigned you',
  'task.completed': 'completed',
  'comment.mention': 'mentioned you in',
  'comment.reply_on_my_task': 'commented on',
};

/** "WEB-12 Fix login", or just the title when the task has no key. */
export const notificationTarget = (notification: AppNotification): string => {
  const title = notification.task?.title ?? notification.summary;
  const key = notification.task?.key;
  return key ? `${key} ${title}` : title;
};

/** "Ada assigned you WEB-12 Fix login". */
export const notificationSentence = (notification: AppNotification): string =>
  `${notification.actor?.name ?? 'Someone'} ${VERBS[notification.type] ?? 'updated'} ${notificationTarget(notification)}`.trim();

/** Route that opens the task, or null once it was deleted or the workspace is gone. */
export const notificationHref = (notification: AppNotification): string | null =>
  notification.task && notification.workspace
    ? `/${notification.workspace.slug}/tasks?task=${encodeURIComponent(notification.task._id)}`
    : null;

/** Badge text: "9", "99+". */
export const formatUnreadCount = (count: number): string => (count > 99 ? '99+' : String(count));

/** Accessible name of the bell: "Notifications, 3 unread". */
export const bellLabel = (unreadCount: number): string =>
  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';
