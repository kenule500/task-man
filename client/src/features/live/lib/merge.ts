import type { LiveBatch, LiveChange } from '../types';

/** Most changes kept while a refresh is held back; beyond it a full reload is cheaper than replaying. */
export const MAX_PENDING_CHANGES = 200;

/** Drops the caller's own changes (their screen already shows them). */
export const withoutOwn = (changes: LiveChange[], selfId: string | undefined): LiveChange[] =>
  selfId ? changes.filter(change => change.actor?._id !== selfId) : changes;

export interface RefreshPlan {
  /** Reload the task list. */
  tasks: boolean;
  /** Reload projects and sprints. */
  projects: boolean;
  /** Something that may notify the person: refetch the bell. */
  notifications: boolean;
}

const TASK_AREAS = ['task.', 'time.', 'release.'];
const TASK_ACTIONS = new Set(['import.completed', 'automation.ran', 'sprint.started', 'sprint.completed', 'sprint.deleted', 'project.deleted']);
const NOTIFY_ACTIONS = new Set(['task.created', 'task.updated', 'task.commented']);

/** What a batch means for the caches. A reset reloads everything. */
export const planRefresh = (batch: Pick<LiveBatch, 'changes' | 'reset'>): RefreshPlan => {
  if (batch.reset) return { tasks: true, projects: true, notifications: true };
  const has = (test: (action: string) => boolean) => batch.changes.some(change => test(change.action));
  return {
    tasks: has(action => TASK_ACTIONS.has(action) || TASK_AREAS.some(prefix => action.startsWith(prefix))),
    projects: has(action => action.startsWith('project.') || action.startsWith('sprint.')),
    notifications: has(action => NOTIFY_ACTIONS.has(action)),
  };
};

/** Queues `next` behind `queued` (same workspace); past the cap it collapses into a reset. */
export const mergeBatches = (queued: LiveBatch | null, next: LiveBatch): LiveBatch => {
  if (!queued || queued.slug !== next.slug) return next;
  if (queued.reset || next.reset) return { slug: next.slug, changes: [], reset: true };
  const seen = new Set(queued.changes.map(change => change.id));
  const changes = [...queued.changes, ...next.changes.filter(change => !seen.has(change.id))];
  return changes.length > MAX_PENDING_CHANGES
    ? { slug: next.slug, changes: [], reset: true }
    : { slug: next.slug, changes, reset: false };
};

/** How many "new changes" a queued batch stands for (a reset counts as one unknown amount). */
export const pendingCount = (batch: LiveBatch | null): number =>
  batch ? (batch.reset ? Math.max(1, batch.changes.length) : batch.changes.length) : 0;
