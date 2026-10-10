import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { tasksApi } from '@/features/tasks/api';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import CommandPalette from '../CommandPalette';
import { buildCommandItems, searchCommands } from '../commandSearch';

jest.setTimeout(30000);

jest.mock('@/features/tasks/api', () => ({
  ...jest.requireActual('@/features/tasks/api'),
  tasksApi: { list: jest.fn() },
}));

// Without it the palette would call a real server; projects are optional for the palette
jest.mock('@/features/projects/api', () => ({
  ...jest.requireActual('@/features/projects/api'),
  projectsApi: { list: jest.fn().mockRejectedValue(new Error('offline')) },
}));

const api = tasksApi as jest.Mocked<typeof tasksApi>;

const everything = () => true;
const readOnly = (permission: string) => permission.endsWith(':read');

const tasks = [
  makeTask({ _id: 'a', title: 'Write launch email', project: 'Website', labels: ['marketing'], updatedAt: '2026-10-05T00:00:00Z' }),
  makeTask({ _id: 'b', title: 'Fix login bug', description: 'Users cannot sign in', project: 'Website', status: 'in-progress', updatedAt: '2026-10-08T00:00:00Z' }),
  makeTask({ _id: 'c', title: 'Plan sprint', project: 'Mobile app', updatedAt: '2026-10-07T00:00:00Z' }),
];

describe('buildCommandItems with loaded projects', () => {
  const projects = [{
    _id: 'p1', name: 'Website', key: 'WEB', color: 'blue' as const, icon: 'code' as const, archived: false,
    description: 'Public site',
    sprints: [
      { _id: 's1', project: 'p1', name: 'Sprint 2', goal: 'Ship the board', startDate: '2030-01-01', endDate: '2030-01-14', status: 'active' as const },
      { _id: 's0', project: 'p1', name: 'Sprint 1', startDate: '2029-12-01', endDate: '2029-12-14', status: 'completed' as const },
    ],
  }];
  const items = buildCommandItems('acme', everything, tasks, projects);

  it('links projects and open sprints to the project page', () => {
    const results = searchCommands('website', items);
    expect(results.find(item => item.group === 'Projects')).toMatchObject({ href: '/acme/projects/p1', hint: 'WEB · 2 tasks' });
    expect(searchCommands('board', items).find(item => item.group === 'Sprints')).toMatchObject({ label: 'Sprint 2', href: '/acme/projects/p1' });
    expect(items.some(item => item.label === 'Sprint 1')).toBe(false);
  });

  it('finds help answers and opens them in the help center', () => {
    const help = searchCommands('story points', items).filter(item => item.group === 'Help');
    expect(help.length).toBeGreaterThan(0);
    expect(help[0].href).toMatch(/^\/acme\/help\?q=/);
  });
});

describe('task keys in the palette', () => {
  const projects = [{
    _id: 'p1', name: 'Website', key: 'WEB', color: 'blue' as const, icon: 'code' as const, archived: false, sprints: [],
  }];
  const keyed = [
    makeTask({ _id: 'k1', number: 12, title: 'Fix login bug', project: 'Website' }),
    makeTask({ _id: 'k2', number: 3, title: 'Water the plants' }),
  ];

  it('shows the key in the hint and finds the task by key or number', () => {
    const items = buildCommandItems('acme', everything, keyed, projects);
    const taskItems = items.filter(item => item.group === 'Tasks');
    expect(taskItems.find(item => item.task?._id === 'k1')?.hint).toBe('WEB-12 · Website');
    expect(taskItems.find(item => item.task?._id === 'k2')?.hint).toBe('TM-3');

    const titles = (query: string) => searchCommands(query, items).filter(item => item.group === 'Tasks').map(item => item.label);
    expect(titles('web-12')).toEqual(['Fix login bug']);
    expect(titles('#12')).toEqual(['Fix login bug']);
    expect(titles('tm-3')).toEqual(['Water the plants']);
  });

  it('does not guess a prefix for project tasks while projects are loading', () => {
    const items = buildCommandItems('acme', everything, keyed);
    const hints = items.filter(item => item.group === 'Tasks').map(item => item.hint);
    expect(hints).toEqual(expect.arrayContaining(['Website', 'TM-3']));
    expect(searchCommands('#12', items).filter(item => item.group === 'Tasks')).toHaveLength(1);
  });
});

