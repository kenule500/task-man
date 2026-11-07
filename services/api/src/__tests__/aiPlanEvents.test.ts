import { planUpdatedEvent } from '../utils/ai/plan/events.js';

describe('planUpdatedEvent', () => {
  it('goes to the plan owner and carries only the id and status', () => {
    const event = planUpdatedEvent({
      _id: '6ae5baec5bb30e823cab7ac8',
      status: 'ready',
      createdBy: '6ae5b64a5bb30e823cab795d',
    });
    expect(event.event).toBe('plan:updated');
    expect(event.rooms).toEqual(['user:6ae5b64a5bb30e823cab795d']);
    expect(event.payload).toEqual({ planId: '6ae5baec5bb30e823cab7ac8', status: 'ready' });
  });

  it('reports a failure with the same shape', () => {
    const event = planUpdatedEvent({ _id: 'p1', status: 'failed', createdBy: 'u1' });
    expect(event.payload).toEqual({ planId: 'p1', status: 'failed' });
  });

  it('carries page progress for a chunked run, and omits it for a single-call plan', () => {
    const chunked = planUpdatedEvent({ _id: 'p1', status: 'running', createdBy: 'u1', progress: { total: 5, done: 2 } });
    expect(chunked.payload).toEqual({ planId: 'p1', status: 'running', progress: { total: 5, done: 2 } });

    const single = planUpdatedEvent({ _id: 'p1', status: 'running', createdBy: 'u1', progress: { total: 1, done: 1 } });
    expect(single.payload).toEqual({ planId: 'p1', status: 'running' });
  });
});
