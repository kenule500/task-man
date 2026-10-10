import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { addDays, toDateKey } from '@/features/tasks';
import { tasksApi } from '@/features/tasks/api';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { projectsApi } from '@/features/projects/api';
import { makeProject, makeSprint } from '@/features/projects/__tests__/fixtures';
import ProjectDetailPage from '../ProjectDetailPage';

jest.setTimeout(30000);

jest.mock('@/components/AppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/features/tasks/api', () => ({
  ...jest.requireActual('@/features/tasks/api'),
  tasksApi: { list: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

jest.mock('@/features/projects/api', () => ({
  projectsApi: {
    list: jest.fn(), update: jest.fn(), createSprint: jest.fn(), updateSprint: jest.fn(),
    startSprint: jest.fn(), completeSprint: jest.fn(), removeSprint: jest.fn(),
  },
}));

let granted: string[] = [];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (permission: string) => granted.includes(permission), user: { _id: 'u1', name: 'Ada' }, loading: false }),
}));

const tasksMock = tasksApi as jest.Mocked<typeof tasksApi>;
const projectsMock = projectsApi as jest.Mocked<typeof projectsApi>;

const day = (offset: number) => toDateKey(addDays(new Date(), offset));
const iso = (offset: number) => `${day(offset)}T00:00:00.000Z`;

const active = makeSprint({ _id: 's-active', project: 'p1', name: 'Sprint 2', goal: 'Ship checkout', status: 'active', startDate: iso(-4), endDate: iso(9) });
const planned = makeSprint({ _id: 's-planned', project: 'p1', name: 'Sprint 3', status: 'planned', startDate: iso(10), endDate: iso(23) });
const finished = makeSprint({
  _id: 's-done', project: 'p1', name: 'Sprint 1', status: 'completed', startDate: iso(-18), endDate: iso(-5),
  completedAt: iso(-5), completedPoints: 13,
});
const project = makeProject({
  _id: 'p1', name: 'Website', key: 'WEB', description: 'The public site', color: 'violet', icon: 'rocket',
  sprints: [finished, active, planned],
});

const story = makeTask({ _id: 't-story', title: 'Checkout page', description: 'Cart and payment', project: 'Website', sprint: 's-active', type: 'story', storyPoints: 5, position: 1 });
const done = makeTask({ _id: 't-done', title: 'Login fix', project: 'website', sprint: 's-active', type: 'bug', storyPoints: 3, status: 'completed', completedAt: new Date().toISOString(), position: 2 });
const subA = makeTask({ _id: 't-sub-a', title: 'Cart totals', project: 'Website', sprint: 's-active', parent: 't-story', position: 1 });
const subB = makeTask({ _id: 't-sub-b', title: 'Payment form', project: 'Website', sprint: 's-active', parent: 't-story', status: 'completed', position: 2 });
const backlogItem = makeTask({ _id: 't-backlog', title: 'Dark mode', project: 'Website', type: 'spike', position: 3 });
const unrelated = makeTask({ _id: 't-other', title: 'Other project work', project: 'Mobile app' });

const renderPage = (url = '/demo/projects/p1') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/:workspaceSlug/projects/:projectId" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  granted = ['projects:read', 'projects:write', 'tasks:write', 'tasks:delete'];
  projectsMock.list.mockResolvedValue([project]);
  tasksMock.list.mockResolvedValue([story, done, subA, subB, backlogItem, unrelated]);
});

