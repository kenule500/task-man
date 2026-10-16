import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, CheckCheck, X } from 'lucide-react';
import { SkeletonList } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { useNotificationFeed } from '../hooks/useNotificationFeed';
import { useNewNotificationToasts } from '../hooks/useNewNotificationToasts';
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
  const { t } = useTranslation('nav');
  const [open, setOpen] = useState(false);
  const { items, unreadCount, loading, loaded, error, refresh, markRead, markAllRead } = useNotificationFeed();
  const navigate = useNavigate();
  const close = useCallback(() => setOpen(false), []);
  const openNotification = useOpenNotification(markRead, close);
  useNewNotificationToasts(items, {
    loaded,
    onOpen: openNotification,
    onOpenInbox: slug ? () => navigate(`/${slug}/inbox`) : undefined,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={bellLabel(unreadCount)}
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary md:ms-2 md:size-10"
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute end-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-solid px-1 text-[11px] font-semibold leading-none text-white"
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
        <div className="flex items-center gap-2 border-b border-slate-200 py-2 ps-4 pe-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <SheetTitle className="flex-1 text-base font-semibold text-slate-900">{t('notifications.title')}</SheetTitle>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="h-11 gap-1.5 px-3 text-slate-700 sm:h-9"
          >
            <CheckCheck className="size-4" aria-hidden /> {t('notifications.markAllRead')}
          </Button>
          <SheetClose
            aria-label={t('notifications.close')}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary sm:size-9"
          >
            <X className="size-5" aria-hidden />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">
          {t('notifications.description')}
        </SheetDescription>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <SkeletonList bare avatar={false} trailing={false} rows={3} label={t('notifications.loading')} />
          ) : error && items.length === 0 ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="text-sm text-slate-700">{t('notifications.loadFailed')}</p>
              <Button type="button" variant="outline" onClick={() => void refresh()} className="h-11 sm:h-9">{t('common:retry')}</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <BellOff className="size-8 text-slate-500" aria-hidden />
              <p className="text-sm font-medium text-slate-800">{t('notifications.emptyTitle')}</p>
              <p className="text-sm text-slate-600">{t('notifications.emptyDescription')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100" aria-label={t('notifications.latest')}>
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
              {t('notifications.viewAll')}
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default NotificationBell;
