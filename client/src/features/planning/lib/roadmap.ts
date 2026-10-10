// Roadmap: epics on a time axis. Pure helpers (grouping, axis, bar placement), no UI.
import {
  addDays, dateKeyOf, diffInDays, epicProgress, formatDate, parseDateKey, toDateKey,
  type Task,
} from '@/features/tasks';
import type { Project, Sprint } from '@/features/projects';

export type RoadmapZoom = 'months' | 'weeks';

/** Pixels per calendar day at each zoom (about 150px per month, 112px per week). */
export const DAY_PX: Record<RoadmapZoom, number> = { months: 5, weeks: 16 };

/** Narrowest bar, so a one-day epic can still be seen and clicked. */
export const MIN_BAR_PX = 12;

export type EpicHealth = 'done' | 'overdue' | 'in-progress' | 'upcoming';

export interface RoadmapEpic {
  id: string;
  title: string;
  projectName: string;
  /** `YYYY-MM-DD` of the earliest start over the epic and its items. */
  start: string;
  /** `YYYY-MM-DD` of the latest due date over the epic and its items. */
  end: string;
  percent: number;
  unit: 'points' | 'items';
  items: number;
  doneItems: number;
  points: number;
  donePoints: number;
  health: EpicHealth;
}

export interface RoadmapGroup {
  id: string;
  name: string;
  project?: Project;
  epics: RoadmapEpic[];
}

export const HEALTH_LABEL: Record<EpicHealth, string> = {
  done: 'Done',
  overdue: 'Overdue',
  'in-progress': 'In progress',
  upcoming: 'Upcoming',
};

const nameKey = (name: string | undefined | null) => (name ?? '').trim().toLowerCase();

const healthOf = (
  epic: Task, start: string, end: string, percent: number, items: number, doneItems: number, today: string,
): EpicHealth => {
  const done = epic.status === 'completed' || (items > 0 && doneItems === items);
  if (done) return 'done';
  if (end < today) return 'overdue';
  if (start > today && percent === 0) return 'upcoming';
  return 'in-progress';
};

export interface RoadmapOptions {
  /** Only this project's epics (project id); `all` or unset shows every project. */
  projectId?: string;
  today?: Date;
}

/**
 * Epics grouped by project (archived projects hidden), each with its rolled-up dates and progress.
 * Groups follow the order of `projects`; epics without a project come last. Empty groups are dropped.
 */
export const buildRoadmap = (tasks: Task[], projects: Project[], options: RoadmapOptions = {}): RoadmapGroup[] => {
  const today = toDateKey(options.today ?? new Date());
  const active = projects.filter(project => !project.archived);
  const known = new Set(projects.map(project => nameKey(project.name)));
  const selected = options.projectId && options.projectId !== 'all'
    ? projects.find(project => project._id === options.projectId)
    : undefined;

  const epics = tasks.filter(task => task.type === 'epic' && !task.parent);
  const toRow = (epic: Task): RoadmapEpic => {
    const progress = epicProgress(epic, tasks);
    return {
      id: epic._id,
      title: epic.title,
      projectName: epic.project ?? '',
      start: progress.start,
      end: progress.end,
      percent: progress.percent,
      unit: progress.unit,
      items: progress.items,
      doneItems: progress.doneItems,
      points: progress.points,
      donePoints: progress.donePoints,
      health: healthOf(epic, progress.start, progress.end, progress.percent, progress.items, progress.doneItems, today),
    };
  };
  const sortRows = (rows: RoadmapEpic[]) =>
    rows.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

  const groups: RoadmapGroup[] = [];
  for (const project of active) {
    if (selected && project._id !== selected._id) continue;
    const rows = epics.filter(epic => nameKey(epic.project) === nameKey(project.name)).map(toRow);
    if (rows.length > 0) groups.push({ id: project._id, name: project.name, project, epics: sortRows(rows) });
  }
  if (!selected) {
    // Epics of a project the workspace no longer lists (or of none) stay visible; archived projects are hidden
    const loose = epics.filter(epic => !known.has(nameKey(epic.project))).map(toRow);
    if (loose.length > 0) groups.push({ id: 'none', name: 'No project', epics: sortRows(loose) });
  }
  return groups;
};

