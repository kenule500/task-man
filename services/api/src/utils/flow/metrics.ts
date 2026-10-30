// Pure Kanban flow metrics (cumulative flow, cycle and lead time, aging work in progress, throughput).
// Days are UTC calendar days (YYYY-MM-DD); durations are in days.

export const FLOW_STATUSES = ['pending', 'in-progress', 'completed'] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

export const DAY_MS = 86_400_000;
export const MAX_FLOW_RANGE_DAYS = 180;

/** One recorded status move (`from` is null for creation). */
export interface FlowTransition {
  task: string;
  from: FlowStatus | null;
  to: FlowStatus;
  at: Date;
}

/** The task fields the metrics need. `key` is the display key ("WEB-12", '' when unnumbered). */
export interface FlowTask {
  id: string;
  key: string;
  title: string;
  project: string;
  status: FlowStatus;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date | null;
  assignees?: string[];
}

/** The state a task entered at `at` (ms since epoch). */
export interface FlowStep {
  at: number;
  status: FlowStatus;
}

export type Timelines = Map<string, FlowStep[]>;

export interface FlowRange {
  from: string;
  to: string;
  /** Start of `from` and last millisecond of `to`, in ms since epoch. */
  start: number;
  end: number;
  days: number;
}

// ----------------------------------------------------------------
// Dates
// ----------------------------------------------------------------
export const dayKey = (date: Date | number): string => new Date(date).toISOString().slice(0, 10);

/** Strict YYYY-MM-DD → start of that UTC day in ms, or null for anything else (including 2026-02-30). */
export const parseDayKey = (key: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const ms = Date.parse(`${key}T00:00:00.000Z`);
  return Number.isNaN(ms) || dayKey(ms) !== key ? null : ms;
};

export const makeRange = (from: string, to: string): FlowRange => {
  const start = parseDayKey(from);
  const endDay = parseDayKey(to);
  if (start === null || endDay === null || endDay < start) throw new RangeError('Invalid date range');
  return { from, to, start, end: endDay + DAY_MS - 1, days: Math.round((endDay - start) / DAY_MS) + 1 };
};

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const daysBetween = (fromMs: number, toMs: number): number => Math.max(0, toMs - fromMs) / DAY_MS;

// ----------------------------------------------------------------
// Timelines
// ----------------------------------------------------------------
/**
 * The ordered states each task went through. Old data is backfilled: a task without transitions starts at
 * `createdAt` in its current status; a task whose first transition has a `from` was created in that status; and
 * a current status the log does not end with (changed by a path that records nothing) is appended at its last update.
 */
export const buildTimelines = (transitions: FlowTransition[], tasks: FlowTask[]): Timelines => {
  const byTask = new Map<string, FlowTransition[]>();
  for (const transition of transitions) {
    const list = byTask.get(transition.task);
    if (list) list.push(transition);
    else byTask.set(transition.task, [transition]);
  }

  const timelines: Timelines = new Map();
  for (const task of tasks) {
    const created = task.createdAt.getTime();
    const list = (byTask.get(task.id) ?? []).slice().sort((a, b) => a.at.getTime() - b.at.getTime());
    const steps: FlowStep[] = [];
    if (list.length === 0) {
      steps.push({ at: created, status: task.status });
    } else {
      if (list[0].from !== null) steps.push({ at: Math.min(created, list[0].at.getTime()), status: list[0].from });
      for (const transition of list) steps.push({ at: transition.at.getTime(), status: transition.to });
    }

    const collapsed = steps.filter((step, index) => index === 0 || step.status !== steps[index - 1].status);
    const last = collapsed[collapsed.length - 1];
    if (last.status !== task.status) {
      const changedAt = task.status === 'completed'
        ? task.completedAt ?? task.updatedAt ?? task.createdAt
        : task.updatedAt ?? task.createdAt;
      collapsed.push({ at: Math.max(last.at, changedAt.getTime()), status: task.status });
    }
    timelines.set(task.id, collapsed);
  }
  return timelines;
};

