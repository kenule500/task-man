import { useCallback, useMemo } from 'react';
import {
  addDays, differenceInCalendarDays, eachDayOfInterval, format, isToday, isWeekend, parseISO,
} from 'date-fns';
import { GanttChartSquare, Info } from 'lucide-react';
import type { Task } from './types';

interface TaskTimelineViewProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
}

const DAY_WIDTH = 34;
const ROW_HEIGHT = 44;
const BAR_HEIGHT = 24;
const LEFT_COL_WIDTH = 220;
const HEADER_HEIGHT = 56;

const STATUS_FILL: Record<string, string> = {
  pending: 'bg-slate-300',
  'in-progress': 'bg-blue-500',
  completed: 'bg-emerald-500',
};

interface Positioned {
  task: Task;
  start: Date;
  end: Date;
}

const getRange = (task: Task): { start: Date; end: Date } => {
  const start = task.startDate ? parseISO(task.startDate) : task.deadline ? parseISO(task.deadline) : parseISO(task.createdAt);
  const end = task.deadline ? parseISO(task.deadline) : task.startDate ? parseISO(task.startDate) : start;
  return start <= end ? { start, end } : { start: end, end: start };
};

const TaskTimelineView = ({ tasks, onEdit }: TaskTimelineViewProps) => {
  const datedTasks = useMemo(() => tasks.filter(t => t.startDate || t.deadline), [tasks]);
  const unscheduledCount = tasks.length - datedTasks.length;

  const positioned: Positioned[] = useMemo(
    () => datedTasks.map(task => ({ task, ...getRange(task) })).sort((a, b) => a.start.getTime() - b.start.getTime()),
    [datedTasks]
  );

  const { rangeStart, days } = useMemo(() => {
    if (positioned.length === 0) {
      const start = addDays(new Date(), -2);
      return { rangeStart: start, days: eachDayOfInterval({ start, end: addDays(start, 13) }) };
    }
    const earliest = positioned.reduce((min, p) => (p.start < min ? p.start : min), positioned[0].start);
    const latest = positioned.reduce((max, p) => (p.end > max ? p.end : max), positioned[0].end);
    const start = addDays(earliest, -1);
    const end = addDays(latest, 2);
    return { rangeStart: start, days: eachDayOfInterval({ start, end }) };
  }, [positioned]);

  const offsetX = useCallback(
    (date: Date) => differenceInCalendarDays(date, rangeStart) * DAY_WIDTH,
    [rangeStart]
  );

  const monthGroups = useMemo(() => {
    const groups: { label: string; count: number }[] = [];
    days.forEach(day => {
      const label = format(day, 'MMM yyyy');
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.count += 1;
      else groups.push({ label, count: 1 });
    });
    return groups;
  }, [days]);

  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    positioned.forEach((p, i) => map.set(p.task._id, i));
    return map;
  }, [positioned]);

  const dependencyLines = useMemo(() => {
    const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    positioned.forEach((p, rowIndex) => {
      p.task.dependencies.forEach(dep => {
        const depRow = rowIndexById.get(dep._id);
        if (depRow === undefined) return;
        const depPositioned = positioned[depRow];
        lines.push({
          key: `${dep._id}->${p.task._id}`,
          x1: offsetX(depPositioned.end) + DAY_WIDTH - 2,
          y1: depRow * ROW_HEIGHT + ROW_HEIGHT / 2,
          x2: offsetX(p.start) + 2,
          y2: rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
        });
      });
    });
    return lines;
  }, [positioned, rowIndexById, offsetX]);

  const chartWidth = days.length * DAY_WIDTH;
  const chartHeight = Math.max(positioned.length * ROW_HEIGHT, ROW_HEIGHT);
  const todayIndex = days.findIndex(d => isToday(d));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <GanttChartSquare className="w-4 h-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Timeline</h2>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300" />To Do</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />In Progress</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Completed</span>
          <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-red-400" />Today</span>
        </div>
      </div>

      {positioned.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <GanttChartSquare className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Nothing to plot yet</h3>
          <p className="text-slate-500 text-sm">Add a start or due date to a task to see it on the timeline.</p>
        </div>
      ) : (
        <div className="flex">
          <div style={{ width: LEFT_COL_WIDTH }} className="flex-shrink-0 border-r border-slate-100">
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-slate-100" />
            {positioned.map(p => (
              <button
                key={p.task._id}
                onClick={() => onEdit(p.task)}
                style={{ height: ROW_HEIGHT }}
                className="w-full flex items-center px-3 border-b border-slate-50 text-left text-sm text-slate-700 hover:bg-slate-50 truncate"
                title={p.task.title}
              >
                <span className="truncate">{p.task.title}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-x-auto">
            <div style={{ width: chartWidth }}>
              <div className="flex border-b border-slate-100" style={{ height: HEADER_HEIGHT / 2 }}>
                {monthGroups.map((g, i) => (
                  <div
                    key={i}
                    style={{ width: g.count * DAY_WIDTH }}
                    className="flex items-center px-2 text-xs font-semibold text-slate-500 border-r border-slate-100 flex-shrink-0"
                  >
                    {g.label}
                  </div>
                ))}
              </div>
              <div className="flex border-b border-slate-100" style={{ height: HEADER_HEIGHT / 2 }}>
                {days.map((d, i) => (
                  <div
                    key={i}
                    style={{ width: DAY_WIDTH }}
                    className={`flex items-center justify-center text-[10px] border-r border-slate-100 flex-shrink-0 ${
                      isWeekend(d) ? 'bg-slate-50 text-slate-400' : 'text-slate-500'
                    } ${isToday(d) ? 'font-bold text-primary' : ''}`}
                  >
                    {format(d, 'd')}
                  </div>
                ))}
              </div>

              <div style={{ position: 'relative', height: chartHeight }}>
                {days.map((d, i) => (
                  <div
                    key={i}
                    style={{ position: 'absolute', left: i * DAY_WIDTH, top: 0, bottom: 0, width: DAY_WIDTH }}
                    className={`border-r border-slate-50 ${isWeekend(d) ? 'bg-slate-50/60' : ''}`}
                  />
                ))}

                {todayIndex >= 0 && (
                  <div
                    style={{ position: 'absolute', left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2, top: 0, bottom: 0 }}
                    className="w-px bg-red-400"
                  />
                )}

                <svg
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                  width={chartWidth}
                  height={chartHeight}
                >
                  <defs>
                    <marker id="arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
                    </marker>
                  </defs>
                  {dependencyLines.map(line => (
                    <path
                      key={line.key}
                      d={`M ${line.x1} ${line.y1} C ${line.x1 + 16} ${line.y1}, ${line.x2 - 16} ${line.y2}, ${line.x2 - 4} ${line.y2}`}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      markerEnd="url(#arrow)"
                    />
                  ))}
                </svg>

                {positioned.map((p, rowIndex) => {
                  const left = offsetX(p.start);
                  const width = Math.max(offsetX(p.end) - left + DAY_WIDTH - 4, DAY_WIDTH - 4);
                  const showLabel = width > 64;
                  return (
                    <button
                      key={p.task._id}
                      onClick={() => onEdit(p.task)}
                      title={`${p.task.title} · ${format(p.start, 'MMM d')} – ${format(p.end, 'MMM d')}`}
                      style={{
                        position: 'absolute',
                        left: left + 2,
                        width,
                        top: rowIndex * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2,
                        height: BAR_HEIGHT,
                      }}
                      className={`${STATUS_FILL[p.task.status]} rounded-md flex items-center px-2 shadow-sm hover:brightness-95 transition-[filter] overflow-hidden`}
                    >
                      {showLabel && (
                        <span className="text-[11px] font-medium text-white truncate">{p.task.title}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {unscheduledCount > 0 && (
        <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          {unscheduledCount} task{unscheduledCount > 1 ? 's' : ''} without dates — not shown here.
        </div>
      )}
    </div>
  );
};

export default TaskTimelineView;
