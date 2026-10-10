import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { tasksApi } from '@/features/tasks/api';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { projectsApi } from '@/features/projects/api';
import { makeProject, makeSprint } from '@/features/projects/__tests__/fixtures';
import WorkloadPage from '../WorkloadPage';

jest.setTimeout(30000);

jest.mock('@/components/AppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/features/tasks/api', () => ({
  ...jest.requireActual('@/features/tasks/api'),
  tasksApi: { list: jest.fn() },
}));

jest.mock('@/features/projects/api', () => ({
  projectsApi: { list: jest.fn() },
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, user: null, loading: false }),
}));

const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const ana = { _id: 'u-ana', name: 'Ana Diaz' };
const ben = { _id: 'u-ben', name: 'Ben Okoye' };

const active = makeSprint({ _id: 's1', name: 'Sprint 7', status: 'active' });
const planned = makeSprint({ _id: 's2', name: 'Sprint 8', status: 'planned', startDate: '2026-10-15T00:00:00.000Z', endDate: '2026-10-28T00:00:00.000Z' });
const website = makeProject({ _id: 'p-web', name: 'Website', key: 'WEB', sprints: [active, planned] });

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/demo/workload']}>
      <Routes>
        <Route path="/:workspaceSlug/workload" element={<WorkloadPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  window.localStorage.clear();
  projects.list.mockResolvedValue([website]);
  tasks.list.mockResolvedValue([
    makeTask({ title: 'Build cart', project: 'Website', sprint: 's1', number: 4, assignees: [ana], storyPoints: 8, status: 'in-progress' }),
    makeTask({ title: 'Pay button', project: 'Website', sprint: 's1', assignees: [ana], storyPoints: 5, status: 'completed' }),
    makeTask({ title: 'Receipts', project: 'Website', sprint: 's1', assignees: [ben], storyPoints: 3 }),
    makeTask({ title: 'Find a designer', project: 'Website', sprint: 's1', storyPoints: 2 }),
    makeTask({ title: 'Next sprint work', project: 'Website', sprint: 's2', assignees: [ben], storyPoints: 13 }),
  ]);
});

describe('WorkloadPage', () => {
  it('shows the active sprint with points per person against the default capacity of 10', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Workload' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await screen.findByRole('heading', { level: 2, name: /Sprint 7/ })).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Workload by person' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map(row => row.getAttribute('aria-label')?.split('. ')[0])).toEqual([
      'Ana Diaz: 13 points, 2 items, over capacity by 3',
      'Ben Okoye: 3 points, 1 item',
      'Unassigned: 2 points, 1 item',
    ]);
    // Over capacity is said in words with an icon, not only by color
    expect(within(rows[0]).getByText('Over by 3')).toBeInTheDocument();
    expect(within(list).getAllByText(/^Over by/)).toHaveLength(1);
    expect(within(list).getByRole('img', { name: '13 of 10 points, 2 items, over capacity by 3' })).toBeInTheDocument();
  });

  it('opens a persons tasks with links to each task', async () => {
    const user = userEvent.setup();
    renderPage();

    const ana = await screen.findByRole('button', { name: /^Ana Diaz/ });
    expect(ana).toHaveAttribute('aria-expanded', 'false');
    await user.click(ana);

    expect(ana).toHaveAttribute('aria-expanded', 'true');
    const tasksOfAna = screen.getByRole('list', { name: 'Tasks of Ana Diaz' });
    expect(within(tasksOfAna).getAllByRole('listitem')).toHaveLength(2);
    expect(within(tasksOfAna).getByRole('link', { name: 'Build cart' })).toHaveAttribute('href', expect.stringMatching(/^\/demo\/tasks\?task=/));
    expect(within(tasksOfAna).getByText('WEB-4')).toBeInTheDocument();

    await user.click(ana);
    expect(screen.queryByRole('list', { name: 'Tasks of Ana Diaz' })).not.toBeInTheDocument();
  });

  it('applies and remembers a different capacity, and rejects invalid ones', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /^Ana Diaz/ });

    const capacity = screen.getByLabelText('Capacity (points)');
    await user.clear(capacity);
    await user.type(capacity, '20');

    expect(screen.queryByText(/^Over by/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ana Diaz: 13 points, 2 items\./ })).toBeInTheDocument();
    expect(window.localStorage.getItem('taskman.workload.capacity.demo')).toBe('20');

    await user.clear(capacity);
    await user.type(capacity, '0');
    expect(screen.getByText('Enter a whole number from 1 to 200.')).toBeInTheDocument();
    expect(capacity).toHaveAttribute('aria-invalid', 'true');
    // The last valid value still applies and stays saved
    expect(window.localStorage.getItem('taskman.workload.capacity.demo')).toBe('20');
  });

  it('starts from a saved capacity', async () => {
    window.localStorage.setItem('taskman.workload.capacity.demo', '13');
    renderPage();
    expect(await screen.findByLabelText('Capacity (points)')).toHaveValue(13);
    expect(screen.queryByText(/^Over by/)).not.toBeInTheDocument();
  });

  it('switches to another sprint of the project', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /^Ana Diaz/ });

    await user.selectOptions(screen.getByLabelText('Sprint'), 's2');

    expect(await screen.findByRole('button', { name: /^Ben Okoye: 13 points, 1 item/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ana Diaz/ })).not.toBeInTheDocument();
  });

  it('can look at a date range instead of a sprint', async () => {
    const user = userEvent.setup();
    tasks.list.mockResolvedValue([
      makeTask({ title: 'In range', project: 'Website', assignees: [ben], storyPoints: 5, startDate: '2026-10-05', deadline: '2026-10-09' }),
      makeTask({ title: 'Out of range', project: 'Website', assignees: [ana], storyPoints: 5, deadline: '2026-12-01' }),
    ]);
    renderPage();
    await user.click(await screen.findByRole('radio', { name: 'Date range' }));
    const from = screen.getByLabelText('From');
    const to = screen.getByLabelText('To');
    await user.clear(from);
    await user.type(from, '2026-10-01');
    await user.clear(to);
    await user.type(to, '2026-10-31');

    expect(await screen.findByRole('button', { name: /^Ben Okoye: 5 points/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ana Diaz/ })).not.toBeInTheDocument();

    await user.clear(to);
    await user.type(to, '2026-09-01');
    expect(await screen.findByText('The start date must be on or before the end date.')).toBeInTheDocument();
  });

  it('explains an empty sprint', async () => {
    tasks.list.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No work in this scope' })).toBeInTheDocument();
    expect(screen.getByText(/This sprint has no tasks yet/)).toBeInTheDocument();
  });

  it('explains when there is no sprint to show', async () => {
    projects.list.mockResolvedValue([makeProject({ name: 'Empty project' })]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No sprint to show' })).toBeInTheDocument();
  });
});
