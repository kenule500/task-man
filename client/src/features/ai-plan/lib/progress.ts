import type { AiPlan } from '../types';

/** After this many seconds of "running" the second phase is assumed to be over (a rough guide: the server reports no phases). */
export const DESIGN_SECONDS = 20;

/** The phase to highlight while waiting: reading while queued, then designing the sprints, then writing the tasks. */
export const phaseIndex = (status: AiPlan['status'], elapsedRunning: number): number => {
  if (status === 'queued') return 0;
  return elapsedRunning < DESIGN_SECONDS ? 1 : 2;
};
