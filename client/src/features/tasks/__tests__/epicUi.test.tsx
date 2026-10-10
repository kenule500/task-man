import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@/features/projects';
import api from '@/utils/api';
import TaskDetailDialog, { type TaskDetailActions } from '../components/TaskDetailDialog';
import TaskFormDialog from '../components/TaskFormDialog';
import TaskToolbar from '../components/TaskToolbar';
import { DEFAULT_FILTERS } from '../lib/filters';
import BoardView from '../views/BoardView';
import CalendarView from '../views/CalendarView';
import type { TaskViewProps } from '../views/types';
import type { Task } from '../types';
import { makeTask } from './fixtures';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

jest.setTimeout(30000);

const mockedApi = api as jest.Mocked<typeof api>;
beforeEach(() => {
  mockedApi.get.mockReset();
  mockedApi.get.mockRejectedValue({ response: { status: 404 } });
});

const web: Project = { _id: 'p1', name: 'Web', key: 'WEB', color: 'blue', icon: 'folder', archived: false, sprints: [] };
const app: Project = { _id: 'p2', name: 'App', key: 'APP', color: 'rose', icon: 'folder', archived: false, sprints: [] };

const checkout = makeTask({ _id: 'epic-1', title: 'Checkout revamp', type: 'epic', project: 'Web' });
const mobile = makeTask({ _id: 'epic-2', title: 'Mobile launch', type: 'epic', project: 'App' });

describe('TaskFormDialog epic field', () => {
  const baseProps = { open: true, onOpenChange: jest.fn(), projects: [web, app] };

  it('lists the epics of the task project and submits the chosen one', async () => {
    const onSubmit = jest.fn().mockResolvedValue({});
    render(
      <TaskFormDialog {...baseProps} tasks={[checkout, mobile]} onSubmit={onSubmit} defaults={{ title: 'Pay with card', project: 'Web', type: 'story' }} />,
    );

    const select = screen.getByRole('combobox', { name: 'Epic' });
    expect(select).toHaveTextContent('No epic');
    await userEvent.click(select);
    // The listbox opens asynchronously (slower on CI): wait for it
    expect(await screen.findByRole('option', { name: 'Checkout revamp' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Mobile launch' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Checkout revamp' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ epic: 'epic-1', project: 'Web' });
  });

  it('takes the project of the chosen epic when the task has none', async () => {
    const onSubmit = jest.fn().mockResolvedValue({});
    render(<TaskFormDialog {...baseProps} tasks={[checkout, mobile]} onSubmit={onSubmit} defaults={{ title: 'Loose item' }} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Epic' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mobile launch' }));
    expect(screen.getByLabelText('Project')).toHaveValue('App');

    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ epic: 'epic-2', project: 'App' });
  });

  it('drops the epic when the project changes to another one', async () => {
    const onSubmit = jest.fn().mockResolvedValue({});
    render(
      <TaskFormDialog {...baseProps} tasks={[checkout, mobile]} onSubmit={onSubmit} defaults={{ title: 'Move me', project: 'Web', epic: 'epic-1' }} />,
    );
    expect(screen.getByRole('combobox', { name: 'Epic' })).toHaveTextContent('Checkout revamp');

    const projectInput = screen.getByLabelText('Project');
    await userEvent.clear(projectInput);
    await userEvent.type(projectInput, 'App');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ project: 'App', epic: null });
  });

  it('hides the epic and sprint fields for an epic and sends neither', async () => {
    const onSubmit = jest.fn().mockResolvedValue({});
    render(<TaskFormDialog {...baseProps} tasks={[checkout]} onSubmit={onSubmit} defaults={{ title: 'Big goal', project: 'Web', type: 'epic' }} />);

    expect(screen.queryByRole('combobox', { name: 'Epic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sprint' })).not.toBeInTheDocument();
    expect(screen.getByText(/groups stories, tasks, bugs and spikes/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: 'epic', epic: null, sprint: null });
  });

  it('leaves the epic of a subtask to its parent', () => {
    const sub = makeTask({ parent: 'p', project: 'Web', epic: 'epic-1' });
    render(<TaskFormDialog {...baseProps} tasks={[checkout]} task={sub} onSubmit={jest.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Epic' })).toBeDisabled();
    expect(screen.getByText(/belong to the epic of their parent/i)).toBeInTheDocument();
  });

  it('shows no epic field while the workspace has no epics', () => {
    render(<TaskFormDialog {...baseProps} tasks={[]} onSubmit={jest.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Epic' })).not.toBeInTheDocument();
  });
});

describe('TaskToolbar epic filter', () => {
  it('offers the epics once there are some and updates the filters', async () => {
    const onChange = jest.fn();
    const counts = { all: 0, pending: 0, 'in-progress': 0, completed: 0 };
    const { rerender } = render(<TaskToolbar filters={DEFAULT_FILTERS} onChange={onChange} counts={counts} />);
    expect(screen.queryByRole('combobox', { name: 'Filter by epic' })).not.toBeInTheDocument();

    rerender(<TaskToolbar filters={DEFAULT_FILTERS} onChange={onChange} counts={counts} epics={[checkout, mobile]} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Filter by epic' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Checkout revamp' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ epic: 'epic-1' }));
  });
});

