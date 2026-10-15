import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { tasksApi } from '@/features/tasks/api';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { projectsApi } from '@/features/projects/api';
import { makeProject, makeSprint } from '@/features/projects/__tests__/fixtures';
import RoadmapPage from '../RoadmapPage';

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

const sprint = makeSprint({ _id: 's1', name: 'Sprint 7', status: 'active', startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-14T00:00:00.000Z' });
const website = makeProject({ _id: 'p-web', name: 'Website', key: 'WEB', sprints: [sprint] });
const app = makeProject({ _id: 'p-app', name: 'Mobile app', key: 'APP' });

const checkout = makeTask({ _id: 'e-checkout', type: 'epic', title: 'Checkout revamp', project: 'Website', startDate: '2026-10-05', deadline: '2026-10-20' });
const onboarding = makeTask({ _id: 'e-onboarding', type: 'epic', title: 'Onboarding flow', project: 'Mobile app', startDate: '2026-11-01', deadline: '2026-11-30' });

const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/demo/roadmap']}>
      <Routes>
        <Route path="/:workspaceSlug/roadmap" element={<RoadmapPage />} />
        <Route path="/:workspaceSlug/tasks" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

const timeline = () => screen.findByRole('region', { name: 'Roadmap timeline' });

beforeEach(() => {
  projects.list.mockResolvedValue([website, app]);
  tasks.list.mockResolvedValue([
    checkout,
    makeTask({ epic: 'e-checkout', status: 'completed', storyPoints: 3, startDate: '2026-10-01', deadline: '2026-10-08' }),
    makeTask({ epic: 'e-checkout', storyPoints: 5, deadline: '2026-11-03' }),
    onboarding,
  ]);
});

describe('RoadmapPage', () => {
  it('has one h1 and shows epics grouped by project as keyboard-reachable bars', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const region = await timeline();
    expect(within(region).getByRole('heading', { level: 2, name: /Website/ })).toBeInTheDocument();
    expect(within(region).getByRole('heading', { level: 2, name: /Mobile app/ })).toBeInTheDocument();

    const bar = within(region).getByRole('button', { name: /^Checkout revamp, Oct 1 – Nov 3, 2026, 38% complete, 1 of 2 items done, 3 of 8 points/ });
    expect(bar).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: /^Onboarding flow, Nov 1 – Nov 30, 2026, 0% complete, no items yet/ })).toBeInTheDocument();
  });

  it('opens the epic when its bar is activated with the keyboard', async () => {
    const user = userEvent.setup();
    renderPage();
    const region = await timeline();

    const bar = within(region).getByRole('button', { name: /^Checkout revamp/ });
    bar.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByTestId('where')).toHaveTextContent('/demo/tasks?task=e-checkout');
  });

  it('offers a phone list with the date range, progress and a link to each epic', async () => {
    renderPage();
    const list = await screen.findByRole('region', { name: 'Roadmap list' });

    const link = within(list).getByRole('link', { name: 'Checkout revamp' });
    expect(link).toHaveAttribute('href', '/demo/tasks?task=e-checkout');
    expect(within(list).getByRole('progressbar', { name: 'Checkout revamp progress' })).toHaveAttribute('aria-valuenow', '38');
    expect(within(list).getByText('Oct 1 – Nov 3, 2026')).toBeInTheDocument();
    expect(within(list).getByText('1 of 2 items done · 3 of 8 pts')).toBeInTheDocument();
  });

  it('filters by project and shows that projects sprints above the timeline', async () => {
    const user = userEvent.setup();
    renderPage();
    const region = await timeline();
    expect(within(region).queryByText('Sprint 7')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Project'), 'Website');

    expect(within(region).queryByRole('button', { name: /^Onboarding flow/ })).not.toBeInTheDocument();
    expect(within(region).getByRole('button', { name: /^Checkout revamp/ })).toBeInTheDocument();
    expect(within(region).getByText('Sprint 7')).toBeInTheDocument();
  });

  it('switches the header between months and weeks', async () => {
    const user = userEvent.setup();
    renderPage();
    const region = await timeline();
    expect(within(region).getByText(/^Oct 2026$/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Weeks' }));

    expect(within(region).queryByText(/^Oct 2026$/)).not.toBeInTheDocument();
    expect(within(region).getByText('Oct 5')).toBeInTheDocument();
  });

  it('explains epics when there are none', async () => {
    tasks.list.mockResolvedValue([makeTask({ title: 'Just a task' })]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'No epics to plan yet' })).toBeInTheDocument();
    expect(screen.getByText(/groups related stories across sprints/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to tasks' })).toHaveAttribute('href', '/demo/tasks');
    expect(screen.queryByRole('region', { name: 'Roadmap timeline' })).not.toBeInTheDocument();
  });

  it('shows a readable error when the tasks cannot be loaded', async () => {
    tasks.list.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
