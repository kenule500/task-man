import { act, renderHook } from '@testing-library/react';
import { useLiveHold } from '../hooks/useLiveHold';
import {
  flushLive, holdLive, isLiveHeld, publishBatch, refreshLiveNow, resetLiveStore, setLiveState,
  subscribeApply, subscribeIncoming, useLiveSnapshot,
} from '../lib/liveStore';
import type { LiveBatch, LiveChange } from '../types';

const change = (id: string, action = 'task.updated', task = 't1'): LiveChange => ({
  id, action, task, actor: { _id: 'u2', name: 'Dana' }, summary: 'Fix login', fields: [], at: '2026-01-01T00:00:00.000Z',
});
const batch = (...changes: LiveChange[]): LiveBatch => ({ slug: 'demo', changes, reset: false });

afterEach(() => resetLiveStore());

describe('live store', () => {
  it('delivers a batch to the caches at once when nothing is held', () => {
    const applied: LiveBatch[] = [];
    const stop = subscribeApply(next => applied.push(next));
    publishBatch(batch(change('1')));
    expect(applied).toHaveLength(1);
    stop();
    publishBatch(batch(change('2')));
    expect(applied).toHaveLength(1);
  });

  it('holds batches while a drag or a dirty form asks, shows the pending count and delivers when the hold ends', () => {
    const applied: LiveBatch[] = [];
    const incoming: LiveBatch[] = [];
    const stopApply = subscribeApply(next => applied.push(next));
    const stopIncoming = subscribeIncoming(next => incoming.push(next));
    const snapshot = renderHook(() => useLiveSnapshot());

    const release = holdLive();
    expect(isLiveHeld()).toBe(true);
    act(() => {
      publishBatch(batch(change('1')));
      publishBatch(batch(change('2', 'task.created', 't2')));
    });
    expect(applied).toHaveLength(0);
    // Toasts and the bell still see everything at once
    expect(incoming).toHaveLength(2);
    expect(snapshot.result.current.pending).toBe(2);

    act(() => release());
    expect(isLiveHeld()).toBe(false);
    expect(applied).toHaveLength(1);
    expect(applied[0].changes.map(item => item.id)).toEqual(['1', '2']);
    expect(snapshot.result.current.pending).toBe(0);
    stopApply();
    stopIncoming();
  });

  it('waits for the last of several holds, and a hold can only be released once', () => {
    const applied: LiveBatch[] = [];
    const stop = subscribeApply(next => applied.push(next));
    const first = holdLive();
    const second = holdLive();
    publishBatch(batch(change('1')));
    first();
    first();
    expect(applied).toHaveLength(0);
    second();
    expect(applied).toHaveLength(1);
    stop();
  });

  it('applies held changes when the pill is pressed', () => {
    const applied: LiveBatch[] = [];
    const stop = subscribeApply(next => applied.push(next));
    const release = holdLive();
    publishBatch(batch(change('1')));
    flushLive();
    expect(applied).toHaveLength(1);
    release();
    expect(applied).toHaveLength(1);
    stop();
  });

  it('turns an overflow of held changes into a single reload', () => {
    const applied: LiveBatch[] = [];
    const stop = subscribeApply(next => applied.push(next));
    const release = holdLive();
    publishBatch({ slug: 'demo', changes: [], reset: true });
    publishBatch(batch(change('1')));
    release();
    expect(applied).toEqual([{ slug: 'demo', changes: [], reset: true }]);
    stop();
  });

  it('refreshes now, whatever is held, and forgets the queue', () => {
    const applied: LiveBatch[] = [];
    const stop = subscribeApply(next => applied.push(next));
    const release = holdLive();
    publishBatch(batch(change('1')));
    refreshLiveNow('demo');
    expect(applied).toEqual([{ slug: 'demo', changes: [], reset: true }]);
    release();
    expect(applied).toHaveLength(1);
    stop();
  });

  it('keeps delivering when one subscriber throws', () => {
    const applied: LiveBatch[] = [];
    const stopBad = subscribeApply(() => { throw new Error('boom'); });
    const stop = subscribeApply(next => applied.push(next));
    publishBatch(batch(change('1')));
    expect(applied).toHaveLength(1);
    stopBad();
    stop();
  });

  it('useLiveHold holds only while active', () => {
    const { rerender, unmount } = renderHook(({ active }) => useLiveHold(active), { initialProps: { active: false } });
    expect(isLiveHeld()).toBe(false);
    rerender({ active: true });
    expect(isLiveHeld()).toBe(true);
    rerender({ active: false });
    expect(isLiveHeld()).toBe(false);
    rerender({ active: true });
    unmount();
    expect(isLiveHeld()).toBe(false);
  });

  it('tracks the connection state for the indicator', () => {
    const { result } = renderHook(() => useLiveSnapshot());
    expect(result.current.state).toBe('off');
    act(() => setLiveState('live', 1234));
    expect(result.current).toMatchObject({ state: 'live', lastSyncAt: 1234 });
  });
});
