import { timeApi } from './api';
import type { RunningTimer } from './types';

// The caller's running timer is shown in the app header and in the task dialog, so it lives in one store.

interface Snapshot {
  slug: string;
  timer: RunningTimer | null;
  loaded: boolean;
}

/** Fired on `window` after any change to logged time (timer start/stop, manual entry, delete). */
export const TIME_CHANGED_EVENT = 'taskman:time-changed';

let snapshot: Snapshot = { slug: '', timer: null, loaded: false };
const listeners = new Set<() => void>();

const publish = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach(listener => listener());
};

export const subscribeTimer = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getTimerSnapshot = (): Snapshot => snapshot;

/** Tells other parts of the app (task list, open dialogs) that logged time changed. */
export const notifyTimeChanged = (): void => {
  window.dispatchEvent(new Event(TIME_CHANGED_EVENT));
};

/** Reloads the running timer of `slug`; failures keep what was known (the pill just stays as it is). */
export const refreshTimer = async (slug: string): Promise<void> => {
  if (!slug) return;
  try {
    const timer = await timeApi.running(slug);
    // Ignore an answer for a workspace that is no longer selected
    if (!snapshot.slug || snapshot.slug === slug) publish({ slug, timer, loaded: true });
  } catch {
    if (snapshot.slug !== slug) publish({ slug, timer: null, loaded: true });
  }
};

/** Switches the store to another workspace, clearing the previous timer at once. */
export const selectWorkspace = (slug: string): void => {
  if (snapshot.slug === slug) return;
  publish({ slug, timer: null, loaded: false });
};

/** Starts a timer on a task (the API stops one running elsewhere) and refreshes the store. */
export const startTimer = async (slug: string, taskId: string): Promise<void> => {
  await timeApi.start(slug, taskId);
  await refreshTimer(slug);
  notifyTimeChanged();
};

/** Stops the timer running on a task and refreshes the store. */
export const stopTimer = async (slug: string, taskId: string): Promise<void> => {
  await timeApi.stop(slug, taskId);
  await refreshTimer(slug);
  notifyTimeChanged();
};

/** Test helper: back to the initial state. */
export const resetTimerStore = (): void => {
  publish({ slug: '', timer: null, loaded: false });
};
