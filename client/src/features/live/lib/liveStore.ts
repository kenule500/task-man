import { useSyncExternalStore } from 'react';
import type { LiveBatch, LiveState } from '../types';
import { mergeBatches, pendingCount } from './merge';

// One poller per workspace layout feeds this store; caches (tasks, projects, bell) subscribe to it.
// A refresh that would disrupt the user (a drag in progress, a form with unsaved edits) is held back:
// the batch waits in `queued`, the "N new changes" pill shows, and it is delivered when the hold ends or the user asks.

export interface LiveSnapshot {
  state: LiveState;
  /** Epoch ms of the last successful poll. */
  lastSyncAt: number | null;
  /** Changes waiting behind a hold. */
  pending: number;
}

type BatchListener = (batch: LiveBatch) => void;

const INITIAL: LiveSnapshot = { state: 'off', lastSyncAt: null, pending: 0 };

let snapshot: LiveSnapshot = INITIAL;
let queued: LiveBatch | null = null;
let holds = 0;
const stateListeners = new Set<() => void>();
const incomingListeners = new Set<BatchListener>();
const applyListeners = new Set<BatchListener>();

const emit = () => stateListeners.forEach(listener => listener());
const update = (patch: Partial<LiveSnapshot>) => {
  const next = { ...snapshot, ...patch };
  if (next.state === snapshot.state && next.lastSyncAt === snapshot.lastSyncAt && next.pending === snapshot.pending) return;
  snapshot = next;
  emit();
};

const deliver = (batch: LiveBatch) => {
  for (const listener of [...applyListeners]) {
    try {
      listener(batch);
    } catch {
      // A broken subscriber must not stop the others
    }
  }
};

export const setLiveState = (state: LiveState, lastSyncAt: number | null) => update({ state, lastSyncAt });

/** Changes by other people, as the poller found them. `subscribeIncoming` sees them at once; caches wait for holds. */
export const publishBatch = (batch: LiveBatch): void => {
  for (const listener of [...incomingListeners]) listener(batch);
  if (holds > 0) {
    queued = mergeBatches(queued, batch);
    update({ pending: pendingCount(queued) });
    return;
  }
  deliver(batch);
};

/** Sees every batch immediately, even while refreshes are held (toasts about the open task). */
export const subscribeIncoming = (listener: BatchListener): (() => void) => {
  incomingListeners.add(listener);
  return () => { incomingListeners.delete(listener); };
};

/** The caches' entry point: called when a batch may be applied. */
export const subscribeApply = (listener: BatchListener): (() => void) => {
  applyListeners.add(listener);
  return () => { applyListeners.delete(listener); };
};

/** True while a drag or an unsaved form asks for refreshes to wait. */
export const isLiveHeld = (): boolean => holds > 0;

/** Applies what was held back (the pill, or the last hold ending). */
export const flushLive = (): void => {
  const batch = queued;
  queued = null;
  update({ pending: 0 });
  if (batch) deliver(batch);
};

/** Asks refreshes to wait; call the returned function (once) when done. Held batches are delivered when the last hold ends. */
export const holdLive = (): (() => void) => {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) flushLive();
  };
};

/** Reloads the caches now, whatever is held (the user pressed Refresh). */
export const refreshLiveNow = (slug: string): void => {
  queued = null;
  update({ pending: 0 });
  deliver({ slug, changes: [], reset: true });
};

/** Forgets queued changes and state (leaving the workspace, logout). Holds belong to mounted components and stay. */
export const resetLiveStore = (): void => {
  queued = null;
  snapshot = INITIAL;
  stateListeners.forEach(listener => listener());
};

const subscribeState = (listener: () => void) => {
  stateListeners.add(listener);
  return () => { stateListeners.delete(listener); };
};

export const useLiveSnapshot = (): LiveSnapshot => useSyncExternalStore(subscribeState, () => snapshot, () => INITIAL);
