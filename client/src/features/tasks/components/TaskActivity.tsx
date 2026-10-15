import { History } from 'lucide-react';
import { EmptyState, SkeletonList, Timeline, UserAvatar } from '@/components/ds';
import { Button } from '@/components/ui/button';
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

const ActivitySkeleton = () => <SkeletonList bare trailing={false} rows={3} label="Loading activity" />;

/** Task history: who changed what and when, newest first, with "Load older". Mount it when its tab opens. */
const TaskActivity = ({ workspaceSlug, taskId, refreshKey, sprintName }: TaskActivityProps) => {
  const { items, nextBefore, loading, error, loadingMore, moreError, loadMore, retry } = useTaskActivity(workspaceSlug, taskId, {
    enabled: true,
    refreshKey,
  });

  if (loading) return <ActivitySkeleton />;

  if (error && items.length === 0) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger-fg">
        <p>{error}</p>
        <Button type="button" variant="outline" onClick={retry} className="h-10 border-danger-border bg-white text-danger-fg sm:h-9">
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
      {error && <p role="alert" className="text-xs text-danger-fg">Could not refresh: {error}</p>}
      <Timeline aria-label="Task activity">
        {items.map(entry => <ActivityRow key={entry._id} entry={entry} sprintName={sprintName} />)}
      </Timeline>
      {moreError && <p role="alert" className="text-xs text-danger-fg">{moreError}</p>}
      {nextBefore && (
        <Button
          type="button"
          variant="outline"
          onClick={() => { void loadMore(); }}
          disabled={loadingMore}
          aria-busy={loadingMore}
          className="h-10 w-full border-slate-300 text-slate-700 sm:h-9 sm:w-auto"
        >
          {loadingMore ? 'Loading…' : 'Load older'}
        </Button>
      )}
    </div>
  );
};

export default TaskActivity;
