import { useSearchParams } from 'react-router-dom';
import { BellOff, CheckCheck, Loader2 } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, SegmentedControl, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  NotificationRow, useNotificationInbox, useOpenNotification, type InboxFilter,
} from '@/features/notifications';

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
];

const InboxPage = () => {
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
        title="Inbox"
        description="Assignments, completed tasks, mentions and comments on your tasks. Notifications are kept for 90 days."
        actions={(
          <Button
            type="button"
            variant="outline"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="h-11 gap-1.5 sm:h-9"
          >
            <CheckCheck className="size-4" aria-hidden /> Mark all as read
          </Button>
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Show notifications"
          value={filter}
          onValueChange={changeFilter}
          options={FILTERS.map(option => ({
            value: option.value,
            label: option.value === 'unread' && unreadCount > 0 ? `Unread (${unreadCount})` : option.label,
          }))}
        />
      </div>

      <Surface padding="none" className="overflow-hidden">
        {loading ? (
          <div className="space-y-4 p-4" role="status" aria-busy="true" aria-label="Loading notifications">
            {[0, 1, 2, 3].map(row => <Skeleton key={row} className="h-10 w-full" />)}
          </div>
        ) : error && items.length === 0 ? (
          <ErrorState
            title="We could not load your notifications"
            reason="The server did not answer."
            nextStep="Check your connection and try again."
            action={<Button type="button" variant="outline" onClick={() => void retry()} className="h-11 sm:h-9">Try again</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BellOff />}
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            description={filter === 'unread'
              ? 'You have read everything. New notifications show up here.'
              : 'When someone assigns you a task or mentions you in a comment, it shows up here.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Notifications">
            {items.map(notification => (
              <li key={notification._id}>
                <NotificationRow notification={notification} onSelect={openNotification} />
              </li>
            ))}
          </ul>
        )}
      </Surface>

      {error && items.length > 0 && (
        <p role="alert" className="text-sm text-red-700">We could not load older notifications. Try again.</p>
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
            {loadingMore && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {loadingMore ? 'Loading...' : 'Load older'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default InboxPage;
