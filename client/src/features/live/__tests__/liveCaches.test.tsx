import { act, render, renderHook, screen } from '@testing-library/react';
import { useToast } from '@/components/ds';
import { toast } from '@/components/ds';
import { tasksApi } from '@/features/tasks/api';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import type { Task } from '@/features/tasks/types';
import { liveApi } from '../api';
import PresenceBar from '../components/PresenceBar';
import { useOpenTaskChanges } from '../hooks/useOpenTaskChanges';
import { LIVE_REFRESH_DEBOUNCE_MS } from '../hooks/useLiveRefresh';
import { PRESENCE_INTERVAL_MS } from '../hooks/useTaskPresence';
import { holdLive, publishBatch, resetLiveStore } from '../lib/liveStore';
import type { LiveBatch, LiveChange } from '../types';

jest.mock('@/features/tasks/api', () => ({
  ...jest.requireActual('@/features/tasks/api'),
  tasksApi: { list: jest.fn(), update: jest.fn(), remove: jest.fn() },
}));
jest.mock('../api', () => ({
  liveApi: { changes: jest.fn(), heartbeat: jest.fn(), viewers: jest.fn(), leave: jest.fn() },
}));

const tasksMock = tasksApi as jest.Mocked<typeof tasksApi>;
const liveMock = liveApi as jest.Mocked<typeof liveApi>;

const task = (id: string, title: string): Task => ({
  _id: id, title, description: '', status: 'pending', priority: 'medium', type: 'task', deadline: '2030-01-01',
  dependencies: [], assignees: [], comments: [], attachments: [], labels: [],
} as unknown as Task);

const change = (action: string, extra: Partial<LiveChange> = {}): LiveChange => ({
  id: `${action}-${Math.random()}`, action, task: 't1', actor: { _id: 'u2', name: 'Dana' }, summary: 'Fix login', fields: [], at: '', ...extra,
});
const batch = (...changes: LiveChange[]): LiveBatch => ({ slug: 'demo', changes, reset: false });

const settle = async (ms = 0) => {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
};

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  toast.clear();
  jest.useRealTimers();
  resetLiveStore();
  localStorage.clear();
});

describe('tasks cache follows teammates', () => {
  it('reloads the list once, debounced, when others change tasks', async () => {
    tasksMock.list.mockResolvedValueOnce([task('t1', 'Fix login')]);
    const { result } = renderHook(() => useTasks('demo'));
    await settle();
    expect(result.current.tasks.map(item => item.title)).toEqual(['Fix login']);

    tasksMock.list.mockResolvedValue([task('t1', 'Fix login (renamed)'), task('t2', 'New task')]);
    act(() => {
      publishBatch(batch(change('task.updated')));
      publishBatch(batch(change('task.created', { task: 't2' })));
    });
    await settle(LIVE_REFRESH_DEBOUNCE_MS - 1);
    expect(tasksMock.list).toHaveBeenCalledTimes(1);
    await settle(1);
    expect(tasksMock.list).toHaveBeenCalledTimes(2);
    expect(result.current.tasks.map(item => item.title)).toEqual(['Fix login (renamed)', 'New task']);
  });

  it('ignores changes that do not touch tasks and other workspaces', async () => {
    tasksMock.list.mockResolvedValue([task('t1', 'Fix login')]);
    renderHook(() => useTasks('demo'));
    await settle();
    act(() => {
      publishBatch(batch(change('member.joined', { task: undefined })));
      publishBatch({ slug: 'other', changes: [change('task.updated')], reset: false });
    });
    await settle(LIVE_REFRESH_DEBOUNCE_MS * 3);
    expect(tasksMock.list).toHaveBeenCalledTimes(1);
  });

  it('waits while a drag or unsaved form holds refreshes, then reloads once', async () => {
    tasksMock.list.mockResolvedValue([task('t1', 'Fix login')]);
    renderHook(() => useTasks('demo'));
    await settle();

    const release = holdLive();
    act(() => publishBatch(batch(change('task.updated'))));
    await settle(LIVE_REFRESH_DEBOUNCE_MS * 5);
    expect(tasksMock.list).toHaveBeenCalledTimes(1);

    act(() => release());
    await settle(LIVE_REFRESH_DEBOUNCE_MS);
    expect(tasksMock.list).toHaveBeenCalledTimes(2);
  });

  it('reloads on reset', async () => {
    tasksMock.list.mockResolvedValue([task('t1', 'Fix login')]);
    renderHook(() => useTasks('demo'));
    await settle();
    act(() => publishBatch({ slug: 'demo', changes: [], reset: true }));
    await settle(LIVE_REFRESH_DEBOUNCE_MS);
    expect(tasksMock.list).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite an optimistic edit that is still saving; it retries afterwards', async () => {
    tasksMock.list.mockResolvedValue([task('t1', 'Fix login')]);
    let finishSave: (saved: Task) => void = () => undefined;
    tasksMock.update.mockReturnValue(new Promise<Task>(resolve => { finishSave = resolve; }));
    const { result } = renderHook(() => useTasks('demo'));
    await settle();

    act(() => { void result.current.updateTask('t1', { title: 'Mine' }); });
    expect(result.current.tasks[0].title).toBe('Mine');

    tasksMock.list.mockResolvedValue([task('t1', 'Theirs')]);
    act(() => publishBatch(batch(change('task.updated'))));
    await settle(LIVE_REFRESH_DEBOUNCE_MS);
    // The save is in flight: the list was not fetched over it
    expect(tasksMock.list).toHaveBeenCalledTimes(1);
    expect(result.current.tasks[0].title).toBe('Mine');

    await act(async () => { finishSave(task('t1', 'Mine')); });
    await settle(LIVE_REFRESH_DEBOUNCE_MS * 2);
    expect(tasksMock.list).toHaveBeenCalledTimes(2);
    expect(result.current.tasks[0].title).toBe('Theirs');
  });
});

