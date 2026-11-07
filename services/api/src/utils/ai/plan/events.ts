import { emitToRooms, rooms } from '../../../realtime/publish.js';

// Plan status changes travel to the person who started the plan, so the page needs no polling.

export interface PlanEventSource {
  _id: unknown;
  status: string;
  createdBy: unknown;
  progress?: { total: number; done: number } | null;
}

export interface PlanUpdatedEvent {
  rooms: string[];
  event: string;
  payload: { planId: string; status: string; progress?: { total: number; done: number } };
}

/**
 * Rooms, event name and payload of one status change (pure, so it can be unit tested).
 *
 * `progress` is only added when the plan reports phases (a chunked document run), so a single-call
 * plan keeps the exact payload earlier clients already receive.
 */
export const planUpdatedEvent = (plan: PlanEventSource): PlanUpdatedEvent => {
  const progress = plan.progress && plan.progress.total > 1 ? { total: plan.progress.total, done: plan.progress.done } : undefined;
  return {
    rooms: [rooms.user(plan.createdBy)],
    event: 'plan:updated',
    payload: { planId: String(plan._id), status: plan.status, ...(progress ? { progress } : {}) },
  };
};

/** Best effort: a missed event only means the page keeps its slow status fallback. */
export const publishPlanUpdated = async (plan: PlanEventSource): Promise<void> => {
  const { rooms: targets, event, payload } = planUpdatedEvent(plan);
  await emitToRooms(targets, event, payload);
};
