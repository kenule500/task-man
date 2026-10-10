import { AtSign, CheckCircle2, MessageSquare, UserPlus, type LucideIcon } from 'lucide-react';
import { formatRelativeTime } from '@/features/tasks/lib/date';
import { cn } from 'cn';
import { notificationSentence } from '../lib/format';
import type { AppNotification, NotificationType } from '../types';

const ICONS: Record<NotificationType, { icon: LucideIcon; tile: string }> = {
  'task.assigned': { icon: UserPlus, tile: 'bg-blue-50 text-blue-700' },
  'task.completed': { icon: CheckCircle2, tile: 'bg-success-bg text-success-fg' },
  'comment.mention': { icon: AtSign, tile: 'bg-violet-50 text-violet-700' },
  'comment.reply_on_my_task': { icon: MessageSquare, tile: 'bg-slate-100 text-slate-700' },
};

export interface NotificationRowProps {
  notification: AppNotification;
  onSelect: (notification: AppNotification) => void;
}

/** One notification: type icon, sentence, relative time and an unread dot. The whole row is the button. */
const NotificationRow = ({ notification, onSelect }: NotificationRowProps) => {
  const { icon: Icon, tile } = ICONS[notification.type] ?? ICONS['comment.reply_on_my_task'];
  const unread = !notification.readAt;

  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', tile)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm text-slate-800 [overflow-wrap:anywhere]', unread && 'font-semibold')}>
          {notificationSentence(notification)}
        </span>
        <time dateTime={notification.createdAt} className="mt-0.5 block text-xs text-slate-600">
          {formatRelativeTime(notification.createdAt)}
        </time>
      </span>
      {unread && (
        <>
          <span aria-hidden className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" />
          <span className="sr-only">Unread</span>
        </>
      )}
    </button>
  );
};

export default NotificationRow;
