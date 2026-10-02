import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AlertTriangle, ChartGantt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import EmptyState from '../components/EmptyState';
import { StatusDot } from '../components/TaskBadges';
import { STATUS_META } from '../constants';
import { diffInDays, formatDate, isWeekend, startOfDay } from '../lib/date';
import {
  buildTimeline, getLinkPath, getStartKey, groupDaysByMonth, resizeTask, shiftTask, type TimelineRow,
} from '../lib/schedule';
import type { Task } from '../types';
import type { TaskViewProps } from './types';

const ROW_HEIGHT = 44;
const BAR_HEIGHT = 26;
const ZOOM_LEVELS = { day: 40, week: 18 } as const;
type Zoom = keyof typeof ZOOM_LEVELS;

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  originX: number;
  delta: number;
}

/** Applies an in-progress drag to a row so bars and arrows follow the pointer. */
const previewRow = (row: TimelineRow, drag: DragState | null): TimelineRow => {
  if (!drag || drag.id !== row.task._id) return row;
  return drag.mode === 'move'
    ? { ...row, offset: row.offset + drag.delta }
    : { ...row, span: Math.max(1, row.span + drag.delta) };
};

/** Gantt chart: bars from start to due date, dependency arrows, drag to reschedule. */
const TimelineView = ({ tasks, onUpdate, onEdit, onCreate }: Pick<TaskViewProps, 'tasks' | 'onUpdate' | 'onEdit' | 'onCreate'>) => {
  const [zoom, setZoom] = useState<Zoom>('day');
  const [drag, setDrag] = useState<DragState | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);

  const dayWidth = ZOOM_LEVELS[zoom];
  const layout = useMemo(() => buildTimeline(tasks), [tasks]);
  const todayOffset = diffInDays(layout.start, startOfDay(new Date()));
  const months = useMemo(() => groupDaysByMonth(layout.days), [layout.days]);

  const rows = layout.rows.map(row => previewRow(row, drag));
  const rowIndex = new Map(rows.map((row, index) => [row.task._id, index]));
  const conflicts = layout.links.filter(link => link.conflict).length;
  const width = layout.days.length * dayWidth;

  const scrollToToday = () => {
    scrollerRef.current?.scrollTo({ left: Math.max(0, (todayOffset - 3) * dayWidth), behavior: 'smooth' });
  };

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollLeft = Math.max(0, (todayOffset - 3) * dayWidth);
    // Only on mount and zoom change: keep the user's scroll position otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // ---- pointer drag (move the bar, or resize from its right edge) ----
  const startDrag = (event: PointerEvent<HTMLElement>, task: Task, mode: DragState['mode']) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: task._id, mode, originX: event.clientX, delta: 0 });
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const delta = Math.round((event.clientX - drag.originX) / dayWidth);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };

  const endDrag = (task: Task) => {
    if (!drag) return;
    if (drag.delta !== 0) {
      suppressClickRef.current = true;
      void onUpdate(task._id, drag.mode === 'move' ? shiftTask(task, drag.delta) : resizeTask(task, drag.delta));
    }
    setDrag(null);
  };

  const handleBarClick = (task: Task) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onEdit(task);
  };

  // ---- keyboard: ←/→ move by a day, Shift+←/→ change the duration ----
  const handleBarKeyDown = (event: KeyboardEvent, task: Task) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    void onUpdate(task._id, event.shiftKey ? resizeTask(task, step) : shiftTask(task, step));
  };

  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <EmptyState
          icon={<ChartGantt />}
          title="Nothing scheduled yet"
          description="Add tasks with a start and due date to see them on the timeline."
          action={<Button onClick={() => onCreate()} className="h-9 bg-primary hover:bg-primary-hover text-white">Add task</Button>}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-slate-400" />Dependency</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 border-t-2 border-dashed border-red-500" />Starts before prerequisite is due</span>
          {conflicts > 0 && (
            <span role="status" className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 font-medium text-red-600">
              <AlertTriangle className="size-3.5" aria-hidden /> {conflicts} scheduling {conflicts === 1 ? 'conflict' : 'conflicts'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Zoom" className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            {(Object.keys(ZOOM_LEVELS) as Zoom[]).map(level => (
              <button
                key={level}
                type="button"
                aria-pressed={zoom === level}
                onClick={() => setZoom(level)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium capitalize text-slate-500',
                  zoom === level && 'bg-white text-slate-900 shadow-sm',
                )}
              >
                {level === 'day' ? 'Days' : 'Weeks'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={scrollToToday} className="h-8 border-slate-200 text-slate-700">Today</Button>
        </div>
      </header>

      <div className="flex">
        {/* Task names */}
        <div className="w-56 shrink-0 border-r border-slate-100 sm:w-64">
          <div className="flex h-14 items-end border-b border-slate-100 bg-slate-50/50 px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Task Name
          </div>
          <ul>
            {rows.map(({ task }) => (
              <li key={task._id} style={{ height: ROW_HEIGHT }} className="flex items-center border-b border-slate-50 px-4">
                <button
                  type="button"
                  onClick={() => onEdit(task)}
                  className="flex min-w-0 items-center gap-2 text-left text-sm text-slate-700 hover:text-primary"
                >
                  <StatusDot status={task.status} />
                  <span className={cn('truncate', task.status === 'completed' && 'text-slate-400 line-through')}>{task.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Chart */}
        <div ref={scrollerRef} className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            <div className="h-14 border-b border-slate-100 bg-slate-50/50">
              <div className="relative h-6">
                {months.map(month => (
                  <div
                    key={month.label}
                    style={{ left: month.offset * dayWidth, width: month.span * dayWidth }}
                    className="absolute top-0 h-full truncate border-l border-slate-200 px-2 pt-1 text-xs font-semibold text-slate-600"
                  >
                    {month.label}
                  </div>
                ))}
              </div>
              <div className="flex h-8">
                {layout.days.map((day, index) => (
                  <div
                    key={index}
                    style={{ width: dayWidth }}
                    className={cn(
                      'flex shrink-0 flex-col items-center justify-center text-[10px] leading-tight tabular-nums text-slate-400',
                      index === todayOffset && 'font-semibold text-primary',
                    )}
                  >
                    {(zoom === 'day' || day.getDay() === 1) && (
                      <>
                        {zoom === 'day' && <span>{day.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>}
                        <span>{day.getDate()}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
              {/* Weekend shading and row lines */}
              <div aria-hidden className="absolute inset-0 flex">
                {layout.days.map((day, index) => (
                  <div key={index} style={{ width: dayWidth }} className={cn('h-full shrink-0', isWeekend(day) && 'bg-slate-50')} />
                ))}
              </div>
              {rows.map((_, index) => (
                <div key={index} aria-hidden style={{ top: (index + 1) * ROW_HEIGHT - 1 }} className="absolute inset-x-0 h-px bg-slate-50" />
              ))}

              {/* Today marker */}
              {todayOffset >= 0 && todayOffset < layout.days.length && (
                <div
                  aria-hidden
                  style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                  className="absolute inset-y-0 z-10 w-px bg-primary/60"
                />
              )}

              {/* Dependency arrows */}
              <svg aria-hidden className="pointer-events-none absolute inset-0 z-20" width={width} height={rows.length * ROW_HEIGHT}>
                <defs>
                  <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="#94A3B8" />
                  </marker>
                  <marker id="gantt-arrow-conflict" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="#EF4444" />
                  </marker>
                </defs>
                {layout.links.map(link => {
                  const from = rows[rowIndex.get(link.fromId) ?? -1];
                  const to = rows[rowIndex.get(link.toId) ?? -1];
                  if (!from || !to) return null;
                  return (
                    <path
                      key={`${link.fromId}-${link.toId}`}
                      d={getLinkPath(from, to, rowIndex.get(link.fromId)!, rowIndex.get(link.toId)!, dayWidth, ROW_HEIGHT)}
                      fill="none"
                      stroke={link.conflict ? '#EF4444' : '#94A3B8'}
                      strokeWidth={1.5}
                      strokeDasharray={link.conflict ? '4 3' : undefined}
                      markerEnd={`url(#${link.conflict ? 'gantt-arrow-conflict' : 'gantt-arrow'})`}
                    />
                  );
                })}
              </svg>

              {/* Bars */}
              {rows.map((row, index) => {
                const { task, offset, span } = row;
                const barWidth = span * dayWidth - 4;
                const labelInside = barWidth >= 90;
                const dates = `${formatDate(getStartKey(task), { month: 'short', day: 'numeric' })} – ${formatDate(task.deadline, { month: 'short', day: 'numeric' })}`;

                return (
                  <div
                    key={task._id}
                    style={{ top: index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2, left: offset * dayWidth + 2, height: BAR_HEIGHT }}
                    className="absolute z-30 flex items-center"
                  >
                    <button
                      type="button"
                      style={{ width: barWidth }}
                      onPointerDown={event => startDrag(event, task, 'move')}
                      onPointerMove={moveDrag}
                      onPointerUp={() => endDrag(task)}
                      onPointerCancel={() => setDrag(null)}
                      onClick={() => handleBarClick(task)}
                      onKeyDown={event => handleBarKeyDown(event, task)}
                      aria-label={`${task.title}, ${STATUS_META[task.status].label}, ${dates}. Arrow keys move, Shift+Arrow keys change the due date.`}
                      title={`${task.title} · ${dates}`}
                      className={cn(
                        'relative h-full touch-none cursor-grab select-none rounded-md border text-left text-xs font-medium shadow-sm active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                        STATUS_META[task.status].surface,
                        drag?.id === task._id && 'ring-2 ring-primary/40',
                      )}
                    >
                      {labelInside && <span className="block truncate px-2">{task.title}</span>}
                      <span
                        aria-hidden
                        onPointerDown={event => startDrag(event, task, 'resize')}
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-black/10"
                      />
                    </button>
                    {!labelInside && <span className="pointer-events-none ml-2 whitespace-nowrap text-xs text-slate-600">{task.title}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineView;
