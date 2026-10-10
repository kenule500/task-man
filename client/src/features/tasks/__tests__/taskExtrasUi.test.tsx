import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clearCache, getCached, setCached, tasksKey } from '@/lib/queryCache';
import { tasksApi } from '../api';
import TaskActionsMenu from '../components/TaskActionsMenu';
import TaskDetailDialog, { type TaskDetailActions } from '../components/TaskDetailDialog';
import TaskRecurrenceField from '../components/TaskRecurrenceField';
import TaskWatchToggle from '../components/TaskWatchToggle';
import type { Task } from '../types';
import { makeTask } from './fixtures';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  tasksApi: {
    duplicate: jest.fn(),
    setWatching: jest.fn(),
  },
}));

const api = tasksApi as jest.Mocked<typeof tasksApi>;

beforeEach(() => clearCache());

describe('TaskWatchToggle', () => {
  it('watches a task, shows the new count and updates the shared task list', async () => {
    const task = makeTask({ _id: 't1', watchers: ['u2'] });
    setCached(tasksKey('acme'), [task]);
    api.setWatching.mockResolvedValue(['u2', 'u1']);
    render(<TaskWatchToggle task={task} currentUserId="u1" workspaceSlug="acme" />);

    const button = screen.getByRole('button', { name: /^Watch\b/ });
    expect(button).toHaveTextContent('Watch');
    expect(button).not.toHaveTextContent('Watching');
    expect(screen.getByText('1 watcher')).toBeInTheDocument();

    await userEvent.click(button);
    expect(api.setWatching).toHaveBeenCalledWith('acme', 't1', true);
    expect(await screen.findByRole('button', { name: /Watching/ })).toBeInTheDocument();
    expect(screen.getByText('2 watchers')).toBeInTheDocument();
    expect(getCached<Task[]>(tasksKey('acme'))?.[0].watchers).toEqual(['u2', 'u1']);
  });

  it('stops watching when already watching', async () => {
    const task = makeTask({ _id: 't2', watchers: ['u1', 'u2'] });
    api.setWatching.mockResolvedValue(['u2']);
    render(<TaskWatchToggle task={task} currentUserId="u1" workspaceSlug="acme" />);

    await userEvent.click(screen.getByRole('button', { name: /Watching/ }));
    expect(api.setWatching).toHaveBeenCalledWith('acme', 't2', false);
    expect(await screen.findByRole('button', { name: /^Watch\b(?!ing)/ })).toBeInTheDocument();
    expect(screen.getByText('1 watcher')).toBeInTheDocument();
  });

  it('keeps the state when the request fails', async () => {
    const task = makeTask({ _id: 't3', watchers: [] });
    api.setWatching.mockRejectedValue(new Error('offline'));
    render(<TaskWatchToggle task={task} currentUserId="u1" workspaceSlug="acme" />);

    await userEvent.click(screen.getByRole('button', { name: /^Watch\b/ }));
    await waitFor(() => expect(api.setWatching).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /^Watch\b(?!ing)/ })).toBeEnabled();
  });

  it('is hidden without a signed-in user or workspace', () => {
    const task = makeTask({ watchers: [] });
    const { container, rerender } = render(<TaskWatchToggle task={task} workspaceSlug="acme" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TaskWatchToggle task={task} currentUserId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TaskRecurrenceField', () => {
  it('turns repeating on with a weekly default', async () => {
    const onChange = jest.fn();
    render(<TaskRecurrenceField value={null} canWrite onChange={onChange} />);
    expect(screen.getByRole('combobox', { name: 'Repeat' })).toHaveTextContent('Does not repeat');
    expect(screen.queryByRole('spinbutton', { name: 'Repeat interval' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Repeat' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Repeats' }));
    expect(onChange).toHaveBeenCalledWith({ every: 1, unit: 'week', basis: 'due' });
  });

  it('changes the interval (clamped), unit and basis', async () => {
    const onChange = jest.fn();
    render(<TaskRecurrenceField value={{ every: 2, unit: 'week', basis: 'due' }} canWrite onChange={onChange} />);
    expect(screen.getByRole('combobox', { name: 'Repeat unit' })).toHaveTextContent('weeks');
    expect(screen.getByRole('combobox', { name: 'Repeat counted from' })).toHaveTextContent('from due date');

    const input = screen.getByRole('spinbutton', { name: 'Repeat interval' });
    await userEvent.clear(input);
    await userEvent.type(input, '9999{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ every: 365, unit: 'week', basis: 'due' });

    await userEvent.click(screen.getByRole('combobox', { name: 'Repeat unit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'months' }));
    expect(onChange).toHaveBeenLastCalledWith({ every: 2, unit: 'month', basis: 'due' });

    await userEvent.click(screen.getByRole('combobox', { name: 'Repeat counted from' }));
    await userEvent.click(await screen.findByRole('option', { name: 'from completion' }));
    expect(onChange).toHaveBeenLastCalledWith({ every: 2, unit: 'week', basis: 'completion' });
  });

  it('switches repeating off', async () => {
    const onChange = jest.fn();
    render(<TaskRecurrenceField value={{ every: 1, unit: 'day', basis: 'completion' }} canWrite onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Repeat' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Does not repeat' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('reads as text without write access', () => {
    render(<TaskRecurrenceField value={{ every: 3, unit: 'month', basis: 'completion' }} canWrite={false} onChange={jest.fn()} />);
    expect(screen.getByText('Every 3 months, from completion')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('TaskDetailDialog extras', () => {
  const ada = { _id: 'u1', name: 'Ada Lovelace' };
  const buildActions = (): jest.Mocked<TaskDetailActions> => ({
    addComment: jest.fn(),
    removeComment: jest.fn(),
    uploadAttachment: jest.fn(),
    removeAttachment: jest.fn(),
    downloadAttachment: jest.fn(),
    updateTask: jest.fn().mockResolvedValue(null),
    openTask: jest.fn(),
  });

  const renderDialog = (task: Task, actions = buildActions(), canWrite = true) => {
    render(
      <TaskDetailDialog
        task={task}
        tasks={[task]}
        currentUser={ada}
        canWrite={canWrite}
        canDelete
        onOpenChange={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        actions={actions}
        workspaceSlug="acme"
      />,
    );
    return actions;
  };

  it('saves checklist and repeat changes through updateTask', async () => {
    const task = makeTask({ _id: 'dlg', checklist: [{ _id: 'a', text: 'Draft', done: false }], recurrence: null });
    const actions = renderDialog(task);

    expect(screen.getByRole('region', { name: 'Checklist' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Draft" as done' }));
    expect(actions.updateTask).toHaveBeenCalledWith('dlg', { checklist: [{ _id: 'a', text: 'Draft', done: true }] });

    await userEvent.click(screen.getByRole('combobox', { name: 'Repeat' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Repeats' }));
    expect(actions.updateTask).toHaveBeenLastCalledWith('dlg', { recurrence: { every: 1, unit: 'week', basis: 'due' } });
  });

  it('has no repeat field on subtasks and epics', () => {
    renderDialog(makeTask({ parent: 'p1' }));
    expect(screen.queryByRole('combobox', { name: 'Repeat' })).not.toBeInTheDocument();
  });

  it('shows the watch toggle in the header and duplicates with the Duplicate button', async () => {
    const task = makeTask({ _id: 'dup', title: 'Original', watchers: ['u1'] });
    const copy = makeTask({ _id: 'dup-copy', title: 'Copy of Original' });
    setCached(tasksKey('acme'), [task]);
    api.duplicate.mockResolvedValue({ task: copy, subtasks: [] });
    const actions = renderDialog(task);

    expect(screen.getByRole('button', { name: /Watching/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(api.duplicate).toHaveBeenCalledWith('acme', 'dup', false);
    await waitFor(() => expect(actions.openTask).toHaveBeenCalledWith(copy));
    expect(getCached<Task[]>(tasksKey('acme'))?.map(item => item._id)).toEqual(['dup', 'dup-copy']);
  });

  it('offers no Duplicate button or editing without write access', () => {
    renderDialog(makeTask({ checklist: [{ _id: 'a', text: 'Draft', done: false }] }), buildActions(), false);
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark "Draft" as done' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('TaskActionsMenu duplicate', () => {
  it('duplicates the task with its subtasks and reports the copy', async () => {
    const task = makeTask({ _id: 'row', title: 'Row task' });
    const copy = makeTask({ _id: 'row-copy', title: 'Copy of Row task' });
    api.duplicate.mockResolvedValue({ task: copy, subtasks: [makeTask({ parent: 'row-copy' })] });
    const onDuplicated = jest.fn();
    render(
      <TaskActionsMenu task={task} onEdit={jest.fn()} onDelete={jest.fn()} workspaceSlug="acme" subtaskCount={1} onDuplicated={onDuplicated} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Row task' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /duplicate/i }));
    expect(api.duplicate).toHaveBeenCalledWith('acme', 'row', true);
    await waitFor(() => expect(onDuplicated).toHaveBeenCalledWith(copy));
  });

  it('hides Duplicate without write access or a workspace', async () => {
    const task = makeTask({ title: 'No dup' });
    const { unmount } = render(<TaskActionsMenu task={task} onEdit={jest.fn()} onDelete={jest.fn()} workspaceSlug="acme" canEdit={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for No dup' }));
    expect(await screen.findByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /duplicate/i })).not.toBeInTheDocument();
    unmount();

    render(<TaskActionsMenu task={task} onEdit={jest.fn()} onDelete={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for No dup' }));
    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /duplicate/i })).not.toBeInTheDocument();
  });
});
