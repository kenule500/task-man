import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PermissionContext } from '@/context/PermissionContext';
import type { PermissionContextValue } from '@/context/permissionTypes';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { tasksApi } from '@/features/tasks/api';
import { viewsApi } from '@/features/views/api';
import TaskPage from '../TaskPage';

jest.setTimeout(60000);

jest.mock('@/components/AppShell', () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
jest.mock('@/features/tasks/api', () => ({
  ...jest.requireActual('@/features/tasks/api'),
  tasksApi: { list: jest.fn() },
}));
jest.mock('@/features/workspace/api', () => ({ workspaceApi: { members: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/features/projects/api', () => ({
  ...jest.requireActual('@/features/projects/api'),
  projectsApi: { list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/features/views/api', () => ({
  viewsApi: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
}));

const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const views = viewsApi as jest.Mocked<typeof viewsApi>;

const ada = { _id: 'u1', name: 'Ada Lovelace' };
const alpha = makeTask({ _id: 'alpha', title: 'Alpha login bug', priority: 'high', type: 'bug', assignees: [ada], labels: ['web'] });
const beta = makeTask({ _id: 'beta', title: 'Beta report', priority: 'low', assignees: [] });
const gamma = makeTask({ _id: 'gamma', title: 'Gamma login page', priority: 'low', status: 'completed' });

const permissions: PermissionContextValue = {
  user: { _id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
  workspace: { _id: 'w1', name: 'Acme', slug: 'acme' },
  role: { _id: 'r1', name: 'Test', description: '' },
  permissions: ['tasks:read', 'tasks:write'],
  actions: [],
  loading: false,
  error: null,
  can: permission => ['tasks:read', 'tasks:write'].includes(permission),
  hasRole: () => false,
  refresh: jest.fn().mockResolvedValue(undefined),
};

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
};

const renderPage = async (url: string) => {
  tasks.list.mockResolvedValue([alpha, beta, gamma]);
  views.list.mockResolvedValue([]);
  render(
    <PermissionContext.Provider value={permissions}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/:workspaceSlug/tasks" element={<><TaskPage /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </PermissionContext.Provider>,
  );
  await screen.findByTestId('list-table');
};

const listed = () => within(screen.getByTestId('list-table')).queryAllByRole('row').map(row => row.textContent ?? '');
const search = () => new URLSearchParams(screen.getByTestId('where').textContent?.split('?')[1] ?? '');

describe('TaskPage filters in the URL', () => {
  it('applies the filters of a shared link', async () => {
    await renderPage('/acme/tasks?view=list&q=login&priority=high');
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('login');
    const rows = listed().join(' ');
    expect(rows).toContain('Alpha login bug');
    expect(rows).not.toContain('Gamma login page');
    expect(rows).not.toContain('Beta report');
  });

  it('keeps tasks assigned to me from ?assignedToMe=1 and pressed state in the toolbar', async () => {
    await renderPage('/acme/tasks?assignedToMe=1');
    expect(screen.getByRole('button', { name: /assigned to me/i })).toHaveAttribute('aria-pressed', 'true');
    const rows = listed().join(' ');
    expect(rows).toContain('Alpha login bug');
    expect(rows).not.toContain('Beta report');
  });

  it('ignores unknown values instead of hiding everything', async () => {
    await renderPage('/acme/tasks?status=archived&priority=urgent&type=saga&sort=random');
    const rows = listed().join(' ');
    expect(rows).toContain('Alpha login bug');
    expect(rows).toContain('Beta report');
    expect(rows).toContain('Gamma login page');
  });

  it('writes what you type to the URL and keeps view, task and board parameters', async () => {
    await renderPage('/acme/tasks?view=list&col=completed&qf=bugs&group=type');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'beta');

    const params = search();
    expect(params.get('q')).toBe('beta');
    expect(params.get('view')).toBe('list');
    expect(params.get('col')).toBe('completed');
    expect(params.get('qf')).toBe('bugs');
    expect(params.get('group')).toBe('type');
    expect(listed().join(' ')).toContain('Beta report');
    expect(listed().join(' ')).not.toContain('Alpha login bug');

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search tasks' }));
    expect(search().has('q')).toBe(false);
  });

  it('keeps the filters when switching the layout', async () => {
    await renderPage('/acme/tasks?view=list&q=login&priority=high&task=gone');
    await userEvent.click(screen.getByRole('tab', { name: /calendar/i }));
    const params = search();
    expect(params.get('view')).toBe('calendar');
    expect(params.get('q')).toBe('login');
    expect(params.get('priority')).toBe('high');
  });

  it('offers the saved views menu next to the filters', async () => {
    await renderPage('/acme/tasks');
    expect(screen.getByRole('button', { name: 'Views' })).toBeInTheDocument();
  });
});
