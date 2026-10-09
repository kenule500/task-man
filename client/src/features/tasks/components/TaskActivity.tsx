import { History } from 'lucide-react';
import { EmptyState, Timeline, UserAvatar } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { TaskActivityEntry } from '../api';
import { useTaskActivity } from '../hooks/useTaskActivity';
import { absoluteTime, describeActivity, type ActivityTextOptions } from '../lib/activityText';
import { formatRelativeTime } from '../lib/date';

interface TaskActivityProps {
  workspaceSlug: string | undefined;
  taskId: string;
  /** Refetches the newest entries when it changes (pass the task's `updatedAt`). */
  refreshKey?: string;
  sprintName?: ActivityTextOptions['sprintName'];
}

const ActivityRow = ({ entry, sprintName }: { entry: TaskActivityEntry; sprintName?: ActivityTextOptions['sprintName'] }) => {
  const { headline, details } = describeActivity(entry, { sprintName });
  const actor = entry.actor?.name ?? 'Someone';

  return (
    <li className="flex gap-3">
      <UserAvatar name={actor} src={entry.actor?.avatarUrl || undefined} size="sm" className="mt-0.5 size-7 shrink-0 text-[10px]" />
      <div className="min-w-0 text-sm text-slate-700">
        <p className="[overflow-wrap:anywhere]">
          <span className="font-semibold text-slate-900">{actor}</span> {headline}
        </p>
        {details.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600 [overflow-wrap:anywhere]">
            {details.map(line => <li key={line}>{line}</li>)}
          </ul>
        )}
        <time dateTime={entry.createdAt} title={absoluteTime(entry.createdAt)} className="text-xs text-slate-500 tabular-nums">
          {formatRelativeTime(entry.createdAt)}
        </time>
      </div>
    </li>
  );
};

const ActivitySkeleton = () => (
  <div role="status" aria-label="Loading activity" className="space-y-5">
    {[0, 1, 2].map(row => (
      <div key={row} className="flex gap-3">
        <Skeleton className="size-7 shrink-0 rounded-full bg-slate-200 motion-reduce:animate-none" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4 bg-slate-200 motion-reduce:animate-none" />
          <Skeleton className="h-3 w-16 bg-slate-200 motion-reduce:animate-none" />
        </div>
      </div>
    ))}
  </div>
);

/** Task history: who changed what and when, newest first, with "Load older". Mount it when its tab opens. */
const TaskActivity = ({ workspaceSlug, taskId, refreshKey, sprintName }: TaskActivityProps) => {
  const { items, nextBefore, loading, error, loadingMore, moreError, loadMore, retry } = useTaskActivity(workspaceSlug, taskId, {
    enabled: true,
    refreshKey,
  });

  if (loading) return <ActivitySkeleton />;

  if (error && items.length === 0) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>{error}</p>
        <Button type="button" variant="outline" onClick={retry} className="h-10 border-red-300 bg-white text-red-800 sm:h-9">
          Try again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="No activity yet"
        description="Changes, comments and files for this task will show up here."
        className="py-8"
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-xs text-red-700">Could not refresh: {error}</p>}
      <Timeline aria-label="Task activity">
        {items.map(entry => <ActivityRow key={entry._id} entry={entry} sprintName={sprintName} />)}
      </Timeline>
      {moreError && <p role="alert" className="text-xs text-red-700">{moreError}</p>}
      {nextBefore && (
        <Button
          type="button"
          variant="outline"
          onClick={() => { void loadMore(); }}
          disabled={loadingMore}
          aria-busy={loadingMore}
          className="h-10 w-full border-gray-300 text-slate-700 sm:h-9 sm:w-auto"
        >
          {loadingMore ? 'Loading…' : 'Load older'}
        </Button>
      )}
    </div>
  );
};

export default TaskActivity;
