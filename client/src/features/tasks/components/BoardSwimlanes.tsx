import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_META, TASK_STATUSES } from '../constants';
import type { Swimlane } from '../lib/swimlanes';
import type { TaskStatus } from '../types';
import { StatusDot } from './TaskBadges';

interface BoardSwimlanesProps {
  lanes: Swimlane[];
  /** The three column headers, rendered once above the lanes. */
  header: ReactNode;
  /** One status column inside a lane. */
  renderCell: (lane: Swimlane, status: TaskStatus) => ReactNode;
  className?: string;
}

/** Collapsible rows, each repeating the three status columns (desktop board grouped by assignee, project or type). */
const BoardSwimlanes = ({ lanes, header, renderCell, className }: BoardSwimlanesProps) => {
  const idPrefix = useId();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="grid grid-cols-3 gap-5">{header}</div>

      {lanes.map(lane => {
        const open = !collapsed.has(lane.id);
        const bodyId = `${idPrefix}-lane-${lane.id}`;
        const counts = Object.fromEntries(TASK_STATUSES.map(status => [status, 0])) as Record<TaskStatus, number>;
        for (const task of lane.tasks) counts[task.status] += 1;

        return (
          <section key={lane.id} aria-label={`${lane.label} swimlane`} className="rounded-2xl border border-slate-200 bg-white">
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => toggle(lane.id)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                )}
              >
                {open ? <ChevronDown className="size-4 text-slate-500" aria-hidden /> : <ChevronRight className="size-4 text-slate-500" aria-hidden />}
                <span className="truncate">{lane.label}</span>
                <span className="rounded-md border border-slate-200 bg-white px-1.5 text-xs font-medium tabular-nums text-slate-600">
                  {lane.tasks.length}<span className="sr-only"> tasks</span>
                </span>
                {!open && (
                  <span className="ml-auto flex items-center gap-3 text-xs font-normal text-slate-600">
                    {TASK_STATUSES.map(status => (
                      <span key={status} className="inline-flex items-center gap-1 tabular-nums">
                        <StatusDot status={status} />
                        {counts[status]}
                        <span className="sr-only"> {STATUS_META[status].label}</span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </h3>
            <div id={bodyId} hidden={!open} className="grid grid-cols-3 items-start gap-5 px-3 pb-3">
              {open && TASK_STATUSES.map(status => renderCell(lane, status))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default BoardSwimlanes;
