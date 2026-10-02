import { useMemo, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { STATUS_META } from '../constants';
import { addMonths, dateKeyOf, formatMonth, isOverdue, startOfMonth } from '../lib/date';
import { buildMonthGrid, groupByDeadline, rescheduleToDeadline, type CalendarDay } from '../lib/schedule';
import type { Task } from '../types';
import type { TaskViewProps } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VISIBLE_PER_DAY = 3;

interface CalendarViewProps extends Pick<TaskViewProps, 'tasks' | 'onUpdate' | 'onEdit' | 'onCreate'> {
  /** Initial month shown (defaults to the current month). */
  initialMonth?: Date;
}

/** Month grid placing tasks on their due date. Drag a task to another day to reschedule it. */
const CalendarView = ({ tasks, onUpdate, onEdit, onCreate, initialMonth }: CalendarViewProps) => {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth ?? new Date()));
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const days = useMemo(() => buildMonthGrid(month), [month]);
  const tasksByDay = useMemo(() => groupByDeadline(tasks), [tasks]);

  const handleDrop = (event: DragEvent, day: CalendarDay) => {
    event.preventDefault();
    setDragOverKey(null);
    const task = tasks.find(t => t._id === event.dataTransfer.getData('text/plain'));
    if (task && dateKeyOf(task.deadline) !== day.key) void onUpdate(task._id, rescheduleToDeadline(task, day.key));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900" aria-live="polite">{formatMonth(month)}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))} className="h-8 border-slate-200 text-slate-700 mr-1">
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))} className="text-slate-500">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))} className="text-slate-500">
            <ChevronRight />
          </Button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
            {WEEKDAYS.map(day => (
              <div key={day} className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 grid-rows-6">
            {days.map(day => {
              const dayTasks = tasksByDay.get(day.key) ?? [];
              const expanded = expandedKey === day.key;
              const visible = expanded ? dayTasks : dayTasks.slice(0, VISIBLE_PER_DAY);
              const hidden = dayTasks.length - visible.length;

              return (
                <div
                  key={day.key}
                  onDragOver={event => {
                    event.preventDefault();
                    if (dragOverKey !== day.key) setDragOverKey(day.key);
                  }}
                  onDragLeave={event => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverKey(null);
                  }}
                  onDrop={event => handleDrop(event, day)}
                  className={cn(
                    'group relative min-h-28 border-b border-r border-slate-100 p-1.5 transition-colors [&:nth-child(7n)]:border-r-0',
                    !day.inMonth && 'bg-slate-50/60',
                    dragOverKey === day.key && 'bg-blue-50/60 ring-1 ring-inset ring-primary/30',
                  )}
                >
                  <div className="flex items-center justify-between px-1">
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                        day.isToday ? 'bg-primary font-semibold text-white' : day.inMonth ? 'text-slate-700' : 'text-slate-400',
                      )}
                    >
                      {day.date.getDate()}
                    </span>
                    <button
                      type="button"
                      aria-label={`Add task due ${day.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}
                      onClick={() => onCreate({ deadline: day.key })}
                      className="rounded p-0.5 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>

                  <ul className="mt-1 space-y-1">
                    {visible.map(task => (
                      <li key={task._id}>
                        <CalendarChip task={task} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>

                  {(hidden > 0 || expanded) && dayTasks.length > VISIBLE_PER_DAY && (
                    <button
                      type="button"
                      onClick={() => setExpandedKey(expanded ? null : day.key)}
                      className="mt-1 px-1.5 text-xs font-medium text-slate-500 hover:text-primary"
                    >
                      {expanded ? 'Show less' : `+${hidden} more`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const CalendarChip = ({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);

  return (
    <button
      type="button"
      draggable
      onDragStart={event => {
        event.dataTransfer.setData('text/plain', task._id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onEdit(task)}
      title={`${task.title} · ${STATUS_META[task.status].label}`}
      className={cn(
        'flex w-full cursor-grab items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-xs font-medium active:cursor-grabbing',
        STATUS_META[task.status].surface,
        overdue && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', overdue ? 'bg-red-500' : STATUS_META[task.status].dot)} />
      <span className={cn('truncate', completed && 'line-through opacity-70')}>{task.title}</span>
    </button>
  );
};

export default CalendarView;
