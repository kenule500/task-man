import type { Task, TaskPatch } from '../types';
import {
  addDays, dateKeyOf, diffInDays, isSameDay, parseDateKey, startOfMonth, toDateKey,
} from './date';

// ---------------------------------------------------------------------------
// Shared scheduling rules (used by Calendar and Timeline)
// ---------------------------------------------------------------------------

/** First scheduled day of a task; falls back to the deadline for one-day tasks. */
export const getStartKey = (task: Task): string => dateKeyOf(task.startDate || task.deadline);

/** Moves a task so it ends on `deadlineKey`, keeping its duration. */
export const rescheduleToDeadline = (task: Task, deadlineKey: string): TaskPatch => {
  const delta = diffInDays(parseDateKey(task.deadline), parseDateKey(deadlineKey));
  return shiftTask(task, delta);
};

/** Shifts start and deadline by the same number of days. */
export const shiftTask = (task: Task, days: number): TaskPatch => ({
  deadline: toDateKey(addDays(parseDateKey(task.deadline), days)),
  ...(task.startDate && { startDate: toDateKey(addDays(parseDateKey(task.startDate), days)) }),
});

/** Changes the deadline by `days`, never before the start. */
export const resizeTask = (task: Task, days: number): TaskPatch => {
  const start = parseDateKey(getStartKey(task));
  const next = addDays(parseDateKey(task.deadline), days);
  return {
    startDate: toDateKey(start),
    deadline: toDateKey(next < start ? start : next),
  };
};

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface CalendarDay {
  date: Date;
  key: string;
  inMonth: boolean;
  isToday: boolean;
}

/** Six full weeks around `month`, so the grid never changes height. */
export const buildMonthGrid = (month: Date, today = new Date(), weekStartsOn = 0): CalendarDay[] => {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -((first.getDay() - weekStartsOn + 7) % 7));

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      key: toDateKey(date),
      inMonth: date.getMonth() === first.getMonth(),
      isToday: isSameDay(date, today),
    };
  });
};

export const groupByDeadline = (tasks: Task[]): Map<string, Task[]> => {
  const days = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = dateKeyOf(task.deadline);
    days.set(key, [...(days.get(key) ?? []), task]);
  }
  return days;
};

// ---------------------------------------------------------------------------
// Timeline / Gantt
// ---------------------------------------------------------------------------

export interface TimelineRow {
  task: Task;
  /** Day index of the first day of the bar */
  offset: number;
  /** Number of days covered (>= 1) */
  span: number;
}

export interface TimelineLink {
  fromId: string;
  toId: string;
  /** The dependant starts before its prerequisite is due */
  conflict: boolean;
}

export interface TimelineLayout {
  start: Date;
  days: Date[];
  rows: TimelineRow[];
  links: TimelineLink[];
}

interface TimelineOptions {
  paddingDays?: number;
  minDays?: number;
  today?: Date;
}

/** Computes bar positions and dependency links for a Gantt chart. */
export const buildTimeline = (
  tasks: Task[],
  { paddingDays = 3, minDays = 28, today = new Date() }: TimelineOptions = {},
): TimelineLayout => {
  const starts = tasks.map(task => parseDateKey(getStartKey(task)));
  const ends = tasks.map(task => parseDateKey(task.deadline));

  const earliest = [today, ...starts].reduce((min, d) => (d < min ? d : min));
  const latest = [today, ...ends].reduce((max, d) => (d > max ? d : max));

  const start = addDays(earliest, -paddingDays);
  const length = Math.max(diffInDays(start, latest) + 1 + paddingDays, minDays);
  const days = Array.from({ length }, (_, i) => addDays(start, i));

  const rows = tasks
    .map((task, i) => ({
      task,
      offset: diffInDays(start, starts[i]),
      span: Math.max(diffInDays(starts[i], ends[i]) + 1, 1),
    }))
    .sort((a, b) => a.offset - b.offset || a.task.deadline.localeCompare(b.task.deadline));

  const byId = new Map(tasks.map(task => [task._id, task]));
  const links: TimelineLink[] = [];
  for (const task of tasks) {
    for (const depId of task.dependencies ?? []) {
      const prerequisite = byId.get(depId);
      if (!prerequisite) continue;
      links.push({
        fromId: depId,
        toId: task._id,
        conflict: getStartKey(task) < dateKeyOf(prerequisite.deadline),
      });
    }
  }

  return { start, days, rows, links };
};

/** Groups consecutive days into month segments for the timeline header. */
export const groupDaysByMonth = (days: Date[]) => {
  const segments: { label: string; offset: number; span: number }[] = [];
  days.forEach((day, index) => {
    const label = day.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const last = segments[segments.length - 1];
    if (last && last.label === label) last.span += 1;
    else segments.push({ label, offset: index, span: 1 });
  });
  return segments;
};

/** SVG elbow connector from the end of `from` to the start of `to`. */
export const getLinkPath = (
  from: TimelineRow,
  to: TimelineRow,
  fromIndex: number,
  toIndex: number,
  dayWidth: number,
  rowHeight: number,
): string => {
  const x1 = (from.offset + from.span) * dayWidth - 2;
  const y1 = fromIndex * rowHeight + rowHeight / 2;
  const x2 = to.offset * dayWidth + 2;
  const y2 = toIndex * rowHeight + rowHeight / 2;
  const gap = 8;

  if (x2 - x1 >= gap * 2) return `M${x1},${y1} H${x1 + gap} V${y2} H${x2}`;

  // Not enough room between the bars: route along the row boundary
  const boundaryY = toIndex > fromIndex ? toIndex * rowHeight : (toIndex + 1) * rowHeight;
  return `M${x1},${y1} H${x1 + gap} V${boundaryY} H${x2 - gap} V${y2} H${x2}`;
};
