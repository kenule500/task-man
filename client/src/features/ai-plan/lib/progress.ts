import type { AiPlan } from '../types';

/** After this many seconds of "running" the second phase is assumed to be over (a rough guide: the server reports no phases). */
export const DESIGN_SECONDS = 20;

/**
 * The phase to highlight while waiting: reading while queued, then designing the sprints, then
 * writing the tasks.
 *
 * A chunked document run reports real progress (how many pages are done), so the phase follows it
 * rather than the clock: phase 0 while nothing is done, phase 2 on the last page, phase 1 in between.
 * A single-call plan reports no progress, and keeps the time-based guide.
 */
export const phaseIndex = (status: AiPlan['status'], elapsedRunning: number, progress?: { total: number; done: number } | null): number => {
  if (status === 'queued') return 0;
  if (progress && progress.total > 1) {
    if (progress.done <= 0) return 0;
    return progress.done >= progress.total ? 2 : 1;
  }
  return elapsedRunning < DESIGN_SECONDS ? 1 : 2;
};

/** The pages already planned of the pages the document was split into, or null when the run reports no phases. */
export const chunkProgress = (plan: Pick<AiPlan, 'progress'>): { total: number; done: number } | null =>
  plan.progress && plan.progress.total > 1 ? { total: plan.progress.total, done: Math.min(plan.progress.done, plan.progress.total) } : null;

