import type { Task } from '../types';

/** Prefix used when a task has no known project key (no project, or the directory is not loaded). */
export const DEFAULT_KEY_PREFIX = 'TM';

type Keyed = Pick<Task, 'number'>;

/** Display key like "WEB-12"; empty when the task has no number yet (older data). */
export const taskKey = (task: Keyed, projectKey?: string | null): string =>
  typeof task.number === 'number' ? `${projectKey?.trim() || DEFAULT_KEY_PREFIX}-${task.number}` : '';

/** Key of a task resolved through a project lookup (e.g. `useProjectDirectory().byName`). */
export const resolveTaskKey = (
  task: Pick<Task, 'number' | 'project'>,
  byName: (name: string | undefined | null) => { key: string } | undefined,
): string => taskKey(task, task.project ? byName(task.project)?.key : undefined);

export interface ParsedTaskKey {
  number: number;
  /** Upper-cased project part of "WEB-12"; undefined for "#12" and "12". */
  prefix?: string;
}

const KEY_PATTERN = /^(?:([a-z0-9]{2,6})-|#)?(\d{1,9})$/i;

/** Reads "WEB-12", "#12" or "12" (same rules as the server search); null when the text is not a key. */
export const parseTaskKeyParts = (text: string): ParsedTaskKey | null => {
  const match = KEY_PATTERN.exec(text.trim());
  if (!match) return null;
  return { number: Number(match[2]), ...(match[1] ? { prefix: match[1].toUpperCase() } : {}) };
};

/** Task number in "WEB-12", "#12" or "12"; null when the text is not a key. */
export const parseTaskKey = (text: string): number | null => parseTaskKeyParts(text)?.number ?? null;

/**
 * True when `query` points at the task: its number ("12", "#12"), its full key ("web-12"),
 * or the start of its key once a dash is typed ("web-1" finds WEB-1 and WEB-12).
 */
export const matchesKey = (task: Keyed, query: string, projectKey?: string | null): boolean => {
  if (typeof task.number !== 'number') return false;
  const term = query.trim();
  if (!term) return false;
  const parsed = parseTaskKeyParts(term);
  const key = taskKey(task, projectKey).toLowerCase();
  if (parsed && parsed.number === task.number && (parsed.prefix === undefined || key === `${parsed.prefix.toLowerCase()}-${task.number}`)) {
    return true;
  }
  return term.includes('-') && key.startsWith(term.toLowerCase());
};

/** Copies text to the clipboard; false when the browser blocks or lacks the API. */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** Link that opens a task in its workspace (handled by TaskPage's `?task=` deep link). */
export const taskLink = (origin: string, workspaceSlug: string, taskId: string): string =>
  `${origin}/${workspaceSlug}/tasks?task=${taskId}`;
