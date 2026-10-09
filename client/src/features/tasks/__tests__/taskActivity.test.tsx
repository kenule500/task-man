import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EMPTY_DIRECTORY, ProjectsContext, type ProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { tasksApi, type TaskActivityEntry } from '../api';
import TaskDetailDialog, { type TaskDetailActions } from '../components/TaskDetailDialog';
import TaskKey from '../components/TaskKey';
import TaskToolbar from '../components/TaskToolbar';
import BoardView from '../views/BoardView';
import ListView from '../views/ListView';
import { DEFAULT_FILTERS } from '../lib/filters';
import { makeTask } from './fixtures';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  tasksApi: { activity: jest.fn() },
}));

const api = tasksApi as jest.Mocked<typeof tasksApi>;

const directory: ProjectDirectory = {
  ...EMPTY_DIRECTORY,
  slug: 'acme',
  byName: name => (name === 'Website' ? { key: 'WEB' } as never : undefined),
};

const withDirectory = (children: ReactNode) => (
  <MemoryRouter>
    <ProjectsContext.Provider value={directory}>{children}</ProjectsContext.Provider>
  </MemoryRouter>
);

const entry = (id: string, overrides: Partial<TaskActivityEntry> = {}): TaskActivityEntry => ({
  _id: id,
  action: 'task.updated',
  actor: { _id: 'u1', name: 'Ada Lovelace' },
  changes: [{ field: 'status', from: 'pending', to: 'in-progress' }],
  createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  ...overrides,
});

const actions = (): TaskDetailActions => ({
  addComment: jest.fn().mockResolvedValue(undefined),
  removeComment: jest.fn().mockResolvedValue(undefined),
  uploadAttachment: jest.fn().mockResolvedValue(undefined),
  removeAttachment: jest.fn().mockResolvedValue(undefined),
  downloadAttachment: jest.fn().mockResolvedValue(new Blob(['x'])),
});

const task = makeTask({ _id: 'task-1', number: 12, title: 'Ship it', project: 'Website', updatedAt: '2026-10-09T10:00:00.000Z' });

const renderDialog = (current = task) =>
  render(withDirectory(
    <TaskDetailDialog
      task={current}
      tasks={[current]}
      canWrite
      canDelete
      actions={actions()}
      onOpenChange={jest.fn()}
      onEdit={jest.fn()}
      onDelete={jest.fn()}
    />,
  ));

beforeEach(() => {
  api.activity.mockReset();
});

describe('task key', () => {
  it('shows the project key and number, and nothing for tasks without a number', () => {
    const { rerender } = render(withDirectory(<TaskKey task={task} />));
    expect(screen.getByText('WEB-12')).toBeInTheDocument();

    rerender(withDirectory(<TaskKey task={makeTask({ number: 4 })} />));
    expect(screen.getByText('TM-4')).toBeInTheDocument();

    rerender(withDirectory(<TaskKey task={makeTask()} />));
    expect(screen.queryByTestId('task-key')).not.toBeInTheDocument();
  });

  it('copies the key from its button', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(withDirectory(<TaskKey task={task} copyable />));

    await userEvent.click(screen.getByRole('button', { name: 'Copy key' }));
    expect(writeText).toHaveBeenCalledWith('WEB-12');
  });

  it('appears on list rows and board cards', () => {
    const props = { onUpdate: jest.fn().mockResolvedValue(null), onEdit: jest.fn(), onDelete: jest.fn(), onCreate: jest.fn() };
    const { unmount } = render(withDirectory(<ListView tasks={[task]} totalCount={1} {...props} />));
    expect(within(screen.getByTestId('list-table')).getByText('WEB-12')).toBeInTheDocument();
    expect(within(screen.getByTestId('list-cards')).getByText('WEB-12')).toBeInTheDocument();
    unmount();

    render(withDirectory(<BoardView tasks={[task]} {...props} />));
    expect(screen.getByText('WEB-12')).toBeInTheDocument();
  });
});