/** "Oct 3 – Nov 12, 2026"; the year shows once when both ends share it. */
export const formatSpan = (start: string, end: string): string => {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const from = formatDate(start, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  const to = formatDate(end, { month: 'short', day: 'numeric', year: 'numeric' });
  return start === end ? to : `${from} – ${to}`;
};

export interface DateSpan {
  start: string;
  end: string;
}

export interface AxisTick {
  key: string;
  label: string;
  left: number;
  width: number;
}

export interface RoadmapAxis {
  start: Date;
  end: Date;
  days: number;
  dayPx: number;
  /** Pixel width of the whole axis. */
  width: number;
  ticks: AxisTick[];
  /** Pixel offset of today's line, or null when today is outside the axis. */
  todayLeft: number | null;
}

const mondayOf = (date: Date): Date => addDays(date, -((date.getDay() + 6) % 7));
const endOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() + 1, 0);

/**
 * The visible time range for some spans (and today), snapped to whole months or weeks,
 * with a header tick per month or per week. Always at least about a quarter wide.
 */
/** Width of the epic-name column of the desktop timeline (px). */
export const ROADMAP_LABEL_WIDTH = 224;

export const buildAxis = (spans: DateSpan[], zoom: RoadmapZoom, today: Date = new Date(), minWidth = 0): RoadmapAxis => {
  const keys = [toDateKey(today), ...spans.flatMap(span => [span.start, span.end])].map(dateKeyOf).sort();
  const first = parseDateKey(keys[0]);
  const last = parseDateKey(keys[keys.length - 1]);

  let start: Date;
  let end: Date;
  if (zoom === 'months') {
    start = new Date(first.getFullYear(), first.getMonth(), 1);
    end = endOfMonth(last);
    const minEnd = endOfMonth(new Date(start.getFullYear(), start.getMonth() + 2, 1));
    if (end < minEnd) end = minEnd;
  } else {
    start = mondayOf(addDays(first, -3));
    end = addDays(mondayOf(addDays(last, 7)), 6);
    const minEnd = addDays(start, 7 * 8 - 1);
    if (end < minEnd) end = minEnd;
  }

  const days = diffInDays(start, end) + 1;
  // Days widen to fill the available width (never narrower than the zoom's default)
  const dayPx = Math.max(DAY_PX[zoom], minWidth > 0 ? minWidth / days : 0);
  const ticks: AxisTick[] = [];
  if (zoom === 'months') {
    for (let cursor = start; cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      ticks.push({
        key: toDateKey(cursor),
        label: cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        left: diffInDays(start, cursor) * dayPx,
        width: endOfMonth(cursor).getDate() * dayPx,
      });
    }
  } else {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
      ticks.push({
        key: toDateKey(cursor),
        label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        left: diffInDays(start, cursor) * dayPx,
        width: 7 * dayPx,
      });
    }
  }

  const todayOffset = diffInDays(start, today);
  return {
    start, end, days, dayPx, width: days * dayPx, ticks,
    todayLeft: todayOffset >= 0 && todayOffset < days ? todayOffset * dayPx + dayPx / 2 : null,
  };
};

export interface Placement {
  left: number;
  width: number;
}

/** Where a bar from `span.start` to `span.end` (inclusive days) sits on the axis. */
export const placeSpan = (span: DateSpan, axis: RoadmapAxis): Placement => {
  const left = diffInDays(axis.start, parseDateKey(span.start)) * axis.dayPx;
  const width = (diffInDays(parseDateKey(span.start), parseDateKey(span.end)) + 1) * axis.dayPx;
  return { left, width: Math.max(MIN_BAR_PX, width) };
};

export interface SprintBand extends Placement {
  id: string;
  name: string;
  status: Sprint['status'];
}

/** Header bands for the sprints of a project, in start order. */
export const sprintBands = (sprints: Sprint[], axis: RoadmapAxis): SprintBand[] =>
  [...sprints]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map(sprint => ({
      id: sprint._id,
      name: sprint.name,
      status: sprint.status,
      ...placeSpan({ start: dateKeyOf(sprint.startDate), end: dateKeyOf(sprint.endDate) }, axis),
    }));

/** Text alternative of one epic bar. */
export const describeEpic = (epic: RoadmapEpic): string => {
  const work = epic.items === 0
    ? 'no items yet'
    : `${epic.doneItems} of ${epic.items} ${epic.items === 1 ? 'item' : 'items'} done${epic.points > 0 ? `, ${epic.donePoints} of ${epic.points} points` : ''}`;
  return `${epic.title}, ${formatSpan(epic.start, epic.end)}, ${epic.percent}% complete, ${work}, ${HEALTH_LABEL[epic.health].toLowerCase()}`;
};
