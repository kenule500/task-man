import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { flowApi } from '@/features/flow/api';
import { makeFlowReport } from '@/features/flow/__tests__/fixtures';
import { tasksApi } from '@/features/tasks/api';
import { projectsApi } from '@/features/projects/api';
import ReportsPage from '../ReportsPage';

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

jest.mock('@/features/flow/api', () => ({ flowApi: { report: jest.fn() } }));

let allowed = true;
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => allowed, user: null, loading: false }),
}));

const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const flow = flowApi.report as jest.MockedFunction<typeof flowApi.report>;

const Search = () => <p data-testid="search">{useLocation().search}</p>;

const renderPage = (url = '/demo/reports') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/:workspaceSlug/reports" element={<><ReportsPage /><Search /></>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  allowed = true;
  window.localStorage.clear();
  tasks.list.mockResolvedValue([]);
  projects.list.mockResolvedValue([]);
  flow.mockReset();
  flow.mockResolvedValue(makeFlowReport());
});

describe('ReportsPage flow tab', () => {
  it('opens on the overview and loads the flow report only when the Flow tab is chosen', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Completion rate')).toBeInTheDocument();
    expect(flow).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Flow' }));
    expect(await screen.findByRole('heading', { name: 'Cumulative flow' })).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=flow');

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('Completion rate')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('can be opened straight from the address', async () => {
    renderPage('/demo/reports?tab=flow');
    expect(await screen.findByRole('heading', { name: 'Cumulative flow' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not offer the Flow tab to roles that cannot read projects', async () => {
    allowed = false;
    renderPage('/demo/reports?tab=flow');
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Flow' })).toBeNull();
    expect(flow).not.toHaveBeenCalled();
  });
});
