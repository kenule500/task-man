import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type Ref, type TouchEvent } from 'react';
import { CalendarCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ds';
import { StatusBadge } from '../components/TaskBadges';
import { AssigneeStack, LabelChip } from '../components/TaskChips';
import { STATUS_META } from '../constants';
import { getLabelStyle } from '../lib/labels';
import {
  addMonths, dateKeyOf, formatDate, formatMonth, isOverdue, parseDateKey, startOfMonth, todayKey,
} from '../lib/date';
import { buildUpcoming, type AgendaDay } from '../lib/agenda';
import { DOT_META, dotStateOf, summarizeDay, type DaySummary } from '../lib/calendarDots';
import { buildMonthGrid, groupByDeadline, rescheduleToDeadline, type CalendarDay } from '../lib/schedule';
import { scrollBehavior } from '../lib/scroll';
import {
  WEEKDAYS, buildWeek, defaultSelectedKey, formatTaskRange, readMobileMode, shiftWeek, writeMobileMode,
  type MobileCalendarMode,
} from '../lib/week';
import type { Task } from '../types';
import ProjectChip from '@/features/projects/components/ProjectChip';
import type { TaskViewProps } from './types';

const VISIBLE_PER_DAY = 3;
const FLASH_MS = 1600;
const SWIPE_PX = 48;

const MODE_OPTIONS: { value: MobileCalendarMode; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

interface CalendarViewProps extends Pick<TaskViewProps, 'tasks' | 'onUpdate' | 'onEdit' | 'onCreate' | 'onOpen' | 'canWrite'> {
  /** Initial month shown (defaults to the current month). */
  initialMonth?: Date;
}

/** True when a key press comes from somewhere the "t" shortcut must not steal it. */
const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
    || target.closest('[role="dialog"], [role="menu"], [role="listbox"]') !== null;
};

/** Month grid placing tasks on their due date. Drag a task to another day to reschedule it. */
const CalendarView = ({ tasks, onUpdate, onEdit, onCreate, onOpen, canWrite = true, initialMonth }: CalendarViewProps) => {
  const open = onOpen ?? onEdit;
  const [month, setMonth] = useState(() => startOfMonth(initialMonth ?? new Date()));
  const [selectedKey, setSelectedKey] = useState(() => defaultSelectedKey(startOfMonth(initialMonth ?? new Date())));
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  /** Bumped by "Today"; the effect below scrolls/focuses once the month has rendered. */
  const [todayRequest, setTodayRequest] = useState(0);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<MobileCalendarMode>(() => readMobileMode());
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const days = useMemo(() => buildMonthGrid(month), [month]);
  const tasksByDay = useMemo(() => groupByDeadline(tasks), [tasks]);
  const upcoming = useMemo(() => buildUpcoming(tasks, month), [tasks, month]);

  const goToToday = useCallback(() => {
    const now = new Date();
    setMonth(startOfMonth(now));
    setSelectedKey(todayKey());
    setFlashKey(todayKey());
    setTodayRequest(count => count + 1);
  }, []);

  // Today: bring the cell (desktop) / the day's tasks (phone) into view once the month is rendered.
  useEffect(() => {
    if (todayRequest === 0) return;
    const behavior = scrollBehavior();
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-day-key="${todayKey()}"]`);
    if (cell) {
      cell.focus({ preventScroll: true });
      cell.scrollIntoView?.({ behavior, block: 'nearest', inline: 'nearest' });
    }
    panelRef.current?.scrollIntoView?.({ behavior, block: 'nearest' });
  }, [todayRequest]);

  // The highlight ring is brief.
  useEffect(() => {
    if (!flashKey) return;
    const timer = setTimeout(() => setFlashKey(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashKey, todayRequest]);

  // "t" jumps to today unless the user is typing or a dialog/menu is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 't' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      goToToday();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goToToday]);

  const changeMonth = (amount: number) => {
    const next = addMonths(month, amount);
    setMonth(next);
    setSelectedKey(defaultSelectedKey(next));
  };

  /** Selecting a day outside the shown month (edge of the week strip) shows its month. */
  const selectDay = (key: string) => {
    setSelectedKey(key);
    setMonth(startOfMonth(parseDateKey(key)));
  };

  const changeMobileMode = (mode: MobileCalendarMode) => {
    setMobileMode(mode);
    writeMobileMode(mode);
  };

  const handleDrop = (event: DragEvent, day: CalendarDay) => {
    event.preventDefault();
    setDragOverKey(null);
    if (!canWrite) return;
    const task = tasks.find(t => t._id === event.dataTransfer.getData('text/plain'));
    if (task && dateKeyOf(task.deadline) !== day.key) void onUpdate(task._id, rescheduleToDeadline(task, day.key));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 md:px-6 md:py-4">
        <h2 className="text-base font-semibold text-slate-900" aria-live="polite">{formatMonth(month)}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label="Go to today"
            title="Go to today (T)"
            onClick={goToToday}
            className="mr-1 h-10 gap-1.5 border-primary/30 px-4 font-medium text-primary hover:bg-primary/5 hover:text-primary active:scale-95 active:bg-primary/10 md:h-8 md:px-2.5"
          >
            <CalendarCheck aria-hidden />
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => changeMonth(-1)} className="size-10 text-slate-500 md:size-7">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => changeMonth(1)} className="size-10 text-slate-500 md:size-7">
            <ChevronRight />
          </Button>
        </div>
      </header>

      {/* Phones: week strip or compact month, the selected day's tasks, then the month's upcoming agenda */}
      <div data-testid="calendar-agenda" className="md:hidden">
        <div className="flex justify-center border-b border-slate-100 px-4 py-2">
          <SegmentedControl
            aria-label="Calendar layout"
            size="sm"
            options={MODE_OPTIONS}
            value={mobileMode}
            onValueChange={changeMobileMode}
          />
        </div>
        {mobileMode === 'week' ? (
          <WeekStrip
            selectedKey={selectedKey}
            month={month}
            tasksByDay={tasksByDay}
            onSelect={selectDay}
          />
        ) : (
          <MonthCompact
            days={days}
            selectedKey={selectedKey}
            tasksByDay={tasksByDay}
            onSelect={selectDay}
          />
        )}
        <DotLegend />
        <DayPanel
          ref={panelRef}
          dayKey={selectedKey}
          tasks={tasksByDay.get(selectedKey) ?? []}
          highlighted={flashKey === selectedKey}
          onOpen={open}
          onCreate={onCreate}
          canWrite={canWrite}
        />
        <UpcomingAgenda days={upcoming} monthLabel={formatMonth(month)} onOpen={open} />
      </div>

      {/* Tablet and desktop: month grid */}
      <div data-testid="calendar-grid" ref={gridRef} className="hidden overflow-x-auto md:block">
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
                  data-day-key={day.key}
                  tabIndex={-1}
                  onDragOver={event => {
                    event.preventDefault();
                    if (dragOverKey !== day.key) setDragOverKey(day.key);
                  }}
                  onDragLeave={event => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverKey(null);
                  }}
                  onDrop={event => handleDrop(event, day)}
                  className={cn(
                    'group relative min-h-28 border-b border-r border-slate-100 p-1.5 outline-none transition-colors [&:nth-child(7n)]:border-r-0',
                    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                    !day.inMonth && 'bg-slate-50/60',
                    dragOverKey === day.key && 'bg-blue-50/60 ring-1 ring-inset ring-primary/30',
                    flashKey === day.key && 'bg-blue-50 ring-2 ring-inset ring-primary',
                  )}
                >
                  <div className="flex items-center justify-between px-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        aria-current={day.isToday ? 'date' : undefined}
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                          day.isToday ? 'bg-primary font-semibold text-white' : day.inMonth ? 'text-slate-700' : 'text-slate-500',
                        )}
                      >
                        {day.date.getDate()}
                      </span>
                      <DayDots summary={summarizeDay(dayTasks)} />
                    </div>
                    {canWrite && (
                      <button
                        type="button"
                        aria-label={`Add task due ${day.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}
                        onClick={() => onCreate({ deadline: day.key })}
                        className="rounded p-0.5 text-slate-500 opacity-0 hover:bg-slate-200 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <ul className="mt-1 space-y-1">
                    {visible.map(task => (
                      <li key={task._id}>
                        <CalendarChip task={task} onOpen={open} draggable={canWrite} />
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

interface WeekStripProps {
  selectedKey: string;
  /** Shown month; days of other months in the strip are dimmed. */
  month: Date;
  tasksByDay: Map<string, Task[]>;
  onSelect: (key: string) => void;
}

/** Row of up to three small state dots (+N when more); decorative, the day button's label carries the summary. */
const DayDots = ({ summary, ringed = false }: { summary: DaySummary; ringed?: boolean }) => {
  if (summary.total === 0) return null;
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {summary.dots.map((dot, index) => (
        <span key={index} className={cn('size-1.5 shrink-0 rounded-full', dot.className, ringed && 'ring-1 ring-white')} />
      ))}
      {summary.overflow > 0 && (
        <span className="text-[10px] font-semibold leading-none tabular-nums">+{summary.overflow}</span>
      )}
    </span>
  );
};

/** Four dots with labels explaining the colors; wraps on narrow phones. */
const DotLegend = () => (
  <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2 text-xs text-slate-600">
    {(['pending', 'in-progress', 'completed', 'overdue'] as const).map(state => (
      <li key={state} className="flex items-center gap-1.5">
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT_META[state].dot)} />
        {DOT_META[state].legend}
      </li>
    ))}
  </ul>
);

const dayLabel = (key: string, summary: DaySummary) =>
  `${formatDate(key, { weekday: 'long', month: 'long', day: 'numeric' })}${summary.summary ? `, ${summary.summary}` : ''}`;

interface MonthCompactProps {
  days: CalendarDay[];
  selectedKey: string;
  tasksByDay: Map<string, Task[]>;
  onSelect: (key: string) => void;
}

/** Phone month grid: 7 columns of small cells with the date and colored dots; tap selects the day. */
const MonthCompact = ({ days, selectedKey, tasksByDay, onSelect }: MonthCompactProps) => (
  <div className="border-b border-slate-100 px-2 py-2">
    <div aria-hidden className="grid grid-cols-7 pb-1">
      {WEEKDAYS.map(day => (
        <div key={day} className="text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">{day.slice(0, 2)}</div>
      ))}
    </div>
    <ul aria-label="Month" className="grid grid-cols-7 gap-y-0.5">
      {days.map(day => {
        const selected = day.key === selectedKey;
        const summary = summarizeDay(tasksByDay.get(day.key) ?? []);
        return (
          <li key={day.key} className="min-w-0">
            <button
              type="button"
              aria-label={dayLabel(day.key, summary)}
              aria-pressed={selected}
              aria-current={day.isToday ? 'date' : undefined}
              data-phone-day-key={day.key}
              onClick={() => onSelect(day.key)}
              className={cn(
                'mx-auto flex h-10 w-full max-w-10 flex-col items-center justify-center gap-0.5 rounded-lg text-sm tabular-nums transition-colors motion-reduce:transition-none',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                selected ? 'bg-primary font-semibold text-white shadow-sm' : day.inMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:bg-slate-100',
                day.isToday && 'ring-2 ring-primary/60 ring-offset-1',
              )}
            >
              <span aria-hidden className="leading-none">{day.date.getDate()}</span>
              <span aria-hidden className="flex h-1.5 items-center">
                <DayDots summary={summary} ringed={selected} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);

/** Phone week strip: previous/next week, swipe, one pill per day with color-coded dots when tasks are due. */
const WeekStrip = ({ selectedKey, month, tasksByDay, onSelect }: WeekStripProps) => {
  const week = useMemo(() => buildWeek(parseDateKey(selectedKey), tasksByDay), [selectedKey, tasksByDay]);
  const touchStartX = useRef<number | null>(null);

  const handleTouchEnd = (event: TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const delta = event.changedTouches[0].clientX - start;
    if (Math.abs(delta) >= SWIPE_PX) onSelect(shiftWeek(selectedKey, delta < 0 ? 1 : -1));
  };

  return (
    <div className="flex items-center gap-0.5 border-b border-slate-100 px-1 py-3">
      <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => onSelect(shiftWeek(selectedKey, -1))} className="h-16 w-8 shrink-0 text-slate-500">
        <ChevronLeft />
      </Button>
      <ul
        aria-label="Week"
        onTouchStart={event => { touchStartX.current = event.touches[0].clientX; }}
        onTouchEnd={handleTouchEnd}
        // Seven columns always fit a 320 px phone: the whole week is visible without scrolling
        className="grid min-w-0 flex-1 grid-cols-7 gap-0.5"
      >
        {week.map(day => {
          const selected = day.key === selectedKey;
          const summary = summarizeDay(tasksByDay.get(day.key) ?? []);
          const label = dayLabel(day.key, summary);
          return (
            <li key={day.key} className="min-w-0">
              <button
                type="button"
                aria-label={label}
                aria-pressed={selected}
                aria-current={day.isToday ? 'date' : undefined}
                onClick={() => onSelect(day.key)}
                className={cn(
                  'flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-xl text-xs transition-colors active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  selected ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                  !selected && day.date.getMonth() !== month.getMonth() && 'text-slate-500',
                  day.isToday && 'ring-2 ring-primary/60 ring-offset-1',
                )}
              >
                <span className="text-[11px] font-medium uppercase tracking-wide" aria-hidden>{day.weekday}</span>
                <span className="text-base font-semibold tabular-nums" aria-hidden>{day.dayOfMonth}</span>
                <span aria-hidden className="flex h-1.5 items-center">
                  <DayDots summary={summary} ringed={selected} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => onSelect(shiftWeek(selectedKey, 1))} className="h-16 w-8 shrink-0 text-slate-500">
        <ChevronRight />
      </Button>
    </div>
  );
};

interface DayPanelProps extends Pick<TaskViewProps, 'onCreate'> {
  dayKey: string;
  tasks: Task[];
  /** Brief ring after "Today". */
  highlighted: boolean;
  onOpen: (task: Task) => void;
  canWrite: boolean;
  ref: Ref<HTMLElement>;
}

/** The selected day's tasks as colored event cards. */
const DayPanel = ({ dayKey, tasks, highlighted, onOpen, onCreate, canWrite, ref }: DayPanelProps) => {
  const isToday = dayKey === todayKey();
  const longLabel = formatDate(dayKey, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <section
      ref={ref}
      aria-label={`Tasks on ${longLabel}`}
      data-testid="calendar-day-panel"
      className={cn('scroll-mt-32 p-4 transition-shadow', highlighted && 'ring-2 ring-inset ring-primary/60')}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
          {formatDate(dayKey, { weekday: 'long', month: 'short', day: 'numeric' })}
          {isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">Today</span>}
        </h3>
        {canWrite && tasks.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Add task on ${formatDate(dayKey, { month: 'long', day: 'numeric' })}`}
            onClick={() => onCreate({ deadline: dayKey })}
            className="size-11 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Plus />
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <CalendarDays className="size-6 text-slate-300" aria-hidden />
          <p className="text-sm text-slate-500">{isToday ? 'Nothing due today.' : 'Nothing due this day.'}</p>
          {canWrite && (
            <Button onClick={() => onCreate({ deadline: dayKey })} className="mt-1 h-11 bg-primary px-4 text-white hover:bg-primary-hover">
              <Plus /> Add task
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {tasks.map(task => (
            <li key={task._id}>
              <EventCard task={task} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/** Colored event card: left bar by status, title, project, "start → due", badge and assignees. */
const EventCard = ({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);
  const range = formatTaskRange(task);
  const barClass = DOT_META[dotStateOf(task)].dot;

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className={cn(
        'relative flex min-h-16 w-full items-stretch gap-3 overflow-hidden rounded-xl border py-3 pl-4 pr-3 text-left',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.99] motion-reduce:active:scale-100',
        STATUS_META[task.status].surface,
        overdue && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1.5', barClass)} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-semibold', completed && 'line-through')}>{task.title}</span>
        {task.project && <ProjectChip name={task.project} link={false} className="mt-0.5 max-w-full text-xs" />}
        {range && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs tabular-nums opacity-80">
            <Clock className="size-3" aria-hidden />
            {range}
          </span>
        )}
        {overdue && <span className="sr-only"> (overdue)</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end justify-between gap-2">
        <StatusBadge status={task.status} className="bg-white/70" />
        <AssigneeStack users={task.assignees} max={3} />
      </span>
    </button>
  );
};

interface UpcomingAgendaProps {
  days: AgendaDay[];
  monthLabel: string;
  onOpen: (task: Task) => void;
}

/** Compact, collapsed-by-default list of the month's days that have tasks. */
const UpcomingAgenda = ({ days, monthLabel, onOpen }: UpcomingAgendaProps) => {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const total = days.reduce((sum, day) => sum + day.tasks.length, 0);

  return (
    <div className="border-t border-slate-100 px-4 py-2">
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded(value => !value)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span>
            Upcoming this month
            <span className="ml-2 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-500">{total}</span>
          </span>
          <ChevronDown aria-hidden className={cn('size-4 text-slate-500 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} />
        </button>
      </h3>

      <div id={listId} hidden={!expanded}>
        {expanded && (days.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No tasks due in {monthLabel}.</p>
        ) : (
          <ol className="mt-1 mb-2 space-y-4">
            {days.map(day => (
              <li key={day.key} data-testid="agenda-day" aria-current={day.isToday ? 'date' : undefined}>
                <h4 className={cn('flex items-center gap-2 text-sm font-semibold', day.isToday ? 'text-primary' : 'text-slate-700')}>
                  {formatDate(day.key, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {day.isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">Today</span>}
                </h4>
                <ul className={cn('mt-1 space-y-1.5 border-l-2 pl-3', day.isToday ? 'border-primary' : 'border-slate-100')}>
                  {day.tasks.map(task => (
                    <li key={task._id}>
                      <AgendaItem task={task} onOpen={onOpen} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ))}
      </div>
    </div>
  );
};

const AgendaItem = ({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className={cn(
        'flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium',
        STATUS_META[task.status].surface,
        overdue && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT_META[dotStateOf(task)].dot)} />
      <span className={cn('min-w-0 flex-1 truncate', completed && 'line-through')}>{task.title}</span>
      {task.labels?.slice(0, 2).map(label => <LabelChip key={label} label={label} className="max-w-20 shrink-0" />)}
      <span className="shrink-0 text-xs font-normal opacity-80">
        {STATUS_META[task.status].label}
        {overdue && <span className="sr-only"> (overdue)</span>}
      </span>
    </button>
  );
};

const CalendarChip = ({ task, onOpen, draggable }: { task: Task; onOpen: (task: Task) => void; draggable: boolean }) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);
  const labels = task.labels ?? [];

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={event => {
        event.dataTransfer.setData('text/plain', task._id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(task)}
      title={`${task.title} · ${STATUS_META[task.status].label}${labels.length ? ` · ${labels.join(', ')}` : ''}`}
      className={cn(
        'flex w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-xs font-medium',
        draggable && 'cursor-grab active:cursor-grabbing',
        STATUS_META[task.status].surface,
        overdue && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT_META[dotStateOf(task)].dot)} />
      <span className={cn('truncate', completed && 'line-through')}>{task.title}</span>
      {labels.length > 0 && (
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {labels.slice(0, 3).map(label => (
            <span key={label} aria-hidden className={cn('size-2 rounded-full ring-1 ring-white', getLabelStyle(label).dot)} />
          ))}
          <span className="sr-only">Labels: {labels.join(', ')}</span>
        </span>
      )}
    </button>
  );
};

export default CalendarView;