describe('TaskToolbar export', () => {
  const counts = { all: 3, pending: 1, 'in-progress': 1, completed: 1 };

  it('offers an accessible Export CSV button only when wired', async () => {
    const onExport = jest.fn();
    const { rerender } = render(<TaskToolbar filters={DEFAULT_FILTERS} onChange={jest.fn()} counts={counts} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();

    rerender(<TaskToolbar filters={DEFAULT_FILTERS} onChange={jest.fn()} counts={counts} onExport={onExport} exportCount={3} />);
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('is disabled when no task would be exported', () => {
    render(<TaskToolbar filters={DEFAULT_FILTERS} onChange={jest.fn()} counts={counts} onExport={jest.fn()} exportCount={0} />);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });
});

describe('TaskDetailDialog header and tabs', () => {
  it('shows the key with copy buttons and keeps Details as the first tab', async () => {
    renderDialog();
    expect(screen.getByText('WEB-12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Details', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
    expect(api.activity).not.toHaveBeenCalled();
  });

  it('copies a deep link to the task', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/acme/tasks?task=task-1`);
  });
});

describe('Activity tab', () => {
  it('loads lazily and describes changes in sentences with the absolute time in a title', async () => {
    api.activity.mockResolvedValue({ items: [entry('e1')], nextBefore: null });
    renderDialog();

    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findByText(/changed status from Pending to In Progress/)).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(api.activity).toHaveBeenCalledWith('acme', 'task-1', expect.objectContaining({ limit: 20 }));
    expect(screen.getByText('2 hours ago')).toHaveAttribute('title', expect.stringMatching(/\d{4}/));
    expect(screen.queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading and an empty state with no entries', async () => {
    let resolve!: (value: { items: TaskActivityEntry[]; nextBefore: string | null }) => void;
    api.activity.mockReturnValue(new Promise(done => { resolve = done; }));
    renderDialog();

    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByRole('status', { name: 'Loading activity' })).toBeInTheDocument();

    resolve({ items: [], nextBefore: null });
    expect(await screen.findByText('No activity yet')).toBeInTheDocument();
  });

  it('pages older entries with Load older', async () => {
    api.activity
      .mockResolvedValueOnce({ items: [entry('e2', { action: 'task.commented', changes: [] })], nextBefore: '2026-10-09T08:00:00.000Z' })
      .mockResolvedValueOnce({ items: [entry('e1', { action: 'task.created', changes: [] })], nextBefore: null });
    renderDialog();

    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findByText(/added a comment/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load older' }));

    expect(await screen.findByText(/created this task/)).toBeInTheDocument();
    expect(api.activity).toHaveBeenLastCalledWith('acme', 'task-1', { before: '2026-10-09T08:00:00.000Z', limit: 20 });
    expect(screen.queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument();
  });

  it('shows an error with a retry that loads the entries', async () => {
    api.activity
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [entry('e1')], nextBefore: null });
    renderDialog();

    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/changed status/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refetches when the task is updated while the tab is open', async () => {
    api.activity.mockResolvedValue({ items: [entry('e1')], nextBefore: null });
    const view = renderDialog();
    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    await screen.findByText(/changed status/);

    api.activity.mockResolvedValue({
      items: [entry('e3', { changes: [{ field: 'priority', from: 'low', to: 'high' }] }), entry('e1')],
      nextBefore: null,
    });
    view.rerender(withDirectory(
      <TaskDetailDialog
        task={{ ...task, updatedAt: '2026-10-09T11:00:00.000Z' }}
        tasks={[task]}
        canWrite
        canDelete
        actions={actions()}
        onOpenChange={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    ));

    await waitFor(() => expect(api.activity).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/changed priority from Low to High/)).toBeInTheDocument();
    expect(screen.getAllByText(/changed status/)).toHaveLength(1);
  });
});
