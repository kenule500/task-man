import { chatClient } from '@/features/chat/lib/chatClient';

// Plan status travels over the workspace socket that is already open for chat, so the page does not
// open a connection of its own and does not poll while that connection is up.
// The hook keeps its slow status polling as a fallback (socket down, no token, server restart).

export interface PlanUpdate {
  planId: string;
  status: string;
  /** Page-by-page progress, when the server reports it (a chunked document run). */
  progress?: { total: number; done: number };
}

export interface PlanSubscription {
  /** The push channel is connected; the caller can skip polling. */
  connected: boolean;
  unsubscribe: () => void;
}

/** Listens for `plan:updated`; `onStatus` reports whether the push channel is usable. */
export const subscribePlanUpdates = (
  onUpdate: (update: PlanUpdate) => void,
  onStatus: (connected: boolean) => void = () => undefined,
): PlanSubscription => {
  let connected = chatClient.getState().status === 'connected';
  const offUpdate = chatClient.on<PlanUpdate>('plan:updated', onUpdate);
  // The connection can drop (or come back) while the page waits; the caller refreshes on reconnect
  const offState = chatClient.subscribe(() => {
    const next = chatClient.getState().status === 'connected';
    if (next === connected) return;
    connected = next;
    onStatus(next);
  });
  onStatus(connected);

  return {
    connected,
    unsubscribe: () => {
      offUpdate();
      offState();
    },
  };
};
