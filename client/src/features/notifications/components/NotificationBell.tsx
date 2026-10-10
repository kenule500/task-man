import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotificationFeed } from '../hooks/useNotificationFeed';
import { useOpenNotification } from '../hooks/useOpenNotification';
import { bellLabel, formatUnreadCount } from '../lib/format';
import NotificationRow from './NotificationRow';

export interface NotificationBellProps {
  /** Workspace the "View all" link opens the inbox of. */
  slug?: string;
}

/**
 * Bell with an unread badge in the top bar. It opens a panel with the latest notifications;
 * on phones the panel covers the whole screen.
 */
const NotificationBell = ({ slug }: NotificationBellProps) => {
  const [open, setOpen] = useState(false);
  const { items, unreadCount, loading, error, refresh, markRead, markAllRead } = useNotificationFeed();
  const close = useCallback(() => setOpen(false), []);
  const openNotification = useOpenNotification(markRead, close);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={bellLabel(unreadCount)}
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary md:ml-2 md:size-10"
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white"
          >
            {formatUnreadCount(unreadCount)}
          </span>
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 py-2 pl-4 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <SheetTitle className="flex-1 text-base font-semibold text-slate-900">Notifications</SheetTitle>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="h-11 gap-1.5 px-3 text-slate-700 sm:h-9"
          >
            <CheckCheck className="size-4" aria-hidden /> Mark all as read
          </Button>
          <SheetClose
            aria-label="Close notifications"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary sm:size-9"
          >
            <X className="size-5" aria-hidden />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">
          Your latest notifications. Choose one to open its task.
        </SheetDescription>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="space-y-4 p-4" aria-busy="true" aria-label="Loading notifications" role="status">
              {[0, 1, 2].map(row => <Skeleton key={row} className="h-10 w-full" />)}
            </div>
          ) : error && items.length === 0 ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="text-sm text-slate-700">We could not load your notifications.</p>
              <Button type="button" variant="outline" onClick={() => void refresh()} className="h-11 sm:h-9">Try again</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <BellOff className="size-8 text-slate-500" aria-hidden />
              <p className="text-sm font-medium text-slate-800">You are all caught up</p>
              <p className="text-sm text-slate-600">Assignments, mentions and comments on your tasks show up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100" aria-label="Latest notifications">
              {items.map(notification => (
                <li key={notification._id}>
                  <NotificationRow notification={notification} onSelect={openNotification} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {slug && (
          <div className="border-t border-slate-200 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Link
              to={`/${slug}/inbox`}
              onClick={close}
              className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-primary outline-none hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary sm:h-10"
            >
              View all
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default NotificationBell;
