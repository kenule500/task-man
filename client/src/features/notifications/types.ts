export type NotificationType =
  | 'task.assigned'
  | 'task.completed'
  | 'comment.mention'
  | 'comment.reply_on_my_task';

export interface AppNotification {
  _id: string;
  type: NotificationType;
  /** Task title when the notification was created (still readable if the task is deleted). */
  summary: string;
  readAt: string | null;
  createdAt: string;
  actor: { _id: string; name: string; avatarUrl?: string } | null;
  /** Null once the task has been deleted. */
  task: { _id: string; title: string; number: number | null; key: string } | null;
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
