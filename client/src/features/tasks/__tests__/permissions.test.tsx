import type { ComponentProps, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PermissionContext } from '@/context/PermissionContext';
import type { PermissionContextValue } from '@/context/permissionTypes';
import { Toaster, toast } from '@/components/ds';
import TaskPage from '@/pages/TaskPage';
import { tasksApi } from '../api';
import TaskActionsMenu from '../components/TaskActionsMenu';
import { DELETE_UNDO_MS } from '../hooks/useTasks';
import BoardView from '../views/BoardView';
import CalendarView from '../views/CalendarView';
import ListView from '../views/ListView';
import TimelineView from '../views/TimelineView';
import type { TaskViewProps } from '../views/types';
import { makeTask } from './fixtures';

// Menus, selects and dialogs are slow to open on constrained machines.
jest.setTimeout(60000);

jest.mock('@/components/AppShell', () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
jest.mock('@/features/tasks/api', () => ({
  ...jest.requireActual('@/features/tasks/api'),
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
jest.mock('@/features/workspace/api', () => ({
  workspaceApi: { members: jest.fn().mockResolvedValue([]) },
}));

const api = tasksApi as jest.Mocked<typeof tasksApi>;

const handlers = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
  onOpen: jest.fn(),
});

const ada = { _id: 'u1', name: 'Ada Lovelace' };
const grace = { _id: 'u2', name: 'Grace Hopper' };

describe('TaskActionsMenu permissions', () => {
  const open = async (props: Partial<ComponentProps<typeof TaskActionsMenu>>) => {
    render(<TaskActionsMenu task={makeTask({ title: 'Menu task' })} onEdit={jest.fn()} onDelete={jest.fn()} onMove={jest.fn()} {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Menu task' }));
  };

  it('hides Edit and "Move to" without write access and Delete without delete access', async () => {
    await open({ onOpen: jest.fn(), canEdit: false, canDelete: false });
    expect(await screen.findByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /move to/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('keeps Edit for writers who cannot delete', async () => {
    await open({ canEdit: true, canDelete: false });
    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('renders no trigger when there is nothing to offer', () => {
    render(<TaskActionsMenu task={makeTask({ title: 'Nothing' })} onEdit={jest.fn()} onDelete={jest.fn()} canEdit={false} canDelete={false} />);
    expect(screen.queryByRole('button', { name: 'Actions for Nothing' })).not.toBeInTheDocument();
  });
});

describe('read-only views (no tasks:write)', () => {
  it('ListView: static values instead of editors, title opens the details', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Read me' });
    render(<ListView tasks={[task]} totalCount={1} canWrite={false} canDelete={false} {...props} />);
    const table = within(screen.getByTestId('list-table'));

    expect(table.queryByRole('combobox')).not.toBeInTheDocument();
    expect(table.queryByLabelText('Due date for Read me')).not.toBeInTheDocument();
    expect(table.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(table.getByText('Pending')).toBeInTheDocument();

    await userEvent.click(table.getByRole('button', { name: 'Read me' }));
    expect(props.onOpen).toHaveBeenCalledWith(task);
    expect(table.queryByRole('textbox')).not.toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('ListView: still lets writers rename inline and open details from the icon button', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Edit me' });
    render(<ListView tasks={[task]} totalCount={1} {...props} />);
    const table = within(screen.getByTestId('list-table'));

    await userEvent.click(table.getByRole('button', { name: 'Edit me' }));
    expect(table.getByRole('textbox', { name: 'Rename Edit me' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(table.getByRole('button', { name: 'Open details for Edit me' }));
    expect(props.onOpen).toHaveBeenCalledWith(task);
  });

  it('BoardView: no drag, no add buttons, no Move to; the title opens the details', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Card' });
    render(<BoardView tasks={[task]} canWrite={false} canDelete={false} {...props} />);

    expect(screen.getByRole('article')).toHaveAttribute('draggable', 'false');
    expect(screen.queryByRole('button', { name: /^Add task to/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(props.onOpen).toHaveBeenCalledWith(task);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Card' }));
    expect(await screen.findByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /move to/i })).not.toBeInTheDocument();
  });

  it('BoardView: ignores drops without write access', () => {
    const props = handlers();
    const task = makeTask({ title: 'Stay', status: 'pending' });
    render(<BoardView tasks={[task]} canWrite={false} {...props} />);

    const column = screen.getByRole('region', { name: 'In Progress column' });
    fireEvent.drop(column, { dataTransfer: { getData: () => task._id } });
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('CalendarView: chips are not draggable and nothing offers to create tasks', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Ship v1', deadline: '2026-10-14T00:00:00.000Z' });
    render(<CalendarView tasks={[task]} initialMonth={new Date(2026, 9, 1)} canWrite={false} {...props} />);

    const chip = within(screen.getByTestId('calendar-grid')).getByRole('button', { name: 'Ship v1' });
    expect(chip).toHaveAttribute('draggable', 'false');
    expect(screen.queryByRole('button', { name: /^Add task/ })).not.toBeInTheDocument();

    await userEvent.click(chip);
    expect(props.onOpen).toHaveBeenCalledWith(task);
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it('TimelineView: keyboard shortcuts and resize handles are disabled', async () => {
    const props = handlers();
    const task = makeTask({ _id: 'bar', title: 'Bar', startDate: '2026-10-01', deadline: '2026-10-05' });
    render(<TimelineView tasks={[task]} canWrite={false} onUpdate={props.onUpdate} onEdit={props.onEdit} onOpen={props.onOpen} onCreate={props.onCreate} />);

    const bar = screen.getByRole('button', { name: /^Bar, Pending/ });
    expect(bar.getAttribute('aria-label')).not.toMatch(/arrow keys/i);
    bar.focus();
    await userEvent.keyboard('{ArrowRight}{Shift>}{ArrowLeft}{/Shift}');
    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(bar.querySelector('.cursor-ew-resize')).toBeNull();

    await userEvent.click(bar);
    expect(props.onOpen).toHaveBeenCalledWith(task);
  });

  it('TimelineView: hides the add button of the empty state', () => {
    render(<TimelineView tasks={[]} canWrite={false} onUpdate={jest.fn()} onEdit={jest.fn()} onCreate={jest.fn()} />);
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
  });
});

describe('labels and assignees on the views', () => {
  const task = makeTask({
    title: 'Tagged',
    deadline: '2026-10-14T00:00:00.000Z',
    startDate: '2026-10-12',
    labels: ['bug', 'design', 'ops', 'docs'],
    assignees: [ada, grace, { _id: 'u3', name: 'Alan Turing' }, { _id: 'u4', name: 'Edsger Dijkstra' }, { _id: 'u5', name: 'Barbara Liskov' }],
  });

  it('ListView and BoardView show up to three labels and avatars, then "+N"', () => {
    const { unmount } = render(<ListView tasks={[task]} totalCount={1} {...handlers()} />);
    const row = within(screen.getByTestId('list-table'));
    expect(row.getByText('bug')).toBeInTheDocument();
    expect(row.getByText('ops')).toBeInTheDocument();
    expect(row.queryByText('docs')).not.toBeInTheDocument();
    expect(row.getByText(/\+1/)).toBeInTheDocument();
    expect(row.getByText(/\+2/)).toBeInTheDocument();
    expect(row.getByText(/Assigned to Ada Lovelace, Grace Hopper/)).toBeInTheDocument();
    unmount();

    render(<BoardView tasks={[task]} {...handlers()} />);
    expect(screen.getByText('design')).toBeInTheDocument();
    expect(screen.getByText(/Assigned to Ada Lovelace/)).toBeInTheDocument();
  });

  it('CalendarView chips announce the labels', () => {
    render(<CalendarView tasks={[task]} initialMonth={new Date(2026, 9, 1)} {...handlers()} />);
    const chip = within(screen.getByTestId('calendar-grid')).getByRole('button', { name: /Tagged/ });
    expect(chip).toHaveTextContent('Labels: bug, design, ops, docs');
  });

  it('TimelineView shows the assignees next to the task name', () => {
    render(<TimelineView tasks={[task]} onUpdate={jest.fn()} onEdit={jest.fn()} onCreate={jest.fn()} />);
    expect(screen.getByText(/Assigned to Ada Lovelace/)).toBeInTheDocument();
  });
});

describe('TaskPage', () => {
  const alpha = makeTask({ _id: 'alpha', title: 'Alpha', labels: ['bug'], assignees: [ada] });
  const beta = makeTask({ _id: 'beta', title: 'Beta', labels: ['ops'], assignees: [grace] });

  const permissions = (...granted: string[]): PermissionContextValue => ({
    user: { _id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
    workspace: { _id: 'w1', name: 'Acme', slug: 'acme' },
    role: { _id: 'r1', name: 'Test', description: '' },
    permissions: granted,
    actions: [],
    loading: false,
    error: null,
    can: permission => granted.includes(permission),
    hasRole: () => false,
    refresh: jest.fn().mockResolvedValue(undefined),
  });

  const renderPage = async (value: PermissionContextValue) => {
    api.list.mockResolvedValue([alpha, beta]);
    const view = render(
      <PermissionContext.Provider value={value}>
        <MemoryRouter initialEntries={['/acme/tasks']}>
          <Routes>
            <Route path="/:workspaceSlug/tasks" element={<TaskPage />} />
          </Routes>
        </MemoryRouter>
        <Toaster />
      </PermissionContext.Provider>,
    );
    await screen.findByTestId('list-table');
    return view;
  };

  afterEach(() => {
    act(() => toast.clear());
    jest.useRealTimers();
  });

  it('viewers get a read-only page', async () => {
    await renderPage(permissions('tasks:read'));
    const table = within(screen.getByTestId('list-table'));

    expect(screen.queryByRole('button', { name: /add task/i })).not.toBeInTheDocument();
    expect(table.queryByRole('combobox')).not.toBeInTheDocument();
    expect(table.getAllByRole('checkbox').every(box => box.getAttribute('aria-disabled') === 'true')).toBe(true);

    await userEvent.click(table.getByRole('button', { name: 'Open details for Alpha' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(dialog.queryByRole('textbox', { name: 'Add a comment' })).not.toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: /delete task/i })).not.toBeInTheDocument();
  });

  it('writers without delete access can edit but not delete', async () => {
    await renderPage(permissions('tasks:read', 'tasks:write'));
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument();

    await userEvent.click(within(screen.getByTestId('list-table')).getByRole('button', { name: 'Actions for Alpha' }));
    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('deleting hides the task at once and Undo restores it without calling the API', async () => {
    await renderPage(permissions('tasks:read', 'tasks:write', 'tasks:delete'));
    const table = within(screen.getByTestId('list-table'));

    await userEvent.click(table.getByRole('button', { name: 'Actions for Alpha' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));

    // Asks first: cancelling keeps the task
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this task?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(table.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();

    await userEvent.click(table.getByRole('button', { name: 'Actions for Alpha' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    expect(table.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
    // Several live regions exist (toasts, bulk bar); the toast is the one announcing the delete
    expect(screen.getAllByRole('status').some(region => region.textContent?.includes('Task deleted'))).toBe(true);
    expect(api.remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await within(screen.getByTestId('list-table')).findByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('sends the delete once the undo toast expires', async () => {
    api.remove.mockResolvedValue();
    await renderPage(permissions('tasks:read', 'tasks:write', 'tasks:delete'));

    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(within(screen.getByTestId('list-table')).getByRole('button', { name: 'Actions for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(api.remove).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(DELETE_UNDO_MS + 100); });
    expect(api.remove).toHaveBeenCalledWith('acme', 'alpha');
    expect(screen.queryByText('Task deleted')).not.toBeInTheDocument();
  });

  it('filters to the tasks assigned to me', async () => {
    await renderPage(permissions('tasks:read'));
    const table = () => within(screen.getByTestId('list-table'));
    expect(table().getByRole('button', { name: 'Beta' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /assigned to me/i }));
    expect(table().getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(table().queryByRole('button', { name: 'Beta' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /assigned to me/i }));
    await waitFor(() => expect(table().getByRole('button', { name: 'Beta' })).toBeInTheDocument());
  });
});