describe('open task toast', () => {
  const useToasts = () => useToast().toasts;

  it('tells the user when someone moves the open task', () => {
    renderHook(() => useOpenTaskChanges('demo', 't1', 'WEB-12'));
    const toasts = renderHook(useToasts);
    act(() => publishBatch(batch(change('task.updated', { fields: [{ field: 'status', from: 'pending', to: 'in-progress' }] }))));
    expect(toasts.result.current.map(item => item.title)).toEqual(['Dana moved WEB-12 to In Progress']);
    // The view refreshes by itself, so there is nothing to press
    expect(toasts.result.current[0].action).toBeUndefined();
  });

  it('offers Refresh when the view is held back, and summarises several changes', () => {
    renderHook(() => useOpenTaskChanges('demo', 't1', 'WEB-12'));
    const toasts = renderHook(useToasts);
    const release = holdLive();
    act(() => publishBatch(batch(change('task.commented'))));
    expect(toasts.result.current[0]).toMatchObject({ title: 'Dana commented on WEB-12', action: { label: 'Refresh' } });

    act(() => publishBatch(batch(change('task.updated'), change('task.updated'))));
    expect(toasts.result.current.at(-1)?.title).toBe('2 changes to WEB-12 by others');
    release();
  });

  it('stays quiet for other tasks, other workspaces and unrelated changes', () => {
    renderHook(() => useOpenTaskChanges('demo', 't1', 'WEB-12'));
    const toasts = renderHook(useToasts);
    act(() => {
      publishBatch(batch(change('task.updated', { task: 't9' })));
      publishBatch(batch(change('task.created')));
      publishBatch({ slug: 'other', changes: [change('task.updated')], reset: false });
    });
    expect(toasts.result.current).toHaveLength(0);
  });
});

describe('presence', () => {
  beforeEach(() => localStorage.setItem('token', 'jwt'));

  it('sends a heartbeat every 20 s, shows the others and leaves on close', async () => {
    liveMock.heartbeat.mockResolvedValue(undefined);
    liveMock.leave.mockResolvedValue(undefined);
    liveMock.viewers.mockResolvedValueOnce([{ _id: 'u2', name: 'Dana Scully' }]).mockResolvedValue([]);
    const { unmount } = render(<PresenceBar slug="demo" taskId="t1" />);
    await settle();
    expect(liveMock.heartbeat).toHaveBeenCalledWith('demo', 't1');
    expect(screen.getByRole('group', { name: 'Also viewing: Dana Scully' })).toBeInTheDocument();
    expect(screen.getByText('Also viewing')).toBeInTheDocument();

    await settle(PRESENCE_INTERVAL_MS);
    expect(liveMock.heartbeat).toHaveBeenCalledTimes(2);
    // Dana left: nothing is rendered when you are alone
    expect(screen.queryByText('Also viewing')).not.toBeInTheDocument();

    unmount();
    expect(liveMock.leave).toHaveBeenCalledWith('demo', 't1');
    await settle(PRESENCE_INTERVAL_MS * 3);
    expect(liveMock.heartbeat).toHaveBeenCalledTimes(2);
  });

  it('survives server errors', async () => {
    liveMock.heartbeat.mockRejectedValue(new Error('500'));
    liveMock.leave.mockRejectedValue(new Error('500'));
    const { container, unmount } = render(<PresenceBar slug="demo" taskId="t1" />);
    await settle();
    expect(container).toBeEmptyDOMElement();
    unmount();
  });
});
