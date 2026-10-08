import { act, renderHook, waitFor } from '@testing-library/react';
import { tasksApi } from '../api';
import { useTasks } from '../hooks/useTasks';
import { makeTask } from './fixtures';

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  tasksApi: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
}));

const api = tasksApi as jest.Mocked<typeof tasksApi>;

const renderLoaded = async (tasks = [makeTask({ _id: 'a', title: 'A' }), makeTask({ _id: 'b', dependencies: ['a'] })]) => {
  api.list.mockResolvedValue(tasks);
  const hook = renderHook(() => useTasks('acme'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

describe('useTasks', () => {
  it('loads the workspace tasks', async () => {
    const { result } = await renderLoaded();
    expect(api.list).toHaveBeenCalledWith('acme');
    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.error).toBe('');
  });

  it('explains access errors', async () => {
    api.list.mockRejectedValue({ response: { status: 403 } });
    const { result } = renderHook(() => useTasks('secret'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/don't have access to "secret"/);
  });

  it('applies updates optimistically and keeps the server copy', async () => {
    const { result } = await renderLoaded();
    let resolveUpdate: (task: ReturnType<typeof makeTask>) => void = () => {};
    api.update.mockReturnValue(new Promise(resolve => { resolveUpdate = resolve; }));

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.updateTask('a', { title: 'Renamed' });
    });
    expect(result.current.tasks[0].title).toBe('Renamed');

    await act(async () => {
      resolveUpdate(makeTask({ _id: 'a', title: 'Renamed by server' }));
      await pending;
    });
    expect(result.current.tasks[0].title).toBe('Renamed by server');
  });

  it('rolls back a rejected update and surfaces the message', async () => {
    const { result } = await renderLoaded();
    api.update.mockRejectedValue({ response: { data: { message: 'This dependency would create a cycle' } } });

    let saved: unknown;
    await act(async () => {
      saved = await result.current.updateTask('a', { title: 'Nope' });
    });

    expect(saved).toBeNull();
    expect(result.current.tasks[0].title).toBe('A');
    expect(result.current.error).toBe('This dependency would create a cycle');
  });

  it('deletes a task and detaches it from dependants', async () => {
    const { result } = await renderLoaded();
    api.remove.mockResolvedValue();

    await act(async () => {
      await result.current.deleteTask('a');
    });

    expect(result.current.tasks.map(t => t._id)).toEqual(['b']);
    expect(result.current.tasks[0].dependencies).toEqual([]);
  });

  it('appends created tasks', async () => {
    const { result } = await renderLoaded([]);
    api.create.mockResolvedValue(makeTask({ _id: 'new' }));

    await act(async () => {
      await result.current.createTask({ title: 'New', deadline: '2026-10-01' });
    });
    expect(result.current.tasks.map(t => t._id)).toEqual(['new']);
  });
});
