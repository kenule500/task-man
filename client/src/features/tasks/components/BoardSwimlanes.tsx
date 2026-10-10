import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Swimlane } from '../lib/swimlanes';
import type { Task } from '../types';

/** One board column as the swimlane summary needs it. */
export interface BoardColumn {
  key: string;
  label: string;
  /** Tailwind background class of the dot */
  dot: string;
}

interface BoardSwimlanesProps {
  lanes: Swimlane[];
  /** The column headers, rendered once above the lanes. */
  header: ReactNode;
  /** The board columns (workflow stages), in order. */
  columns: BoardColumn[];
  /** Key of the column a task is shown in. */
  columnOf: (task: Task) => string;
  /** One column inside a lane. */
  renderCell: (lane: Swimlane, columnKey: string) => ReactNode;
  className?: string;
}

/** Wide boards scroll inside their own container instead of squeezing the columns. */
const gridStyle = (count: number): CSSProperties => ({
  gridTemplateColumns: `repeat(${count}, minmax(${count > 3 ? '15rem' : '0px'}, 1fr))`,
});

/** Collapsible rows, each repeating the board columns (desktop board grouped by assignee, project or type). */
const BoardSwimlanes = ({ lanes, header, columns, columnOf, renderCell, className }: BoardSwimlanesProps) => {
  const idPrefix = useId();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="flex flex-col gap-4" style={columns.length > 3 ? { minWidth: `${columns.length * 15.5}rem` } : undefined}>
        <div className="grid gap-5" style={gridStyle(columns.length)}>{header}</div>

        {lanes.map(lane => {
          const open = !collapsed.has(lane.id);
          const bodyId = `${idPrefix}-lane-${lane.id}`;
          const counts = Object.fromEntries(columns.map(column => [column.key, 0])) as Record<string, number>;
          for (const task of lane.tasks) {
            const key = columnOf(task);
            counts[key] = (counts[key] ?? 0) + 1;
          }

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
                      {columns.map(column => (
                        <span key={column.key} className="inline-flex items-center gap-1 tabular-nums">
                          <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', column.dot)} />
                          {counts[column.key]}
                          <span className="sr-only"> {column.label}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </h3>
              <div id={bodyId} hidden={!open} className="grid items-start gap-5 px-3 pb-3" style={gridStyle(columns.length)}>
                {open && columns.map(column => renderCell(lane, column.key))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default BoardSwimlanes;
