import { t } from '@/i18n';
import type { AppNotification } from '../types';

/** "WEB-12 Fix login", or just the title when the task has no key. */
export const notificationTarget = (notification: AppNotification): string => {
  if (notification.type === 'chat.mention') {
    return notification.channel?.type === 'dm' ? t('nav:notifications.directMessage') : `#${notification.channel?.name ?? t('nav:notifications.chat')}`;
  }
  const title = notification.task?.title ?? notification.summary;
  const key = notification.task?.key;
  return key ? `${key} ${title}` : title;
};

/** "Ada assigned you WEB-12 Fix login". */
export const notificationSentence = (notification: AppNotification): string =>
  notification.type === 'ai.review_completed'
    ? t('ai:notification', { target: notificationTarget(notification) })
    : t(`nav:notifications.sentence.${notification.type.replace('.', '_')}`, {
    actor: notification.actor?.name ?? t('nav:notifications.someone'),
    target: notificationTarget(notification),
    defaultValue: t('nav:notifications.sentence.updated', {
      actor: notification.actor?.name ?? t('nav:notifications.someone'),
      target: notificationTarget(notification),
    }),
  }).trim();

/** Route that opens the task, or null once it was deleted or the workspace is gone. */
export const notificationHref = (notification: AppNotification): string | null =>
  notification.channel && notification.workspace
    ? `/${notification.workspace.slug}/chat/${encodeURIComponent(notification.channel._id)}`
    : notification.task && notification.workspace
    ? `/${notification.workspace.slug}/tasks?task=${encodeURIComponent(notification.task._id)}`
    : null;

/** Badge text: "9", "99+". */
export const formatUnreadCount = (count: number): string => (count > 99 ? '99+' : String(count));

/** Accessible name of the bell: "Notifications, 3 unread". */
export const bellLabel = (unreadCount: number): string =>
  unreadCount > 0 ? t('nav:notifications.bellUnread', { count: unreadCount }) : t('nav:notifications.title');
