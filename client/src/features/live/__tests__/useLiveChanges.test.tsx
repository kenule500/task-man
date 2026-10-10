import { act, renderHook } from '@testing-library/react';
import { announceNotificationsChanged } from '@/features/notifications/hooks/useNotificationFeed';
import { liveApi } from '../api';
import { useLiveChanges } from '../hooks/useLiveChanges';
import { resetLiveStore, subscribeApply } from '../lib/liveStore';
import type { ChangesResponse, LiveBatch, LiveChange } from '../types';

jest.mock('../api', () => ({
  liveApi: { changes: jest.fn(), heartbeat: jest.fn(), viewers: jest.fn(), leave: jest.fn() },
}));
jest.mock('@/features/notifications/hooks/useNotificationFeed', () => ({
  announceNotificationsChanged: jest.fn(),
}));

const mockedApi = liveApi as jest.Mocked<typeof liveApi>;

const change = (id: string, actor: string, action = 'task.updated'): LiveChange => ({
  id, action, task: 't1', actor: { _id: actor, name: actor }, summary: 'Fix login', fields: [], at: '2026-01-01T00:00:00.000Z',
});
const answer = (cursor: string, changes: LiveChange[] = [], reset?: boolean): ChangesResponse => ({ cursor, changes, reset });

const tick = async (ms: number) => {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
};

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useLiveChanges', () => {
  const applied: LiveBatch[] = [];
  let stop: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.setItem('token', 'jwt');
    applied.length = 0;
    stop = subscribeApply(batch => applied.push(batch));
  });
  afterEach(() => {
    stop();
    localStorage.clear();
    setHidden(false);
    jest.useRealTimers();
    resetLiveStore();
  });

  it('starts from the server cursor, then passes on only other people\'s changes with the last cursor', async () => {
    mockedApi.changes
      .mockResolvedValueOnce(answer('c0'))
      .mockResolvedValueOnce(answer('c1', [change('1', 'me'), change('2', 'dana')]))
      .mockResolvedValueOnce(answer('c1'));
    const { unmount } = renderHook(() => useLiveChanges('demo', { selfId: 'me' }));
    await tick(0);
    expect(mockedApi.changes).toHaveBeenNthCalledWith(1, 'demo', null);
    expect(applied).toHaveLength(0);

    await tick(10_000);
    expect(mockedApi.changes).toHaveBeenNthCalledWith(2, 'demo', 'c0');
    expect(applied).toHaveLength(1);
    expect(applied[0].changes.map(item => item.id)).toEqual(['2']);
    expect(announceNotificationsChanged).toHaveBeenCalledTimes(1);

    await tick(10_000);
    expect(mockedApi.changes).toHaveBeenNthCalledWith(3, 'demo', 'c1');
    expect(applied).toHaveLength(1);
    unmount();
  });

  it('only own changes: nothing is delivered', async () => {
    mockedApi.changes.mockResolvedValueOnce(answer('c0')).mockResolvedValueOnce(answer('c1', [change('1', 'me')]));
    renderHook(() => useLiveChanges('demo', { selfId: 'me' }));
    await tick(10_000);
    expect(applied).toHaveLength(0);
  });

  it('passes a reset on even without entries', async () => {
    mockedApi.changes.mockResolvedValueOnce(answer('c0')).mockResolvedValueOnce(answer('c9', [], true));
    renderHook(() => useLiveChanges('demo', { selfId: 'me' }));
    await tick(10_000);
    expect(applied).toEqual([{ slug: 'demo', changes: [], reset: true }]);
  });

  it('keeps the cursor and backs off when a poll fails', async () => {
    mockedApi.changes
      .mockResolvedValueOnce(answer('c0'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(answer('c1', [change('1', 'dana')]));
    renderHook(() => useLiveChanges('demo', { selfId: 'me' }));
    await tick(10_000);
    expect(mockedApi.changes).toHaveBeenCalledTimes(2);
    // Backoff: the retry waits 20 s, not 10 s
    await tick(10_000);
    expect(mockedApi.changes).toHaveBeenCalledTimes(2);
    await tick(10_000);
    expect(mockedApi.changes).toHaveBeenNthCalledWith(3, 'demo', 'c0');
    expect(applied).toHaveLength(1);
  });

  it('stops polling on logout', async () => {
    mockedApi.changes.mockResolvedValue(answer('c0'));
    renderHook(() => useLiveChanges('demo', { selfId: 'me' }));
    await tick(10_000);
    const calls = mockedApi.changes.mock.calls.length;
    localStorage.removeItem('token');
    await tick(10_000);
    await tick(60_000);
    expect(mockedApi.changes).toHaveBeenCalledTimes(calls);
  });

  it('pauses while the tab is hidden and polls at once when it comes back or the window regains focus', async () => {
    mockedApi.changes.mockResolvedValue(answer('c0'));
    renderHook(() => useLiveChanges('demo', { selfId: 'me' }));
    await tick(0);
    setHidden(true);
    await tick(60_000);
    expect(mockedApi.changes).toHaveBeenCalledTimes(1);

    setHidden(false);
    await tick(0);
    expect(mockedApi.changes).toHaveBeenCalledTimes(2);

    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await tick(0);
    expect(mockedApi.changes).toHaveBeenCalledTimes(3);
  });

  it('does nothing when disabled or without a workspace', async () => {
    renderHook(() => useLiveChanges('demo', { enabled: false }));
    renderHook(() => useLiveChanges(undefined));
    await tick(30_000);
    expect(mockedApi.changes).not.toHaveBeenCalled();
  });

  it('stops when unmounted', async () => {
    mockedApi.changes.mockResolvedValue(answer('c0'));
    const { unmount } = renderHook(() => useLiveChanges('demo', { selfId: 'me' }));
    await tick(0);
    unmount();
    await tick(60_000);
    expect(mockedApi.changes).toHaveBeenCalledTimes(1);
  });
});