describe('searchCommands', () => {
  const items = buildCommandItems('acme', everything, tasks);

  it('lists pages and the most recent tasks for an empty query', () => {
    const results = searchCommands('', items);
    expect(results.filter(item => item.group === 'Pages')).toHaveLength(13);
    expect(results.filter(item => item.group === 'Tasks').map(item => item.label)).toEqual([
      'Fix login bug', 'Plan sprint', 'Write launch email',
    ]);
    expect(results.some(item => item.group === 'Projects')).toBe(false);
  });

  it('caps recent tasks at five and matches tasks at eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => makeTask({ title: `Report ${i}`, updatedAt: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
    const manyItems = buildCommandItems('acme', everything, many);
    expect(searchCommands('', manyItems).filter(item => item.group === 'Tasks')).toHaveLength(5);
    expect(searchCommands('report', manyItems).filter(item => item.group === 'Tasks')).toHaveLength(8);
  });

  it('matches title, description, labels and project case-insensitively', () => {
    const titles = (query: string) => searchCommands(query, items).filter(item => item.group === 'Tasks').map(item => item.label);
    expect(titles('LOGIN')).toEqual(['Fix login bug']);
    expect(titles('sign in')).toEqual(['Fix login bug']);
    expect(titles('marketing')).toEqual(['Write launch email']);
    expect(titles('mobile app')).toEqual(['Plan sprint']);
  });

  it('returns distinct matching projects with a task count', () => {
    const projects = searchCommands('web', items).filter(item => item.group === 'Projects');
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ label: 'Website', hint: '2 tasks', href: '/acme/projects' });
  });

  it('routes board, calendar and timeline to the tasks views', () => {
    expect(searchCommands('board', items)[0].href).toBe('/acme/tasks?view=board');
    expect(searchCommands('timeline', items)[0].href).toBe('/acme/tasks?view=timeline');
  });

  it('hides pages and results the user has no permission for', () => {
    const limited = buildCommandItems('acme', (permission: string) => permission === 'tasks:read', tasks);
    const labels = searchCommands('', limited).filter(item => item.group === 'Pages').map(item => item.label);
    expect(labels).toEqual(['Dashboard', 'Tasks', 'Board', 'Calendar', 'Timeline', 'Help']);
    expect(searchCommands('website', limited).some(item => item.group === 'Projects')).toBe(false);
    expect(searchCommands('login', buildCommandItems('acme', () => false, tasks))).toEqual([]);
  });

  it('opens a task through the ?task= link', () => {
    expect(searchCommands('plan', items)[0].href).toBe('/acme/tasks?task=c');
  });
});

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
};

const renderPalette = (can: (permission: string) => boolean = everything, onOpenChange = jest.fn()) => {
  render(
    <MemoryRouter initialEntries={['/acme/dashboard']}>
      <Routes>
        <Route path="*" element={<><CommandPalette open onOpenChange={onOpenChange} slug="acme" can={can} /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return onOpenChange;
};

describe('CommandPalette', () => {
  beforeEach(() => {
    api.list.mockResolvedValue(tasks);
  });

  it('exposes a combobox/listbox pair and loads tasks lazily', async () => {
    renderPalette();
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(await screen.findByRole('option', { name: /fix login bug/i })).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith('acme');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
  });

  it('moves with the arrow keys and opens the highlighted result with Enter', async () => {
    const user = userEvent.setup();
    renderPalette();
    const input = screen.getByRole('combobox');
    await user.type(input, 'tasks');

    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getAllByRole('option').at(-1)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/acme/tasks');
  });

  it('navigates to a task and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderPalette();
    await user.type(screen.getByRole('combobox'), 'login');
    await screen.findByRole('option', { name: /fix login bug/i });
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/acme/tasks?task=b');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderPalette();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup();
    renderPalette();
    await screen.findByRole('option', { name: /fix login bug/i });
    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(screen.getByText(/No results for/, { selector: 'li' })).toHaveTextContent('“zzzz”');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('still lists pages when tasks fail to load', async () => {
    api.list.mockRejectedValue(new Error('offline'));
    renderPalette(readOnly);
    expect(await screen.findByText(/Tasks could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /dashboard/i })).toBeInTheDocument();
  });
});
