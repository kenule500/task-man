import type { LiveState } from '../types';

export const POLL_INTERVAL_MS = 10_000;
export const IDLE_AFTER_MS = 2 * 60_000;
export const MAX_BACKOFF_MS = 2 * 60_000;

export interface PollerOptions {
  /** One poll; reject to signal a failure (the next one is delayed with exponential backoff). */
  poll: () => Promise<void>;
  onState?: (state: LiveState, lastSyncAt: number | null) => void;
  intervalMs?: number;
  idleAfterMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
}

export interface Poller {
  start: () => void;
  /** Stops for good (logout, leaving the workspace); a poll in flight is ignored when it ends. */
  stop: () => void;
  /** The user interacted: resumes after an idle pause. */
  activity: () => void;
  /** The tab became visible or hidden. */
  setVisible: (visible: boolean) => void;
  /** Focus or reconnect: poll now instead of waiting for the timer. */
  pollNow: () => void;
}

/**
 * Schedules polls without any DOM knowledge (the hook feeds it events, tests feed it fake timers).
 * Every `intervalMs` while the tab is visible and the user was active in the last `idleAfterMs`;
 * after `n` failures in a row the delay doubles up to `maxBackoffMs`.
 */
export const createPoller = ({
  poll, onState, intervalMs = POLL_INTERVAL_MS, idleAfterMs = IDLE_AFTER_MS, maxBackoffMs = MAX_BACKOFF_MS, now = Date.now,
}: PollerOptions): Poller => {
  let running = false;
  let visible = true;
  let inflight = false;
  let failures = 0;
  let lastActivity = now();
  let lastSyncAt: number | null = null;
  let state: LiveState = 'off';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const setState = (next: LiveState) => {
    if (next === state) return;
    state = next;
    onState?.(state, lastSyncAt);
  };
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const idle = () => now() - lastActivity >= idleAfterMs;
  const delay = () => (failures === 0 ? intervalMs : Math.min(maxBackoffMs, intervalMs * 2 ** failures));

  const schedule = () => {
    clearTimer();
    if (!running) return;
    if (!visible || idle()) {
      setState('paused');
      return;
    }
    timer = setTimeout(tick, delay());
  };

  async function run(): Promise<void> {
    if (inflight || !running) return;
    inflight = true;
    clearTimer();
    try {
      await poll();
      if (!running) return;
      failures = 0;
      lastSyncAt = now();
      state = 'live';
      onState?.(state, lastSyncAt);
    } catch {
      if (!running) return;
      failures += 1;
      setState('reconnecting');
    } finally {
      inflight = false;
    }
    schedule();
  }

  function tick() {
    timer = undefined;
    // The user stopped interacting while the timer was waiting
    if (idle() || !visible) {
      schedule();
      return;
    }
    void run();
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastActivity = now();
      void run();
    },
    stop() {
      running = false;
      clearTimer();
      setState('off');
    },
    activity() {
      const wasIdle = running && idle();
      lastActivity = now();
      if (wasIdle && visible && !inflight) void run();
    },
    setVisible(next) {
      visible = next;
      if (!running) return;
      if (!next) {
        clearTimer();
        setState('paused');
      } else {
        lastActivity = now();
        void run();
      }
    },
    pollNow() {
      if (!running || !visible) return;
      // A fresh connection should not wait out a long backoff
      failures = 0;
      lastActivity = now();
      void run();
    },
  };
};
