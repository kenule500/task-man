import type { AppNotification, NotificationType } from '../types';

const VERBS: Record<NotificationType, string> = {
  'task.assigned': 'assigned you',
  'task.completed': 'completed',
  'comment.mention': 'mentioned you in',
  'comment.reply_on_my_task': 'commented on',
  'chat.mention': 'mentioned you in',
};

/** "WEB-12 Fix login", the channel name for chat, or just the summary when the subject is gone. */
export const notificationTarget = (notification: AppNotification): string => {
  if (!notification.task && notification.channel) return `#${notification.channel.name}`;
  const title = notification.task?.title ?? notification.summary;
  const key = notification.task?.key;
  return key ? `${key} ${title}` : title;
};

/** "Ada assigned you WEB-12 Fix login". */
export const notificationSentence = (notification: AppNotification): string =>
  `${notification.actor?.name ?? 'Someone'} ${VERBS[notification.type] ?? 'updated'} ${notificationTarget(notification)}`.trim();

/** Route that opens the task or chat channel, or null when the workspace is gone. */
export const notificationHref = (notification: AppNotification): string | null => {
  if (!notification.workspace) return null;
  const slug = notification.workspace.slug;
  if (notification.task) return `/${slug}/tasks?task=${encodeURIComponent(notification.task._id)}`;
  // Chat notifications carry a channel instead of a task
  if (notification.channel) return `/${slug}/chat/${encodeURIComponent(notification.channel._id)}`;
  return null;
};

/** Badge text: "9", "99+". */
export const formatUnreadCount = (count: number): string => (count > 99 ? '99+' : String(count));

/** Accessible name of the bell: "Notifications, 3 unread". */
export const bellLabel = (unreadCount: number): string =>
  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';
