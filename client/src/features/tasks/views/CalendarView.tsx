import { useMemo, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { STATUS_META } from '../constants';
import { addMonths, dateKeyOf, formatDate, formatMonth, isOverdue, startOfMonth } from '../lib/date';
import { buildAgenda, type AgendaDay } from '../lib/agenda';
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
  const agenda = useMemo(() => buildAgenda(tasks, month), [tasks, month]);

  const handleDrop = (event: DragEvent, day: CalendarDay) => {
    event.preventDefault();
    setDragOverKey(null);
    const task = tasks.find(t => t._id === event.dataTransfer.getData('text/plain'));
    if (task && dateKeyOf(task.deadline) !== day.key) void onUpdate(task._id, rescheduleToDeadline(task, day.key));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 md:px-6 md:py-4">
        <h2 className="text-base font-semibold text-slate-900" aria-live="polite">{formatMonth(month)}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))} className="h-10 border-slate-200 px-4 text-slate-700 mr-1 md:h-8 md:px-2.5">
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))} className="size-10 text-slate-500 md:size-7">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))} className="size-10 text-slate-500 md:size-7">
            <ChevronRight />
          </Button>
        </div>
      </header>

      {/* Phones: agenda of the days that have tasks */}
      <div data-testid="calendar-agenda" className="md:hidden">
        <CalendarAgenda days={agenda} monthLabel={formatMonth(month)} onEdit={onEdit} onCreate={onCreate} />
      </div>

      {/* Tablet and desktop: month grid */}
      <div data-testid="calendar-grid" className="hidden overflow-x-auto md:block">
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

interface CalendarAgendaProps extends Pick<TaskViewProps, 'onEdit' | 'onCreate'> {
  days: AgendaDay[];
  monthLabel: string;
}

/** Phone layout: days of the month with tasks, grouped under a date heading. */
const CalendarAgenda = ({ days, monthLabel, onEdit, onCreate }: CalendarAgendaProps) => (
  <div className="p-4">
    <Button onClick={() => onCreate()} className="h-10 w-full bg-primary text-white hover:bg-primary-hover">
      <Plus /> Add task
    </Button>

    {days.length === 0 ? (
      <p className="py-8 text-center text-sm text-slate-500">No tasks due in {monthLabel}.</p>
    ) : (
      <ol className="mt-4 space-y-5">
        {days.map(day => (
          <li key={day.key} data-testid="agenda-day" aria-current={day.isToday ? 'date' : undefined}>
            <div className="flex items-center justify-between gap-2">
              <h3 className={cn('flex items-center gap-2 text-sm font-semibold', day.isToday ? 'text-primary' : 'text-slate-700')}>
                {formatDate(day.key, { weekday: 'short', month: 'short', day: 'numeric' })}
                {day.isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">Today</span>}
              </h3>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Add task on ${formatDate(day.key, { month: 'long', day: 'numeric' })}`}
                onClick={() => onCreate({ deadline: day.key })}
                className="size-10 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <Plus />
              </Button>
            </div>
            <ul className={cn('mt-1 space-y-1.5 border-l-2 pl-3', day.isToday ? 'border-primary' : 'border-slate-100')}>
              {day.tasks.map(task => (
                <li key={task._id}>
                  <AgendaItem task={task} onEdit={onEdit} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    )}
  </div>
);

const AgendaItem = ({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);

  return (
    <button
      type="button"
      onClick={() => onEdit(task)}
      className={cn(
        'flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium',
        STATUS_META[task.status].surface,
        overdue && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', overdue ? 'bg-red-500' : STATUS_META[task.status].dot)} />
      <span className={cn('min-w-0 flex-1 truncate', completed && 'line-through opacity-70')}>{task.title}</span>
      <span className="shrink-0 text-xs font-normal opacity-80">
        {STATUS_META[task.status].label}
        {overdue && <span className="sr-only"> (overdue)</span>}
      </span>
    </button>
  );
};

const CalendarChip =({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) => {
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
