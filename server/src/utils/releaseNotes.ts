// Pure helpers for releases: progress numbers and generated release notes (unit tested).
import type { TaskStatus, TaskType } from '../models/taskModel.js';

export interface ReleaseTaskLike {
  _id: unknown;
  number?: number;
  title: string;
  type: TaskType | string;
  status: TaskStatus | string;
  storyPoints?: number | null;
}

export interface GroupTotals {
  pending: number;
  'in-progress': number;
  completed: number;
  total: number;
}

export interface ReleaseProgress {
  counts: GroupTotals;
  points: GroupTotals;
  overdue: boolean;
}

const emptyTotals = (): GroupTotals => ({ pending: 0, 'in-progress': 0, completed: 0, total: 0 });

const groupOf = (status: string): keyof Omit<GroupTotals, 'total'> =>
  status === 'completed' || status === 'in-progress' ? status : 'pending';

/** Counts and story points per status group; epics and subtasks are expected to be left out by the caller. */
export const summarizeProgress = (
  tasks: readonly Pick<ReleaseTaskLike, 'status' | 'storyPoints'>[],
  release: { status: string; releaseDate?: Date | null },
  now: Date = new Date(),
): ReleaseProgress => {
  const counts = emptyTotals();
  const points = emptyTotals();
  for (const task of tasks) {
    const group = groupOf(task.status);
    counts[group] += 1;
    counts.total += 1;
    points[group] += task.storyPoints ?? 0;
    points.total += task.storyPoints ?? 0;
  }
  return { counts, points, overdue: isReleaseOverdue(release, now) };
};

/** A release is overdue when it is still open and its release day (a UTC calendar day) is before today. */
export const isReleaseOverdue = (
  release: { status: string; releaseDate?: Date | null },
  now: Date = new Date(),
): boolean => {
  if (release.status !== 'unreleased' || !release.releaseDate) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return release.releaseDate.getTime() < today;
};

export const NOTE_GROUPS: readonly { type: string; heading: string }[] = [
  { type: 'story', heading: 'Features' },
  { type: 'bug', heading: 'Fixes' },
  { type: 'task', heading: 'Tasks' },
  { type: 'spike', heading: 'Spikes' },
];

export interface ReleaseNoteItem {
  id: string;
  key: string;
  title: string;
}

export interface ReleaseNoteGroup {
  type: string;
  heading: string;
  items: ReleaseNoteItem[];
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export const taskKey = (projectKey: string, number?: number): string =>
  number ? `${projectKey}-${number}` : '';

const dateOnly = (date?: Date | null) => (date ? date.toISOString().slice(0, 10) : '');

/** Release notes: finished work grouped by type, each line led by the task key. */
export const buildReleaseNotes = (
  release: { name: string; description?: string; status: string; releaseDate?: Date | null; releasedAt?: Date | null },
  tasks: readonly ReleaseTaskLike[],
  projectKey: string,
): { markdown: string; groups: ReleaseNoteGroup[] } => {
  const done = tasks.filter(task => task.status === 'completed');
  const groups: ReleaseNoteGroup[] = NOTE_GROUPS
    .map(({ type, heading }) => ({
      type,
      heading,
      items: done
        .filter(task => task.type === type)
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
        .map(task => ({ id: String(task._id), key: taskKey(projectKey, task.number), title: oneLine(task.title) })),
    }))
    .filter(group => group.items.length > 0);

  const lines: string[] = [`# ${oneLine(release.name)}`, ''];
  const when = dateOnly(release.status === 'released' ? release.releasedAt ?? release.releaseDate : release.releaseDate);
  if (when) lines.push(`${release.status === 'released' ? 'Released' : 'Planned'} ${when}`, '');
  if (release.description?.trim()) lines.push(release.description.trim(), '');
  if (groups.length === 0) lines.push('_No finished work in this release yet._', '');
  for (const group of groups) {
    lines.push(`## ${group.heading}`, '');
    for (const item of group.items) lines.push(`- ${item.key ? `${item.key} ` : ''}${item.title}`);
    lines.push('');
  }
  return { markdown: `${lines.join('\n').trimEnd()}\n`, groups };
};
