import { act, renderHook, waitFor } from '@testing-library/react';
import { tasksApi } from '../api';
import { DELETE_UNDO_MS, useTasks } from '../hooks/useTasks';
import { makeTask } from './fixtures';

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  tasksApi: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addComment: jest.fn(),
    removeComment: jest.fn(),
    uploadAttachment: jest.fn(),
    removeAttachment: jest.fn(),
    downloadAttachment: jest.fn(),
  },
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

  it('maps assignee ids to known users while an update is in flight', async () => {
    const ada = { _id: 'u1', name: 'Ada' };
    const { result } = await renderLoaded([makeTask({ _id: 'a', assignees: [ada] }), makeTask({ _id: 'b' })]);
    api.update.mockReturnValue(new Promise(() => {}));

    act(() => {
      void result.current.updateTask('b', { assignees: ['u1'] });
    });
    expect(result.current.tasks[1].assignees).toEqual([ada]);
  });

  describe('undoable delete', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    const renderWithFakeTimers = async () => {
      jest.useFakeTimers();
      api.list.mockResolvedValue([makeTask({ _id: 'a', title: 'A' }), makeTask({ _id: 'b', dependencies: ['a'] })]);
      const hook = renderHook(() => useTasks('acme'));
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      return hook;
    };

    it('hides the task at once and only calls the API after the undo window', async () => {
      const { result } = await renderWithFakeTimers();
      api.remove.mockResolvedValue();

      act(() => result.current.deleteTask('a'));
      expect(result.current.tasks.map(t => t._id)).toEqual(['b']);
      expect(result.current.tasks[0].dependencies).toEqual([]);

      await act(async () => { jest.advanceTimersByTime(DELETE_UNDO_MS - 100); });
      expect(api.remove).not.toHaveBeenCalled();

      await act(async () => { jest.advanceTimersByTime(200); });
      expect(api.remove).toHaveBeenCalledWith('acme', 'a');
      expect(result.current.tasks.map(t => t._id)).toEqual(['b']);
      expect(result.current.tasks[0].dependencies).toEqual([]);
    });

    it('restores the task, with its dependants, when undone and never calls the API', async () => {
      const { result } = await renderWithFakeTimers();

      act(() => result.current.deleteTask('a'));
      act(() => result.current.undoDelete('a'));
      expect(result.current.tasks.map(t => t._id)).toEqual(['a', 'b']);
      expect(result.current.tasks[1].dependencies).toEqual(['a']);

      await act(async () => { jest.advanceTimersByTime(DELETE_UNDO_MS * 2); });
      expect(api.remove).not.toHaveBeenCalled();
    });

    it('brings the task back and reports the error when the server refuses', async () => {
      const { result } = await renderWithFakeTimers();
      api.remove.mockRejectedValue({ response: { data: { message: 'Not allowed' } } });

      act(() => result.current.deleteTask('a'));
      await act(async () => { jest.advanceTimersByTime(DELETE_UNDO_MS); });

      expect(result.current.tasks.map(t => t._id)).toEqual(['a', 'b']);
      expect(result.current.error).toBe('Not allowed');
    });

    it('sends pending deletes immediately when the page is left', async () => {
      const { result, unmount } = await renderWithFakeTimers();
      api.remove.mockResolvedValue();

      act(() => result.current.deleteTask('a'));
      expect(api.remove).not.toHaveBeenCalled();

      unmount();
      expect(api.remove).toHaveBeenCalledWith('acme', 'a');

      // The expired timer must not delete twice
      await act(async () => { jest.advanceTimersByTime(DELETE_UNDO_MS * 2); });
      expect(api.remove).toHaveBeenCalledTimes(1);
    });

    it('flushes on pagehide', async () => {
      const { result } = await renderWithFakeTimers();
      api.remove.mockResolvedValue();

      act(() => result.current.deleteTask('a'));
      await act(async () => { window.dispatchEvent(new Event('pagehide')); });
      expect(api.remove).toHaveBeenCalledWith('acme', 'a');
    });
  });

  describe('subtasks', () => {
    const family = () => [
      makeTask({ _id: 'p', title: 'Parent', project: 'Web', sprint: null }),
      makeTask({ _id: 'c1', parent: 'p', project: 'Web', sprint: null }),
      makeTask({ _id: 'c2', parent: 'p', project: 'Web', sprint: null, dependencies: ['c1'] }),
      makeTask({ _id: 'other', dependencies: ['c1'] }),
    ];

    afterEach(() => {
      jest.useRealTimers();
    });

    it('hides the subtasks of a pending delete and deletes them locally once it commits', async () => {
      jest.useFakeTimers();
      api.list.mockResolvedValue(family());
      const { result } = renderHook(() => useTasks('acme'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      api.remove.mockResolvedValue();

      act(() => result.current.deleteTask('p'));
      expect(result.current.tasks.map(t => t._id)).toEqual(['other']);
      expect(result.current.tasks[0].dependencies).toEqual([]);

      act(() => result.current.undoDelete('p'));
      expect(result.current.tasks).toHaveLength(4);

      act(() => result.current.deleteTask('p'));
      await act(async () => { jest.advanceTimersByTime(DELETE_UNDO_MS + 100); });
      expect(api.remove).toHaveBeenCalledTimes(1);
      expect(result.current.tasks.map(t => t._id)).toEqual(['other']);
    });

    it('creates a subtask under its parent', async () => {
      const { result } = await renderLoaded(family());
      api.create.mockResolvedValue(makeTask({ _id: 'c3', parent: 'p' }));

      await act(async () => {
        await result.current.createTask({ title: 'Third', parent: 'p', deadline: '2026-10-10' });
      });
      expect(api.create).toHaveBeenCalledWith('acme', expect.objectContaining({ parent: 'p' }));
      expect(result.current.tasks.map(t => t._id)).toContain('c3');
    });

    it('moves subtasks along when their parent changes sprint', async () => {
      const { result } = await renderLoaded(family());
      api.update.mockResolvedValue(makeTask({ _id: 'p', project: 'Mobile', sprint: 's9' }));

      await act(async () => { await result.current.updateTask('p', { sprint: 's9' }); });
      const child = result.current.tasks.find(t => t._id === 'c1');
      expect(child).toMatchObject({ project: 'Mobile', sprint: 's9' });
      expect(result.current.tasks.find(t => t._id === 'other')?.sprint).toBeUndefined();
    });

    it('reloads the list from the server', async () => {
      const { result } = await renderLoaded(family());
      api.list.mockResolvedValue([makeTask({ _id: 'fresh' })]);

      await act(async () => { await result.current.reload(); });
      expect(result.current.tasks.map(t => t._id)).toEqual(['fresh']);
    });

    it('keeps the tasks and reports an error when a reload fails', async () => {
      const { result } = await renderLoaded(family());
      api.list.mockRejectedValue({ response: { data: { message: 'Offline' } } });

      await act(async () => { await result.current.reload(); });
      expect(result.current.tasks).toHaveLength(4);
      expect(result.current.error).toBe('Offline');
    });
  });

  it('appends created tasks', async () => {
    const { result } = await renderLoaded([]);
    api.create.mockResolvedValue(makeTask({ _id: 'new' }));

    await act(async () => {
      await result.current.createTask({ title: 'New', deadline: '2026-10-01' });
    });
    expect(result.current.tasks.map(t => t._id)).toEqual(['new']);
  });

  describe('comments and attachments', () => {
    const ada = { _id: 'u1', name: 'Ada' };
    const comment = { _id: 'c1', author: ada, text: 'Looks good', createdAt: '2026-10-01T10:00:00.000Z' };
    const attachment = { _id: 'f1', originalName: 'spec.pdf', mimetype: 'application/pdf', size: 10 };

    it('appends a created comment, or takes the whole task when the API returns it', async () => {
      const { result } = await renderLoaded([makeTask({ _id: 'a' })]);
      api.addComment.mockResolvedValueOnce(comment);

      await act(async () => { await result.current.addComment('a', 'Looks good'); });
      expect(result.current.tasks[0].comments).toEqual([comment]);

      api.addComment.mockResolvedValueOnce(makeTask({ _id: 'a', comments: [comment, { ...comment, _id: 'c2' }] }));
      await act(async () => { await result.current.addComment('a', 'Again'); });
      expect(result.current.tasks[0].comments).toHaveLength(2);
    });

    it('fills in the author when the API only returns an id', async () => {
      const { result } = await renderLoaded([makeTask({ _id: 'a' })]);
      api.addComment.mockResolvedValueOnce({ ...comment, author: 'u1' } as unknown as typeof comment);

      await act(async () => { await result.current.addComment('a', 'Looks good', ada); });
      expect(result.current.tasks[0].comments?.[0].author).toEqual(ada);
    });

    it('removes comments and attachments locally when the API returns no task', async () => {
      const { result } = await renderLoaded([makeTask({ _id: 'a', comments: [comment], attachments: [attachment] })]);
      api.removeComment.mockResolvedValue(undefined);
      api.removeAttachment.mockResolvedValue(undefined);

      await act(async () => {
        await result.current.removeComment('a', 'c1');
        await result.current.removeAttachment('a', 'f1');
      });
      expect(result.current.tasks[0].comments).toEqual([]);
      expect(result.current.tasks[0].attachments).toEqual([]);
    });

    it('adds an uploaded attachment and forwards the progress callback', async () => {
      const { result } = await renderLoaded([makeTask({ _id: 'a' })]);
      api.uploadAttachment.mockResolvedValue(attachment);

      const file = new File(['x'], 'spec.pdf', { type: 'application/pdf' });
      const onProgress = jest.fn();
      await act(async () => { await result.current.uploadAttachment('a', file, { onProgress }); });
      expect(api.uploadAttachment).toHaveBeenCalledWith('acme', 'a', file, { onProgress });
      expect(result.current.tasks[0].attachments).toEqual([attachment]);
    });
  });
});
