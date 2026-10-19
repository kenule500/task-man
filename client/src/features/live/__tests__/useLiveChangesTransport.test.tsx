import { act, renderHook } from '@testing-library/react';
import { liveApi } from '../api';
import { connectWorkspaceSocket } from '../lib/socket';
import { useLiveChanges } from '../hooks/useLiveChanges';
import { resetLiveStore, useLiveSnapshot } from '../lib/liveStore';
import type { WorkspaceSocketHandlers } from '../lib/socket';

jest.mock('../api', () => ({ __esModule: true, liveApi: { changes: jest.fn() } }));
jest.mock('../lib/socket', () => ({ __esModule: true, connectWorkspaceSocket: jest.fn() }));
jest.mock('@/features/notifications/hooks/useNotificationFeed', () => ({
  __esModule: true,
  announceNotificationsChanged: jest.fn(),
}));

const changes = liveApi.changes as unknown as jest.Mock;
const connect = connectWorkspaceSocket as unknown as jest.Mock;

const tick = async (ms: number) => {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
};

let handlers: WorkspaceSocketHandlers;
const close = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.setItem('token', 'jwt');
  handlers = {} as WorkspaceSocketHandlers;
  connect.mockReset();
  connect.mockImplementation((_slug: string, next: WorkspaceSocketHandlers) => {
    handlers = next;
    return { close };
  });
  changes.mockReset();
  changes.mockResolvedValue({ cursor: 'c0', changes: [] });
});

afterEach(() => {
  localStorage.clear();
  jest.useRealTimers();
  resetLiveStore();
});

describe('live transport fallback', () => {
  it('AC-033: a dropped socket reports degraded and polls again immediately', async () => {
    const { result, unmount } = renderHook(() => {
      useLiveChanges('demo', { selfId: 'me' });
      return useLiveSnapshot();
    });

    await tick(0);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('live');

    act(() => { handlers.onDisconnected(); });

    // The UI says the transport is degraded rather than pretending everything is live
    expect(result.current.state).toBe('reconnecting');
    // The existing cursor poll runs at once, so no update waits for the next interval
    expect(changes).toHaveBeenCalledTimes(2);
    await tick(0);

    unmount();
    expect(close).toHaveBeenCalled();
  });

  it('AC-032: a pushed activity entry advances the cursor used by the fallback poll', async () => {
    const { unmount } = renderHook(() => useLiveChanges('demo', { selfId: 'me' }));
    await tick(0);

    act(() => {
      handlers.onActivity({
        change: {
          id: '1',
          action: 'task.updated',
          task: 't1',
          actor: { _id: 'dana', name: 'Dana' },
          summary: 'Fix login',
          fields: [],
          at: '2026-10-18T10:00:00.000Z',
        },
        cursor: 'c9',
      });
    });

    await tick(10_000);
    // The next poll resumes after the pushed entry, so nothing is re-delivered or lost
    expect(changes).toHaveBeenLastCalledWith('demo', 'c9');
    unmount();
  });
});
