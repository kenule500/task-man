import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, UserCheck } from 'lucide-react';
import { SectionHeader, Surface } from '@/components/ds';
import { DueDate, PriorityIndicator, StatusBadge, TaskKey, type Task } from '@/features/tasks';
import { cn } from '@/lib/utils';
import { MY_WORK_LIMIT, RECENT_DAYS, buildMyWork, type MyWorkBucket } from './myWorkGroups';

interface MyWorkProps {
  tasks: Task[];
  /** The signed-in user. */
  userId: string;
  slug: string;
  /** Rows shown before "View all". */
  limit?: number;
}

const HEADING_CLASS: Record<MyWorkBucket, string> = {
  overdue: 'text-danger-fg',
  today: 'text-slate-700',
  week: 'text-slate-500',
  later: 'text-slate-500',
};

/** Dashboard card: what is on my plate, most urgent first. */
const MyWork = ({ tasks, userId, slug, limit = MY_WORK_LIMIT }: MyWorkProps) => {
  const work = useMemo(() => buildMyWork(tasks, userId, { limit }), [tasks, userId, limit]);
  const viewAll = `/${slug}/tasks?assignedToMe=1`;
  const recent = `${work.completedRecently} ${work.completedRecently === 1 ? 'task' : 'tasks'} completed by you in the last ${RECENT_DAYS} days`;

  return (
    <Surface as="section" padding="sm" className="sm:p-5" aria-labelledby="my-work-heading">
      <SectionHeader
        className="mb-3"
        title={<span id="my-work-heading">My work</span>}
        count={work.total}
        icon={<UserCheck className="size-4 text-primary" aria-hidden />}
        action={work.total > 0 ? (
          <Link to={viewAll} className="inline-flex min-h-10 items-center text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary sm:min-h-0">
            View all
          </Link>
        ) : undefined}
      />

      {work.total === 0 ? (
        <p className="py-4 text-sm text-slate-600">Nothing is assigned to you right now. Tasks assigned to you show up here.</p>
      ) : (
        <div className="space-y-4">
          {work.groups.map(group => (
            <section key={group.bucket} aria-label={`${group.label}, ${group.total}`}>
              <h3 className={cn('mb-1 text-xs font-semibold uppercase tracking-wide', HEADING_CLASS[group.bucket])}>
                {group.label} <span className="font-normal tabular-nums text-slate-500">{group.total}</span>
              </h3>
              <ul className="divide-y divide-slate-100">
                {group.tasks.map(task => (
                  <li key={task._id}>
                    {/* ?task= opens the task's details on the tasks page */}
                    <Link
                      to={`/${slug}/tasks?task=${encodeURIComponent(task._id)}`}
                      className="-mx-2 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
                        <TaskKey task={task} />
                        <span className="truncate text-sm font-medium text-slate-900">{task.title}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <PriorityIndicator priority={task.priority} />
                        <DueDate deadline={task.deadline} />
                        <StatusBadge status={task.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {work.total > work.shown && (
            <p className="text-xs text-slate-600">
              Showing {work.shown} of {work.total}.{' '}
              <Link to={viewAll} className="font-medium text-primary hover:underline">View all</Link>
            </p>
          )}
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <CheckCircle2 className="size-3.5 text-success-fg" aria-hidden />
        <span>{recent}</span>
      </p>
    </Surface>
  );
};

export default MyWork;