describe('ProjectDetailPage', () => {
  it('shows the project header, breadcrumb and stats', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Website' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('WEB')).toBeInTheDocument();
    expect(screen.getByText('The public site')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/demo/projects');
    expect(screen.getByRole('link', { name: /open board/i })).toHaveAttribute('href', '/demo/tasks?view=board&project=Website&sprint=active');

    // 3 top-level tasks (the other project and subtasks do not count), 1 done, 3 of 8 points
    expect(await screen.findByText('Total tasks')).toBeInTheDocument();
    expect(screen.getByText('1 in the backlog')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('3/8')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument(); // velocity: one completed sprint of 13 points
  });

  it('lists the active sprint first with its goal, progress and an accessible burndown', async () => {
    renderPage();

    const heading = await screen.findByRole('heading', { level: 3, name: /Sprint 2/ });
    const card = heading.closest('section') as HTMLElement;
    expect(within(card).getByText(/Ship checkout/)).toBeInTheDocument();
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText('9 days left')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar', { name: 'Sprint 2 progress' })).toHaveAttribute('aria-valuenow', '38');

    const chart = within(card).getByRole('img', { name: /Sprint 2 burndown\. Burndown chart: 5 of 8 points remaining/ });
    expect(chart).toBeInTheDocument();
    expect(within(card).getByRole('table', { name: /remaining points per day/i })).toBeInTheDocument();

    const order = screen.getAllByRole('heading', { level: 3 }).map(item => item.textContent);
    expect(order.indexOf('Sprint 2')).toBeLessThan(order.indexOf('Sprint 3'));
  });

  it('shows task rows with type, points, subtask progress and status', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Tasks in Sprint 2' });
    const row = within(list).getByRole('button', { name: 'Checkout page' }).closest('li') as HTMLElement;

    expect(within(row).getByText('Story')).toBeInTheDocument();
    expect(within(row).getByText('Cart and payment')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(within(row).getByText('1/2')).toBeInTheDocument();
    expect(within(row).getByText('Pending')).toBeInTheDocument();
    expect(within(list).getByText('Bug')).toBeInTheDocument();
  });

  it('expands subtasks and completes one with its checkbox', async () => {
    tasksMock.update.mockResolvedValue({ ...subA, status: 'completed' });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Show 2 subtasks of Checkout page' }));
    const checkbox = await screen.findByRole('checkbox', { name: 'Mark "Cart totals" as done' });
    expect(screen.getByRole('checkbox', { name: 'Mark "Payment form" as done' })).toBeChecked();

    await userEvent.click(checkbox);
    await waitFor(() => expect(tasksMock.update).toHaveBeenCalledWith('demo', 't-sub-a', { status: 'completed' }));
  });

  it('disables subtask checkboxes without tasks:write', async () => {
    granted = ['projects:read'];
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Show 2 subtasks of Checkout page' }));
    expect(await screen.findByRole('checkbox', { name: 'Mark "Cart totals" as done' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: 'New sprint' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete sprint' })).not.toBeInTheDocument();
  });

  it('opens the task details when a row title is clicked', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Checkout page' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Checkout page');
  });

  it('adds a story to a sprint from the quick-add input', async () => {
    tasksMock.create.mockResolvedValue(makeTask({ _id: 'new', title: 'Refund flow' }));
    renderPage();

    const input = await screen.findByRole('textbox', { name: /add a story to sprint 2/i });
    await userEvent.type(input, 'Refund flow{Enter}');

    await waitFor(() => expect(tasksMock.create).toHaveBeenCalledWith('demo', expect.objectContaining({
      title: 'Refund flow', project: 'Website', sprint: 's-active', type: 'story', deadline: day(9),
    })));
  });

  it('keeps planned sprints below the active one and blocks starting while another runs', async () => {
    renderPage();
    const heading = await screen.findByRole('heading', { level: 3, name: /Sprint 3/ });
    const card = heading.closest('section') as HTMLElement;

    const start = within(card).getByRole('button', { name: 'Start sprint' });
    expect(start).toBeDisabled();
    expect(within(card).getByText('Complete the active sprint before starting this one.')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Edit Sprint 3' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Delete Sprint 3' })).toBeInTheDocument();
  });

  it('starts a planned sprint when none is active', async () => {
    projectsMock.list.mockResolvedValue([{ ...project, sprints: [finished, planned] }]);
    projectsMock.startSprint.mockResolvedValue({ ...planned, status: 'active' });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Start sprint' }));
    await waitFor(() => expect(projectsMock.startSprint).toHaveBeenCalledWith('demo', 'p1', 's-planned'));
    expect(tasksMock.list).toHaveBeenCalledTimes(1); // starting does not move tasks
  });

  it('completes the active sprint, moves open tasks and reloads the tasks', async () => {
    projectsMock.completeSprint.mockResolvedValue({ sprint: { ...active, status: 'completed', completedPoints: 3 }, movedTasks: 1 });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Complete sprint' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/1 unfinished task/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByLabelText(/Sprint 3/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Complete sprint' }));

    await waitFor(() => expect(projectsMock.completeSprint).toHaveBeenCalledWith('demo', 'p1', 's-active', 's-planned'));
    await waitFor(() => expect(tasksMock.list).toHaveBeenCalledTimes(2));
  });

  it('confirms before deleting a planned sprint', async () => {
    projectsMock.removeSprint.mockResolvedValue(undefined);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Sprint 3' }));
    expect(projectsMock.removeSprint).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete sprint' }));

    await waitFor(() => expect(projectsMock.removeSprint).toHaveBeenCalledWith('demo', 'p1', 's-planned'));
    await waitFor(() => expect(tasksMock.list).toHaveBeenCalledTimes(2));
  });

  it('collapses completed sprints until asked', async () => {
    renderPage();
    const toggle = await screen.findByRole('button', { name: /Completed sprints/ });
    expect(screen.queryByRole('heading', { level: 3, name: /Sprint 1/ })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    const heading = await screen.findByRole('heading', { level: 3, name: /Sprint 1/ });
    expect(within(heading.closest('section') as HTMLElement).getByText(/13 points delivered/)).toBeInTheDocument();
  });

  it('creates a sprint with suggested name and dates', async () => {
    projectsMock.createSprint.mockResolvedValue(makeSprint({ _id: 'new', project: 'p1', name: 'Sprint 4' }));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'New sprint' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Sprint 4');
    expect(within(dialog).getByLabelText(/Start date/)).toHaveValue(day(24));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create sprint' }));
    await waitFor(() => expect(projectsMock.createSprint).toHaveBeenCalledWith('demo', 'p1', expect.objectContaining({
      name: 'Sprint 4', startDate: day(24), endDate: day(37),
    })));
  });

  it('rejects a sprint that ends before it starts', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New sprint' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.clear(within(dialog).getByLabelText(/End date/));
    await userEvent.type(within(dialog).getByLabelText(/End date/), '2020-01-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create sprint' }));

    expect(within(dialog).getByText('The sprint must end on or after its start date.')).toBeInTheDocument();
    expect(projectsMock.createSprint).not.toHaveBeenCalled();
  });

  it('shows the backlog with quick add and moves a story into a sprint', async () => {
    tasksMock.update.mockResolvedValue({ ...backlogItem, sprint: 's-planned' });
    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: /Backlog/ }));
    const list = await screen.findByRole('list', { name: 'Backlog' });
    expect(within(list).getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
    expect(within(list).getByText('Spike')).toBeInTheDocument();

    await userEvent.click(within(list).getByRole('combobox', { name: 'Move "Dark mode" to a sprint' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Sprint 3' }));
    await waitFor(() => expect(tasksMock.update).toHaveBeenCalledWith('demo', 't-backlog', { sprint: 's-planned' }));
  });

  it('adds a backlog story due in two weeks', async () => {
    tasksMock.create.mockResolvedValue(makeTask({ _id: 'new', title: 'Offline mode' }));
    renderPage('/demo/projects/p1?tab=backlog');

    await userEvent.type(await screen.findByRole('textbox', { name: 'Add a story to the backlog…' }), 'Offline mode{Enter}');
    await waitFor(() => expect(tasksMock.create).toHaveBeenCalledWith('demo', expect.objectContaining({
      title: 'Offline mode', project: 'Website', type: 'story', deadline: day(14),
    })));
    expect(tasksMock.create.mock.calls[0][1]).not.toHaveProperty('sprint');
  });

  it('explains an empty backlog', async () => {
    tasksMock.list.mockResolvedValue([]);
    renderPage('/demo/projects/p1?tab=backlog');
    expect(await screen.findByText('The backlog is empty')).toBeInTheDocument();
  });

  it('shows velocity, status and type distribution and deadlines in the overview', async () => {
    renderPage('/demo/projects/p1?tab=overview');

    expect(await screen.findByRole('img', { name: /Velocity chart: Sprint 1 13 points\. Average 13 points\./ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Story points completed per sprint' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /By status/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /By type/ })).toBeInTheDocument();
    const deadlines = screen.getByRole('region', { name: 'Upcoming deadlines' });
    expect(within(deadlines).getByRole('button', { name: 'Checkout page' })).toBeInTheDocument();
    expect(within(deadlines).queryByRole('button', { name: 'Login fix' })).not.toBeInTheDocument();
  });

  it('shows an empty state for a project without sprints', async () => {
    projectsMock.list.mockResolvedValue([{ ...project, sprints: [] }]);
    renderPage();
    expect(await screen.findByText('No sprints yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New sprint' }).length).toBeGreaterThan(0);
  });

  it('says when the project does not exist', async () => {
    renderPage('/demo/projects/missing');
    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute('href', '/demo/projects');
  });

  it('reports a failure to load the tasks', async () => {
    tasksMock.list.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load tasks.');
  });
});