// ----------------------------------------------------------------
// Cumulative flow
// ----------------------------------------------------------------
export interface CfdDay {
  date: string;
  pending: number;
  inProgress: number;
  completed: number;
}

const CFD_FIELD = { pending: 'pending', 'in-progress': 'inProgress', completed: 'completed' } as const;

/** Tasks per status at the end of every day of the range. Tasks that do not exist yet are not counted. */
export const cumulativeFlow = (timelines: Timelines, range: FlowRange): CfdDay[] => {
  const rows: CfdDay[] = Array.from({ length: range.days }, (_, index) => ({
    date: dayKey(range.start + index * DAY_MS), pending: 0, inProgress: 0, completed: 0,
  }));
  const dayIndex = (ms: number) => Math.floor((ms - range.start) / DAY_MS);

  for (const steps of timelines.values()) {
    steps.forEach((step, index) => {
      const next = steps[index + 1];
      const first = Math.max(dayIndex(step.at), 0);
      const last = Math.min(next ? dayIndex(next.at) : range.days, range.days);
      const field = CFD_FIELD[step.status];
      for (let day = first; day < last; day++) rows[day][field]++;
    });
  }
  return rows;
};

// ----------------------------------------------------------------
// Cycle and lead time
// ----------------------------------------------------------------
export interface TimePoint {
  taskId: string;
  key: string;
  title: string;
  completedAt: string;
  days: number;
}

export interface TimeStats {
  count: number;
  average: number | null;
  p50: number | null;
  p85: number | null;
  p95: number | null;
  points: TimePoint[];
}

/** Nearest-rank percentile of an ascending list. */
export const percentile = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
};

const summarize = (points: TimePoint[]): TimeStats => {
  const sorted = points.map(point => point.days).sort((a, b) => a - b);
  const stat = (p: number) => {
    const value = percentile(sorted, p);
    return value === null ? null : round(value);
  };
  return {
    count: points.length,
    average: points.length === 0 ? null : round(sorted.reduce((sum, value) => sum + value, 0) / points.length),
    p50: stat(50),
    p85: stat(85),
    p95: stat(95),
    points,
  };
};

/** When the task last reached completed, or null while it is not completed (a reopened task has no completion). */
const lastCompletion = (steps: FlowStep[]): number | null => {
  const last = steps[steps.length - 1];
  return last?.status === 'completed' ? last.at : null;
};

const completedTimes = (
  timelines: Timelines,
  tasks: FlowTask[],
  range: FlowRange,
  startOf: (steps: FlowStep[], task: FlowTask, completedAt: number) => number | null,
): TimeStats => {
  const points: TimePoint[] = [];
  for (const task of tasks) {
    const steps = timelines.get(task.id);
    const completedAt = steps ? lastCompletion(steps) : null;
    if (!steps || completedAt === null || completedAt < range.start || completedAt > range.end) continue;
    const startedAt = startOf(steps, task, completedAt);
    if (startedAt === null) continue;
    points.push({
      taskId: task.id, key: task.key, title: task.title,
      completedAt: new Date(completedAt).toISOString(), days: round(daysBetween(startedAt, completedAt)),
    });
  }
  points.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  return summarize(points);
};

/**
 * Days from the first entry into in-progress to the last completion, for tasks completed inside the range.
 * Tasks that went straight from pending to completed never started, so they have no cycle time.
 */
export const cycleTimes = (timelines: Timelines, tasks: FlowTask[], range: FlowRange): TimeStats =>
  completedTimes(timelines, tasks, range, (steps, _task, completedAt) =>
    steps.find(step => step.status === 'in-progress' && step.at <= completedAt)?.at ?? null);

