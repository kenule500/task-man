export type NotificationType =
  | 'task.assigned'
  | 'task.completed'
  | 'comment.mention'
  | 'comment.reply_on_my_task'
  | 'chat.mention';

export interface AppNotification {
  _id: string;
  type: NotificationType;
  /** Task title or message excerpt when the notification was created (readable if the subject is gone). */
  summary: string;
  readAt: string | null;
  createdAt: string;
  actor: { _id: string; name: string; avatarUrl?: string } | null;
  /** Null once the task has been deleted, and null for chat notifications. */
  task: { _id: string; title: string; number: number | null; key: string } | null;
  /** Set for chat notifications, which have no task to open. */
  channel?: { _id: string; name: string } | null;
  workspace: { _id: string; slug: string; name: string } | null;
}

export interface NotificationPage {
  items: AppNotification[];
  /** Cursor for the next (older) page; null on the last page. */
  nextBefore: string | null;
  /** Unread notifications in total, not just on this page. */
  unreadCount: number;
}

export type InboxFilter = 'all' | 'unread';
