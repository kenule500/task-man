import { useMemo, useState } from 'react';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import type { Task } from './types';

interface TaskCalendarViewProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
};

const TaskCalendarView = ({ tasks, onEdit }: TaskCalendarViewProps) => {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const scheduledTasks = useMemo(() => tasks.filter(t => !!t.deadline), [tasks]);
  const unscheduledCount = tasks.length - scheduledTasks.length;

  const tasksForDay = (day: Date) =>
    scheduledTasks.filter(t => isSameDay(parseISO(t.deadline as string), day));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900">{format(currentMonth, 'MMMM yyyy')}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            aria-label="Previous month"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentMonth(startOfMonth(new Date()))}
            className="px-2.5 h-8 rounded-lg hover:bg-slate-100 text-xs font-medium text-slate-600"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            aria-label="Next month"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEKDAYS.map(d => (
          <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map(day => {
          const dayTasks = tasksForDay(day);
          const visible = dayTasks.slice(0, 3);
          const overflow = dayTasks.length - visible.length;
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[104px] border-b border-r border-slate-100 p-2 [&:nth-child(7n)]:border-r-0 ${inMonth ? 'bg-white' : 'bg-slate-50/50'}`}
            >
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                  today ? 'bg-primary text-white' : inMonth ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {format(day, 'd')}
              </span>

              <div className="mt-1.5 space-y-1">
                {visible.map(task => (
                  <button
                    key={task._id}
                    onClick={() => onEdit(task)}
                    title={task.title}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left text-[11px] text-slate-700 bg-slate-50 hover:bg-slate-100 truncate"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                    <span className="truncate">{task.title}</span>
                  </button>
                ))}
                {overflow > 0 && (
                  <p className="text-[11px] text-slate-400 px-1.5">+{overflow} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {unscheduledCount > 0 && (
        <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          {unscheduledCount} task{unscheduledCount > 1 ? 's' : ''} without a due date — set one from List view to see {unscheduledCount > 1 ? 'them' : 'it'} here.
        </div>
      )}
    </div>
  );
};

export default TaskCalendarView;
