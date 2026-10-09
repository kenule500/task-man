import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@/features/projects';
import SubtaskList from '../components/SubtaskList';
import TaskDetailDialog, { type TaskDetailActions } from '../components/TaskDetailDialog';
import TaskFormDialog from '../components/TaskFormDialog';
import TaskToolbar from '../components/TaskToolbar';
import { StoryPoints, SubtaskProgress, TaskTypeBadge, TaskTypeIcon } from '../components/TaskBadges';
import { DEFAULT_FILTERS } from '../lib/filters';
import ListView from '../views/ListView';
import type { Task } from '../types';
import { makeTask } from './fixtures';

// Dialogs, selects and portals are slow on constrained machines.
jest.setTimeout(30000);

const project: Project = {
  _id: 'p1', name: 'Website', key: 'WEB', color: 'blue', icon: 'folder', archived: false,
  sprints: [{ _id: 's2', project: 'p1', name: 'Sprint 2', startDate: '2026-10-01', endDate: '2026-10-14', status: 'active' }],
};

describe('scrum badges', () => {
  it('labels each work item type', () => {
    render(<><TaskTypeIcon type="bug" /><TaskTypeIcon type="story" /><TaskTypeIcon /><TaskTypeBadge type="spike" /></>);
    expect(screen.getByRole('img', { name: 'Bug' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Story' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Task' })).toBeInTheDocument();
    expect(screen.getByText('Spike')).toBeInTheDocument();
  });

  it('shows story points with an accessible label and nothing without an estimate', () => {
    const { rerender, container } = render(<StoryPoints points={3} />);
    expect(screen.getByRole('img', { name: '3 story points' })).toHaveTextContent('3 pts');

    rerender(<StoryPoints points={1} />);
    expect(screen.getByRole('img', { name: '1 story point' })).toHaveTextContent('1 pt');

    rerender(<StoryPoints points={0} />);
    expect(screen.getByRole('img', { name: '0 story points' })).toBeInTheDocument();

    rerender(<StoryPoints points={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows subtask progress and hides it without subtasks', () => {
    const { rerender, container } = render(<SubtaskProgress done={2} total={5} />);
    expect(screen.getByText('2/5')).toBeInTheDocument();
    expect(screen.getByText('2 of 5 subtasks done')).toBeInTheDocument();

    rerender(<SubtaskProgress done={0} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SubtaskList', () => {
  const open = makeTask({ _id: 'a', title: 'Draft copy', description: 'First pass' });
  const done = makeTask({ _id: 'b', title: 'Review copy', status: 'completed' });

  it('shows the progress header and toggles subtasks', async () => {
    const onToggle = jest.fn();
    render(<SubtaskList subtasks={[open, done]} canWrite canDelete onToggle={onToggle} />);

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('First pass')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark subtask "Draft copy" as done' }));
    expect(onToggle).toHaveBeenCalledWith(open, true);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark subtask "Review copy" as not done' }));
    expect(onToggle).toHaveBeenCalledWith(done, false);
  });

  it('adds a subtask on Enter and clears the input', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    render(<SubtaskList subtasks={[]} canWrite canDelete onAdd={onAdd} />);

    const input = screen.getByRole('textbox', { name: 'Add subtask' });
    await userEvent.type(input, '  Write tests  {Enter}');
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Write tests'));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('does not add an empty title', async () => {
    const onAdd = jest.fn();
    render(<SubtaskList subtasks={[]} canWrite canDelete onAdd={onAdd} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Add subtask' }), '   {Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('opens and deletes a subtask, deleting only with permission', async () => {
    const onOpen = jest.fn();
    const onDelete = jest.fn();
    const { rerender } = render(<SubtaskList subtasks={[open]} canWrite canDelete onOpen={onOpen} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /^Draft copy/ }));
    expect(onOpen).toHaveBeenCalledWith(open);
    await userEvent.click(screen.getByRole('button', { name: 'Delete subtask Draft copy' }));
    expect(onDelete).toHaveBeenCalledWith(open);

    rerender(<SubtaskList subtasks={[open]} canWrite canDelete={false} onOpen={onOpen} onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: /Delete subtask/ })).not.toBeInTheDocument();
  });

  it('is read-only without write access', () => {
    render(<SubtaskList subtasks={[open]} canWrite={false} canDelete={false} onAdd={jest.fn()} onToggle={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Draft copy/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('textbox', { name: 'Add subtask' })).not.toBeInTheDocument();
  });
});

describe('TaskDetailDialog with subtasks', () => {
  const parent = makeTask({ _id: 'parent', title: 'Build checkout', type: 'story', storyPoints: 8, project: 'Website', sprint: 's2', deadline: '2026-10-12T00:00:00.000Z' });
  const first = makeTask({ _id: 'sub-1', title: 'Cart page', parent: 'parent', status: 'completed' });
  const second = makeTask({ _id: 'sub-2', title: 'Payment form', parent: 'parent' });

  const buildActions = (): jest.Mocked<TaskDetailActions> => ({
    addComment: jest.fn().mockResolvedValue(undefined),
    removeComment: jest.fn().mockResolvedValue(undefined),
    uploadAttachment: jest.fn().mockResolvedValue(undefined),
    removeAttachment: jest.fn().mockResolvedValue(undefined),
    downloadAttachment: jest.fn().mockResolvedValue(new Blob(['x'])),
    createSubtask: jest.fn().mockResolvedValue(undefined),
    updateTask: jest.fn().mockResolvedValue(undefined),
    openTask: jest.fn(),
  });

  const renderDialog = (task: Task, actions = buildActions(), canWrite = true) => {
    const onDelete = jest.fn();
    render(
      <TaskDetailDialog
        task={task}
        tasks={[parent, first, second]}
        projects={[project]}
        canWrite={canWrite}
        canDelete
        actions={actions}
        onOpenChange={jest.fn()}
        onEdit={jest.fn()}
        onDelete={onDelete}
      />,
    );
    return { actions, onDelete };
  };

  it('shows type, points, sprint and the subtask checklist of a parent', () => {
    renderDialog(parent);
    const dialog = within(screen.getByRole('dialog'));

    expect(dialog.getAllByText('Story').length).toBeGreaterThan(0);
    expect(dialog.getByRole('img', { name: '8 story points' })).toBeInTheDocument();
    expect(dialog.getByText('Sprint 2')).toBeInTheDocument();
    const section = within(dialog.getByRole('region', { name: 'Subtasks' }));
    expect(section.getByText('1/2')).toBeInTheDocument();
    expect(section.getByText('Cart page')).toBeInTheDocument();
    expect(section.getByText('Payment form')).toBeInTheDocument();
  });

  it('ticks a subtask through updateTask', async () => {
    const { actions } = renderDialog(parent);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark subtask "Payment form" as done' }));
    expect(actions.updateTask).toHaveBeenCalledWith('sub-2', { status: 'completed' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark subtask "Cart page" as not done' }));
    expect(actions.updateTask).toHaveBeenCalledWith('sub-1', { status: 'pending' });
  });

  it('creates a subtask under the parent', async () => {
    const { actions } = renderDialog(parent);
    await userEvent.type(screen.getByRole('textbox', { name: 'Add subtask' }), 'Receipt email{Enter}');
    await waitFor(() => expect(actions.createSubtask).toHaveBeenCalledWith(parent, 'Receipt email'));
  });

  it('opens a subtask and deletes it from the list', async () => {
    const { actions, onDelete } = renderDialog(parent);
    await userEvent.click(screen.getByRole('button', { name: /^Payment form/ }));
    expect(actions.openTask).toHaveBeenCalledWith(second);
    await userEvent.click(screen.getByRole('button', { name: 'Delete subtask Payment form' }));
    expect(onDelete).toHaveBeenCalledWith(second);
  });

  it('links a subtask back to its parent and has no checklist of its own', async () => {
    const { actions } = renderDialog(second);
    const dialog = within(screen.getByRole('dialog'));

    expect(dialog.queryByRole('region', { name: 'Subtasks' })).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: /Subtask of/ })).toHaveTextContent('Subtask of Build checkout');
    await userEvent.click(dialog.getByRole('button', { name: /Back to parent/ }));
    expect(actions.openTask).toHaveBeenCalledWith(parent);
  });

  it('lists subtasks read-only without write access', () => {
    renderDialog(parent, buildActions(), false);
    expect(screen.getByText('Cart page')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Add subtask' })).not.toBeInTheDocument();
  });
});

describe('TaskFormDialog scrum fields', () => {
  const baseProps = { open: true, onOpenChange: jest.fn(), tasks: [] as Task[], projects: [project] };

  it('submits type, story points and sprint from the defaults', async () => {
    const onSubmit = jest.fn().mockResolvedValue({});
    render(
      <TaskFormDialog
        {...baseProps}
        onSubmit={onSubmit}
        defaults={{ title: 'Fix login', project: 'Website', type: 'bug', storyPoints: 5, sprint: 's2' }}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Bug');
    expect(screen.getByRole('combobox', { name: 'Story points' })).toHaveTextContent('5 points');
    expect(screen.getByRole('combobox', { name: 'Sprint' })).toHaveTextContent('Sprint 2');

    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: 'bug', storyPoints: 5, sprint: 's2', project: 'Website' });
  });

  it('disables the sprint select until the task has a known project', () => {
    render(<TaskFormDialog {...baseProps} onSubmit={jest.fn()} defaults={{ title: 'x' }} />);
    expect(screen.getByRole('combobox', { name: 'Sprint' })).toBeDisabled();
    expect(screen.getByText(/pick one of your projects/i)).toBeInTheDocument();
  });

  it('clears the sprint when the project changes to another one', async () => {
    const onSubmit = jest.fn().mockResolvedValue({});
    render(
      <TaskFormDialog {...baseProps} onSubmit={onSubmit} defaults={{ title: 'Move me', project: 'Website', sprint: 's2' }} />,
    );

    const projectInput = screen.getByLabelText('Project');
    await userEvent.clear(projectInput);
    await userEvent.type(projectInput, 'Mobile');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ project: 'Mobile', sprint: null });
  });

  it('leaves the sprint of a subtask to its parent', () => {
    const sub = makeTask({ parent: 'p', project: 'Website' });
    render(<TaskFormDialog {...baseProps} task={sub} onSubmit={jest.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Sprint' })).toBeDisabled();
    expect(screen.getByText(/follow the sprint of their parent/i)).toBeInTheDocument();
  });
});

describe('TaskToolbar type filter', () => {
  it('offers a type filter that updates the filters', async () => {
    const onChange = jest.fn();
    render(
      <TaskToolbar
        filters={DEFAULT_FILTERS}
        onChange={onChange}
        counts={{ all: 0, pending: 0, 'in-progress': 0, completed: 0 }}
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Filter by type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bug' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'bug' }));
  });
});

describe('ListView with scrum data', () => {
  const handlers = () => ({
    onUpdate: jest.fn().mockResolvedValue(null),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onCreate: jest.fn(),
  });
  const parent = makeTask({ _id: 'parent', title: 'Build checkout', type: 'story', storyPoints: 8 });
  const done = makeTask({ _id: 'sub-1', title: 'Cart page', parent: 'parent', status: 'completed', position: 1 });
  const open = makeTask({ _id: 'sub-2', title: 'Payment form', parent: 'parent', position: 2 });

  it('shows type icon, points and subtask progress, with subtasks under their parent', () => {
    render(<ListView tasks={[parent, open, done]} totalCount={3} {...handlers()} />);
    const table = within(screen.getByTestId('list-table'));

    expect(table.getByRole('img', { name: 'Story' })).toBeInTheDocument();
    expect(table.getByRole('img', { name: '8 story points' })).toBeInTheDocument();
    expect(table.getByText('1/2')).toBeInTheDocument();

    const rows = table.getAllByRole('row').slice(1);
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('Build checkout'),
      expect.stringContaining('Cart page'),
      expect.stringContaining('Payment form'),
    ]);
  });

  it('keeps subtask progress right while filters hide some subtasks', () => {
    render(<ListView tasks={[parent, open]} allTasks={[parent, open, done]} totalCount={3} {...handlers()} />);
    expect(within(screen.getByTestId('list-table')).getByText('1/2')).toBeInTheDocument();
  });

  it('names the parent of a subtask shown without it', () => {
    render(<ListView tasks={[open]} allTasks={[parent, open, done]} totalCount={3} {...handlers()} />);
    expect(within(screen.getByTestId('list-table')).getByText('Subtask of Build checkout')).toBeInTheDocument();
  });
});
