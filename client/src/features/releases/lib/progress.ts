import { addDays, dateKeyOf, diffInDays, formatDate, parseDateKey, toDateKey } from '@/features/tasks/lib/date';
import type { TaskStatus } from '@/features/tasks/types';
import type { Release, ReleaseProgress, ReleaseStatus, ReleaseTask } from '../types';

/** Select value standing for "no release". */
export const NO_RELEASE_VALUE = 'none';

export const RELEASE_STATUS_META: Record<ReleaseStatus, { label: string; tone: 'primary' | 'success' | 'neutral' }> = {
  unreleased: { label: 'Unreleased', tone: 'primary' },
  released: { label: 'Released', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
};

const SHORT = { month: 'short', day: 'numeric' } as const;

/** Share of finished work (0-100): story points when the release has any, else task counts. */
export const releasePercent = (progress: ReleaseProgress): number => {
  const { points, counts } = progress;
  const basis = points.total > 0 ? points : counts;
  return basis.total === 0 ? 0 : Math.round((basis.completed / basis.total) * 100);
};

/** "3 of 5 tasks · 8 of 13 points done" (points are left out when nothing is estimated). */
export const describeReleaseProgress = (progress: ReleaseProgress): string => {
  const { counts, points } = progress;
  if (counts.total === 0) return 'No tasks yet';
  const tasks = `${counts.completed} of ${counts.total} ${counts.total === 1 ? 'task' : 'tasks'}`;
  return points.total > 0 ? `${tasks} · ${points.completed} of ${points.total} pts` : tasks;
};

/** "Oct 1 – Oct 14, 2026", "Due Oct 14, 2026", "Starts Oct 1, 2026" or "No dates set". */
export const formatReleaseDates = (release: Pick<Release, 'startDate' | 'releaseDate'>): string => {
  const start = release.startDate ? dateKeyOf(release.startDate) : '';
  const end = release.releaseDate ? dateKeyOf(release.releaseDate) : '';
  if (start && end) return `${formatDate(start, SHORT)} – ${formatDate(end)}`;
  if (end) return `Due ${formatDate(end)}`;
  if (start) return `Starts ${formatDate(start)}`;
  return 'No dates set';
};

/** Days-left sentence of an unreleased release: "Due in 5 days", "Due today", "Overdue by 3 days". */
export const describeReleaseDue = (release: Pick<Release, 'status' | 'releaseDate'>, today: Date = new Date()): string => {
  if (release.status !== 'unreleased' || !release.releaseDate) return '';
  const days = diffInDays(today, parseDateKey(release.releaseDate));
  const plural = (value: number) => `${value} ${value === 1 ? 'day' : 'days'}`;
  if (days < 0) return `Overdue by ${plural(-days)}`;
  if (days === 0) return 'Due today';
  return `Due in ${plural(days)}`;
};

/** Default dates of a new release: starts today and ships two weeks later. */
export const suggestReleaseDates = (today: Date = new Date()): { startDate: string; releaseDate: string } => ({
  startDate: toDateKey(today),
  releaseDate: toDateKey(addDays(today, 14)),
});

/** Next free-looking version label: bumps the minor part of the latest "v1.2.0"-style name, else "v1.0.0". */
export const suggestReleaseName = (releases: Pick<Release, 'name'>[]): string => {
  let best: [number, number, number] | null = null;
  for (const { name } of releases) {
    const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/i.exec(name.trim());
    if (!match) continue;
    const parts: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
    if (!best || parts[0] > best[0] || (parts[0] === best[0] && (parts[1] > best[1] || (parts[1] === best[1] && parts[2] > best[2])))) best = parts;
  }
  return best ? `v${best[0]}.${best[1] + 1}.0` : 'v1.0.0';
};

/**
 * Releases a task of `projectId` can join: the project's unreleased ones, plus the one it is already in
 * (even when released or archived) so the select can show it. "No release" comes first.
 */
export const releaseOptionsFor = (
  releases: Release[],
  projectId: string | undefined,
  currentId = '',
): { value: string; label: string }[] => {
  const usable = releases.filter(release => release._id === currentId || (release.project === projectId && release.status === 'unreleased'));
  return [
    { value: NO_RELEASE_VALUE, label: 'No release' },
    ...usable.map(release => ({
      value: release._id,
      label: release.status === 'unreleased' ? release.name : `${release.name} (${release.status})`,
    })),
  ];
};

export interface ReleaseTaskGroup {
  status: TaskStatus;
  label: string;
  tasks: ReleaseTask[];
}

const GROUP_ORDER: { status: TaskStatus; label: string }[] = [
  { status: 'in-progress', label: 'In progress' },
  { status: 'pending', label: 'To do' },
  { status: 'completed', label: 'Done' },
];

/** Tasks of a release by status group (in progress, to do, done); empty groups are left out. */
export const groupReleaseTasks = (tasks: ReleaseTask[]): ReleaseTaskGroup[] =>
  GROUP_ORDER
    .map(({ status, label }) => ({ status, label, tasks: tasks.filter(task => task.status === status) }))
    .filter(group => group.tasks.length > 0);

/** Releases of one project that are not archived, soonest release date first (undated last). */
export const upcomingReleases = (releases: Release[], projectId: string): Release[] =>
  releases
    .filter(release => release.project === projectId && release.status === 'unreleased')
    .sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999') || a.name.localeCompare(b.name));
