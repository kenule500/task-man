import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellOff, CheckCheck } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, SegmentedControl, SkeletonList, Surface, Spinner } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  NotificationRow, useNotificationInbox, useOpenNotification, type InboxFilter,
} from '@/features/notifications';

const FILTERS: InboxFilter[] = ['all', 'unread'];

const InboxPage = () => {
  const { t } = useTranslation('nav');
  const [searchParams, setSearchParams] = useSearchParams();
  const filter: InboxFilter = searchParams.get('filter') === 'unread' ? 'unread' : 'all';
  const { items, unreadCount, loading, loadingMore, error, hasMore, loadMore, retry, markRead, markAllRead } =
    useNotificationInbox(filter);
  const openNotification = useOpenNotification(markRead);

  const changeFilter = (next: InboxFilter) => {
    setSearchParams(next === 'unread' ? { filter: 'unread' } : {}, { replace: true });
  };

  return (
    <div className="max-w-3xl space-y-5 pb-6">
      <PageHeader
        title={t('inbox.title')}
        description={t('inbox.description')}
        actions={(
          <Button
            type="button"
            variant="outline"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="h-11 gap-1.5 sm:h-9"
          >
            <CheckCheck className="size-4" aria-hidden /> {t('notifications.markAllRead')}
          </Button>
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label={t('inbox.show')}
          value={filter}
          onValueChange={changeFilter}
          options={FILTERS.map(value => ({
            value,
            label: value === 'unread' && unreadCount > 0 ? t('inbox.unreadCount', { count: unreadCount }) : t(`inbox.filters.${value}`),
          }))}
        />
      </div>

      <Surface padding="none" className="overflow-hidden">
        {loading ? (
          <SkeletonList bare avatar={false} trailing={false} rows={4} label={t('notifications.loading')} />
        ) : error && items.length === 0 ? (
          <ErrorState
            title={t('inbox.loadFailed')}
            reason={t('inbox.loadFailedReason')}
            nextStep={t('inbox.loadFailedNext')}
            action={<Button type="button" variant="outline" onClick={() => void retry()} className="h-11 sm:h-9">{t('common:retry')}</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BellOff />}
            title={filter === 'unread' ? t('inbox.emptyUnreadTitle') : t('inbox.emptyTitle')}
            description={filter === 'unread' ? t('inbox.emptyUnreadDescription') : t('inbox.emptyDescription')}
          />
        ) : (
          <ul className="divide-y divide-slate-100" aria-label={t('notifications.title')}>
            {items.map(notification => (
              <li key={notification._id}>
                <NotificationRow notification={notification} onSelect={openNotification} />
              </li>
            ))}
          </ul>
        )}
      </Surface>

      {error && items.length > 0 && (
        <p role="alert" className="text-sm text-danger-fg">{t('inbox.loadOlderFailed')}</p>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            aria-busy={loadingMore}
            className="h-11 min-w-40 gap-2 sm:h-9"
          >
            {loadingMore && <Spinner decorative />}
            {loadingMore ? t('nav:loading') : t('inbox.loadOlder')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default InboxPage;
