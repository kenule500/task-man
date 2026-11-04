import { subscribePlanUpdates } from '../lib/planSocket';
import { chatClient } from '@/features/chat/lib/chatClient';

// The plan page must not open a connection of its own: it listens on the workspace socket that is
// already open for chat. These tests drive that client's store and event bus by hand.

interface FakeStore {
  state: { status: string };
  handlers: Map<string, Set<(payload: unknown) => void>>;
  listeners: Set<() => void>;
}

const fake = (chatClient as unknown as { __test: FakeStore }).__test;

const setStatus = (status: string) => {
  fake.state.status = status;
  fake.listeners.forEach(listener => listener());
};

const emit = (event: string, payload: unknown) =>
  fake.handlers.get(event)?.forEach(handler => handler(payload));

jest.mock('@/features/chat/lib/chatClient', () => {
  const state = { status: 'idle' };
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const listeners = new Set<() => void>();
  const chatClient = {
    getState: () => ({ status: state.status }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    on: (event: string, handler: (payload: unknown) => void) => {
      const set = handlers.get(event) ?? new Set<(payload: unknown) => void>();
      set.add(handler);
      handlers.set(event, set);
      return () => { set.delete(handler); };
    },
    __test: { state, handlers, listeners },
  };
  return { chatClient };
});

describe('subscribePlanUpdates', () => {
  beforeEach(() => {
    fake.state.status = 'idle';
    fake.handlers.clear();
    fake.listeners.clear();
  });

  it('reports the current state of the shared connection without opening another one', () => {
    const onStatus = jest.fn();
    fake.state.status = 'connected';

    const subscription = subscribePlanUpdates((): void => undefined, onStatus);

    expect(subscription.connected).toBe(true);
    expect(onStatus).toHaveBeenCalledWith(true);
  });

  it('passes plan updates through and ignores the other workspace events', () => {
    const onUpdate = jest.fn();
    subscribePlanUpdates(onUpdate);

    emit('plan:updated', { planId: 'plan-1', status: 'ready' });
    emit('chat:message', { _id: 'm1' });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ planId: 'plan-1', status: 'ready' });
  });

  it('tells the caller when the connection drops and comes back', () => {
    fake.state.status = 'connected';
    const onStatus = jest.fn();
    subscribePlanUpdates((): void => undefined, onStatus);

    setStatus('offline');
    setStatus('connected');

    expect(onStatus.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('stops listening once the person leaves the page', () => {
    const onUpdate = jest.fn();
    const onStatus = jest.fn();
    const subscription = subscribePlanUpdates(onUpdate, onStatus);
    subscription.unsubscribe();

    emit('plan:updated', { planId: 'plan-1', status: 'ready' });
    setStatus('connected');

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledTimes(1);
  });
});