describe('TaskDetailDialog and epics', () => {
  const actions = (): jest.Mocked<TaskDetailActions> => ({
    addComment: jest.fn(), removeComment: jest.fn(), uploadAttachment: jest.fn(), removeAttachment: jest.fn(),
    downloadAttachment: jest.fn(), openTask: jest.fn(),
  });
  const renderDialog = (task: Task, tasks: Task[], handlers = actions()) => {
    render(
      <TaskDetailDialog
        task={task}
        tasks={tasks}
        canWrite
        canDelete
        onOpenChange={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        actions={handlers}
      />,
    );
    return handlers;
  };

  it('lists the items of an epic with their status and opens one', async () => {
    const done = makeTask({ title: 'Card form', epic: 'epic-1', status: 'completed', type: 'story', storyPoints: 5 });
    const open = makeTask({ title: 'Totals bug', epic: 'epic-1', status: 'in-progress', type: 'bug' });
    const elsewhere = makeTask({ title: 'Unrelated', epic: 'epic-2' });
    const handlers = renderDialog(checkout, [checkout, mobile, done, open, elsewhere]);

    const section = within(screen.getByRole('region', { name: 'Items in this epic' }));
    expect(section.getByText('1 of 2 items done, 5 of 5 points')).toBeInTheDocument();
    const rows = section.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Card form');
    expect(rows[0]).toHaveTextContent('Completed');
    expect(rows[1]).toHaveTextContent('In Progress');
    expect(screen.queryByText('Unrelated')).not.toBeInTheDocument();
    // epics have no sprint and no subtasks
    expect(screen.queryByText('Sprint')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /subtasks/i })).not.toBeInTheDocument();

    await userEvent.click(section.getByRole('button', { name: 'Totals bug' }));
    expect(handlers.openTask).toHaveBeenCalledWith(open);
  });

  it('says so when an epic has no items yet', () => {
    renderDialog(checkout, [checkout]);
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('shows the epic of an item as a chip that opens the epic', async () => {
    const item = makeTask({ title: 'Card form', epic: 'epic-1', type: 'story', project: 'Web' });
    const handlers = renderDialog(item, [checkout, item]);
    await userEvent.click(screen.getByRole('button', { name: 'Epic: Checkout revamp' }));
    expect(handlers.openTask).toHaveBeenCalledWith(checkout);
  });

  it('shows no epic chip for an item outside any epic', () => {
    const item = makeTask({ title: 'Loose' });
    renderDialog(item, [checkout, item]);
    expect(screen.queryByText(/^Epic:/)).not.toBeInTheDocument();
  });
});

describe('views and epics', () => {
  const handlers = (): Omit<TaskViewProps, 'tasks'> => ({
    onUpdate: jest.fn().mockResolvedValue(null),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onCreate: jest.fn(),
  });
  const item = makeTask({ title: 'Card form', epic: 'epic-1', status: 'pending', type: 'story' });
  const loose = makeTask({ title: 'Loose end', status: 'in-progress' });

  it('keeps epics out of the board columns', () => {
    render(<BoardView tasks={[checkout, item, loose]} {...handlers()} />);
    expect(screen.getAllByRole('article').map(card => card.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Card form'), expect.stringContaining('Loose end')]),
    );
    expect(screen.queryByText('Checkout revamp')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('groups the board into one lane per epic, named after the epic', () => {
    render(
      <BoardView
        tasks={[checkout, item, loose]}
        allTasks={[checkout, item, loose]}
        {...handlers()}
        controls={{ groupBy: 'epic' }}
      />,
    );
    const lanes = screen.getAllByRole('region').filter(region => region.getAttribute('aria-label')?.endsWith('swimlane'));
    expect(lanes.map(lane => lane.getAttribute('aria-label'))).toEqual(['Checkout revamp swimlane', 'No epic swimlane']);
    expect(within(lanes[0]).getByText('Card form')).toBeInTheDocument();
    expect(within(lanes[1]).getByText('Loose end')).toBeInTheDocument();
  });

  it('keeps epics off the calendar', () => {
    const due = (title: string, extra: Partial<Task> = {}) => makeTask({ title, deadline: '2026-10-15T00:00:00.000Z', ...extra });
    render(
      <CalendarView
        tasks={[due('Epic due', { type: 'epic' }), due('Item due', { epic: 'epic-1' })]}
        initialMonth={new Date(2026, 9, 1)}
        {...handlers()}
      />,
    );
    expect(screen.getAllByText('Item due').length).toBeGreaterThan(0);
    expect(screen.queryByText('Epic due')).not.toBeInTheDocument();
  });
});
