import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, CircleAlert, UserRound } from 'lucide-react';
import { UserAvatar } from '@/components/ds';
import { cn } from '@/lib/utils';
import { DueDate, StatusBadge, StoryPoints, type Task } from '@/features/tasks';
import { UNASSIGNED_ID, type Workload, type WorkloadRow } from '../lib/workload';
import CapacityBar from './CapacityBar';

interface WorkloadListProps {
  workload: Workload;
  capacity: number;
  slug: string;
  /** Row whose tasks are open (person id or `unassigned`). */
  openId: string | null;
  onToggle: (id: string) => void;
  /** Display key of a task such as "WEB-12" (empty when it has none). */
  keyOf: (task: Task) => string;
}

const counts = (row: WorkloadRow) => {
  const parts = [
    row.items.pending > 0 && `${row.items.pending} pending`,
    row.items['in-progress'] > 0 && `${row.items['in-progress']} in progress`,
    row.items.completed > 0 && `${row.items.completed} done`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No items';
};

interface PersonRowProps {
  row: WorkloadRow;
  capacity: number;
  slug: string;
  open: boolean;
  onToggle: () => void;
  keyOf: (task: Task) => string;
}

const PersonRow = ({ row, capacity, slug, open, onToggle, keyOf }: PersonRowProps) => {
  const panelId = useId();
  const unassigned = row.id === UNASSIGNED_ID;
  const flagged = !unassigned && row.over;

  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${row.name}: ${row.points.total} points, ${row.items.total} ${row.items.total === 1 ? 'item' : 'items'}${flagged ? `, over capacity by ${row.overBy}` : ''}. ${open ? 'Hide' : 'Show'} tasks`}
        className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 text-left outline-none hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-4 md:grid-cols-[14rem_minmax(0,1fr)_auto]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {unassigned
            ? <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UserRound className="size-4" /></span>
            : <UserAvatar name={row.name} src={row.avatarUrl} size="sm" />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{row.name}</span>
            <span className="block truncate text-xs text-slate-600">{counts(row)}</span>
          </span>
        </span>

        <span className="col-span-3 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
          <CapacityBar row={row} capacity={capacity} showCapacity={!unassigned} />
        </span>

        <span className="flex items-center gap-2 justify-self-end">
          <span className="text-right text-sm tabular-nums text-slate-900">
            <span className="font-semibold">{row.points.total}</span>
            {!unassigned && <span className="text-slate-600"> / {capacity} pts</span>}
            {unassigned && <span className="text-slate-600"> pts</span>}
            {flagged && (
              <span className="mt-0.5 flex items-center justify-end gap-1 text-xs font-semibold text-danger-fg">
                <CircleAlert aria-hidden className="size-3.5" />
                Over by {row.overBy}
              </span>
            )}
            {row.unestimated > 0 && (
              <span className="block text-xs font-normal text-slate-600">{row.unestimated} unestimated</span>
            )}
          </span>
          <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-slate-500 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div id={panelId} className="border-t border-slate-100 bg-slate-50/50 px-3 py-2 sm:px-4">
          {row.tasks.length === 0 ? (
            <p className="py-2 text-sm text-slate-600">Nothing assigned in this scope.</p>
          ) : (
            <ul aria-label={`Tasks of ${row.name}`} className="divide-y divide-slate-100">
              {row.tasks.map(task => (
                <li key={task._id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    {keyOf(task) && <span className="shrink-0 font-mono text-xs text-slate-600">{keyOf(task)}</span>}
                    <Link
                      to={`/${slug}/tasks?task=${encodeURIComponent(task._id)}`}
                      className="min-w-0 truncate rounded text-sm text-slate-900 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      title={task.title}
                    >
                      {task.title}
                    </Link>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-3">
                    <StatusBadge status={task.status} />
                    <StoryPoints points={task.storyPoints} />
                    <DueDate deadline={task.deadline} completed={task.status === 'completed'} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};

/** One row per assignee (busiest first) plus the unassigned work; a row opens to list its tasks. */
const WorkloadList = ({ workload, capacity, slug, openId, onToggle, keyOf }: WorkloadListProps) => (
  <ul aria-label="Workload by person">
    {workload.people.map(row => (
      <PersonRow key={row.id} row={row} capacity={capacity} slug={slug} open={openId === row.id} onToggle={() => onToggle(row.id)} keyOf={keyOf} />
    ))}
    {workload.unassigned.items.total > 0 && (
      <PersonRow
        row={workload.unassigned}
        capacity={capacity}
        slug={slug}
        open={openId === UNASSIGNED_ID}
        onToggle={() => onToggle(UNASSIGNED_ID)}
        keyOf={keyOf}
      />
    )}
  </ul>
);

export default WorkloadList;
