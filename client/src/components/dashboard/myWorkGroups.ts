import { addDays, dateKeyOf, parseDateKey, toDateKey, todayKey, PRIORITY_META, type Task } from '@/features/tasks';

export type MyWorkBucket = 'overdue' | 'today' | 'week' | 'later';

export const MY_WORK_LABELS: Record<MyWorkBucket, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'This week',
  later: 'Later',
};

const BUCKET_ORDER: MyWorkBucket[] = ['overdue', 'today', 'week', 'later'];

/** Rows the dashboard card shows before "View all". */
export const MY_WORK_LIMIT = 8;
/** "Recently completed" looks back this many days. */
export const RECENT_DAYS = 7;

export interface MyWorkGroup {
  bucket: MyWorkBucket;
  label: string;
  /** Tasks shown in this group (after the row limit). */
  tasks: Task[];
  /** Open tasks of this bucket, including those cut by the limit. */
  total: number;
}

export interface MyWork {
  groups: MyWorkGroup[];
  /** All of my open tasks. */
  total: number;
  /** Rows actually shown. */
  shown: number;
  /** Tasks I finished in the last `RECENT_DAYS` days. */
  completedRecently: number;
}

const isMine = (task: Task, userId: string) => Boolean(task.assignees?.some(person => person._id === userId));

/** Which bucket a deadline falls in. `today` is a `YYYY-MM-DD` key; "this week" is the 7 days after today. */
export const bucketOf = (deadline: string, today: string): MyWorkBucket => {
  const key = dateKeyOf(deadline);
  if (key < today) return 'overdue';
  if (key === today) return 'today';
  return key <= toDateKey(addDays(parseDateKey(today), 7)) ? 'week' : 'later';
};

const byUrgency = (a: Task, b: Task) =>
  dateKeyOf(a.deadline).localeCompare(dateKeyOf(b.deadline))
  || PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank
  || a.title.localeCompare(b.title);

/**
 * The tasks assigned to `userId`, grouped by urgency: overdue, due today, this week, later.
 * Only the first `limit` rows (in that order, most urgent first) are returned in `groups`.
 */
export const buildMyWork = (
  tasks: readonly Task[],
  userId: string,
  { today = todayKey(), limit = MY_WORK_LIMIT, now = new Date() }: { today?: string; limit?: number; now?: Date } = {},
): MyWork => {
  const open = tasks.filter(task => task.status !== 'completed' && isMine(task, userId));
  const buckets: Record<MyWorkBucket, Task[]> = { overdue: [], today: [], week: [], later: [] };
  for (const task of open) buckets[bucketOf(task.deadline, today)].push(task);

  let remaining = Math.max(limit, 0);
  const groups: MyWorkGroup[] = [];
  for (const bucket of BUCKET_ORDER) {
    const sorted = buckets[bucket].sort(byUrgency);
    if (sorted.length === 0) continue;
    const shownTasks = sorted.slice(0, remaining);
    remaining -= shownTasks.length;
    if (shownTasks.length > 0) groups.push({ bucket, label: MY_WORK_LABELS[bucket], tasks: shownTasks, total: sorted.length });
  }

  const since = now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const completedRecently = tasks.filter(task => {
    if (task.status !== 'completed' || !isMine(task, userId) || !task.completedAt) return false;
    const finished = Date.parse(task.completedAt);
    return Number.isFinite(finished) && finished >= since && finished <= now.getTime() + 60_000;
  }).length;

  return { groups, total: open.length, shown: groups.reduce((sum, group) => sum + group.tasks.length, 0), completedRecently };
};