/** Days from creation to the last completion, for tasks completed inside the range. */
export const leadTimes = (timelines: Timelines, tasks: FlowTask[], range: FlowRange): TimeStats =>
  completedTimes(timelines, tasks, range, (steps, task) => Math.min(task.createdAt.getTime(), steps[0].at));

// ----------------------------------------------------------------
// Aging work in progress
// ----------------------------------------------------------------
export interface AgingItem {
  taskId: string;
  key: string;
  title: string;
  project: string;
  assignees: string[];
  since: string;
  days: number;
}

/** Tasks in progress now, with the days since they last entered in-progress, oldest first. */
export const agingWip = (timelines: Timelines, tasks: FlowTask[], now: number): AgingItem[] => {
  const items: AgingItem[] = [];
  for (const task of tasks) {
    if (task.status !== 'in-progress') continue;
    const steps = timelines.get(task.id) ?? [];
    const last = steps[steps.length - 1];
    const since = last?.status === 'in-progress' ? last.at : task.createdAt.getTime();
    items.push({
      taskId: task.id, key: task.key, title: task.title, project: task.project, assignees: task.assignees ?? [],
      since: new Date(since).toISOString(), days: round(daysBetween(since, now)),
    });
  }
  return items.sort((a, b) => b.days - a.days || a.key.localeCompare(b.key) || a.title.localeCompare(b.title));
};

// ----------------------------------------------------------------
// Throughput
// ----------------------------------------------------------------
export interface ThroughputWeek {
  /** ISO week label, e.g. 2026-W41. */
  week: string;
  /** Monday of the week (YYYY-MM-DD). */
  start: string;
  count: number;
}

const mondayOf = (ms: number): number => {
  const dayStart = Math.floor(ms / DAY_MS) * DAY_MS;
  const weekday = (new Date(dayStart).getUTCDay() + 6) % 7;
  return dayStart - weekday * DAY_MS;
};

/** ISO 8601 week label of the week that starts on `monday`. */
export const isoWeekLabel = (monday: number): string => {
  // The Thursday of the week decides the ISO year
  const thursday = new Date(monday + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const firstThursday = Date.UTC(year, 0, 4);
  const week = 1 + Math.round((mondayOf(thursday.getTime()) - mondayOf(firstThursday)) / (7 * DAY_MS));
  return `${year}-W${String(week).padStart(2, '0')}`;
};

/** Tasks completed per ISO week of the range (a task counts once, at its last completion). */
export const throughput = (timelines: Timelines, tasks: FlowTask[], range: FlowRange): ThroughputWeek[] => {
  const weeks: ThroughputWeek[] = [];
  for (let monday = mondayOf(range.start); monday <= range.end; monday += 7 * DAY_MS) {
    weeks.push({ week: isoWeekLabel(monday), start: dayKey(monday), count: 0 });
  }
  const first = mondayOf(range.start);
  for (const task of tasks) {
    const steps = timelines.get(task.id);
    const completedAt = steps ? lastCompletion(steps) : null;
    if (completedAt === null || completedAt < range.start || completedAt > range.end) continue;
    weeks[Math.floor((mondayOf(completedAt) - first) / (7 * DAY_MS))].count++;
  }
  return weeks;
};

// ----------------------------------------------------------------
// Whole report
// ----------------------------------------------------------------
export interface FlowReportData {
  cfd: CfdDay[];
  cycleTime: TimeStats;
  leadTime: TimeStats;
  aging: AgingItem[];
  throughput: ThroughputWeek[];
}

export const buildFlowReport = (
  transitions: FlowTransition[],
  tasks: FlowTask[],
  range: FlowRange,
  now: number = Date.now(),
): FlowReportData => {
  const timelines = buildTimelines(transitions, tasks);
  return {
    cfd: cumulativeFlow(timelines, range),
    cycleTime: cycleTimes(timelines, tasks, range),
    leadTime: leadTimes(timelines, tasks, range),
    aging: agingWip(timelines, tasks, now),
    throughput: throughput(timelines, tasks, range),
  };
};
