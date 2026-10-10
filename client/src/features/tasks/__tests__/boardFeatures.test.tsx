import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import BoardView from '../views/BoardView';
import type { TaskViewProps } from '../views/types';
import { makeTask } from './fixtures';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

jest.setTimeout(30000);

const mockedApi = api as jest.Mocked<typeof api>;

const handlers = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
});

const ada = { _id: 'u1', name: 'Ada Lovelace' };
const grace = { _id: 'u2', name: 'Grace Hopper' };

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

beforeEach(() => {
  mockedApi.get.mockReset();
  mockedApi.put.mockReset();
  mockedApi.get.mockRejectedValue({ response: { status: 404 } });
});

describe('BoardView quick filters', () => {
  const tasks = [
    makeTask({ title: 'Crash on save', type: 'bug', assignees: [ada] }),
    makeTask({ title: 'Add dark mode', type: 'story', assignees: [grace] }),
    makeTask({ title: 'Orphan chore' }),
  ];
  const titles = () => screen.queryAllByRole('article').map(card => within(card).getByRole('button', { name: /^(Crash|Add|Orphan)/ }).textContent);

  it('toggles chips that narrow the board and report their state', async () => {
    render(<BoardView tasks={tasks} {...handlers()} currentUserId="u1" />);
    const group = within(screen.getByRole('group', { name: 'Quick filters' }));
    expect(group.getAllByRole('button').map(chip => chip.textContent)).toEqual(
      ['My tasks', 'Bugs', 'Due this week', 'Blocked', 'Unassigned'],
    );
    expect(titles()).toHaveLength(3);

    await userEvent.click(group.getByRole('button', { name: 'Bugs' }));
    expect(group.getByRole('button', { name: 'Bugs' })).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['Crash on save']);

    await userEvent.click(group.getByRole('button', { name: 'Bugs' }));
    expect(titles()).toHaveLength(3);
  });

  it('combines chips with AND and clears them all', async () => {
    render(<BoardView tasks={tasks} {...handlers()} currentUserId="u1" />);
    const group = within(screen.getByRole('group', { name: 'Quick filters' }));

    await userEvent.click(group.getByRole('button', { name: 'My tasks' }));
    expect(titles()).toEqual(['Crash on save']);
    await userEvent.click(group.getByRole('button', { name: 'Unassigned' }));
    expect(titles()).toEqual([]);

    await userEvent.click(group.getByRole('button', { name: /Clear/ }));
    expect(titles()).toHaveLength(3);
  });

  it('updates the status tab counts', async () => {
    render(<BoardView tasks={tasks} {...handlers()} currentUserId="u1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Unassigned' }));
    expect(screen.getByRole('tab', { name: /^Pending/ })).toHaveTextContent('1');
  });

  it('hides "My tasks" without a signed-in user', () => {
    render(<BoardView tasks={tasks} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'My tasks' })).not.toBeInTheDocument();
  });

  it('is driven by the page when controls are given (URL state)', async () => {
    const setQuickFilters = jest.fn();
    render(<BoardView tasks={tasks} {...handlers()} controls={{ quickFilters: ['bugs'], setQuickFilters }} />);
    expect(titles()).toEqual(['Crash on save']);
    expect(screen.getByRole('button', { name: 'Bugs' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Unassigned' }));
    expect(setQuickFilters).toHaveBeenCalledWith(['bugs', 'unassigned']);
  });

  it('resolves "Blocked" against all tasks even when the page filtered the prerequisite out', async () => {
    const prerequisite = makeTask({ _id: 'pre', title: 'Prerequisite', status: 'in-progress' });
    const waiting = makeTask({ title: 'Waiting', dependencies: ['pre'] });
    render(<BoardView tasks={[waiting]} allTasks={[prerequisite, waiting]} {...handlers()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Blocked' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
});

describe('BoardView swimlanes', () => {
  const tasks = [
    makeTask({ title: 'Ada pending', status: 'pending', assignees: [ada] }),
    makeTask({ title: 'Ada done', status: 'completed', assignees: [ada] }),
    makeTask({ title: 'Grace pending', status: 'pending', assignees: [grace] }),
    makeTask({ title: 'Nobody', status: 'in-progress' }),
  ];

  it('groups the board into collapsible lanes that each hold the three columns', async () => {
    render(<BoardView tasks={tasks} {...handlers()} controls={{ groupBy: 'assignee' }} />);

    const lanes = screen.getAllByRole('region').filter(region => region.getAttribute('aria-label')?.endsWith('swimlane'));
    expect(lanes.map(lane => lane.getAttribute('aria-label'))).toEqual([
      'Ada Lovelace swimlane', 'Grace Hopper swimlane', 'Unassigned swimlane',
    ]);
    const ada = within(lanes[0]);
    expect(ada.getByRole('region', { name: 'Pending column in Ada Lovelace' })).toHaveTextContent('Ada pending');
    expect(ada.getByRole('region', { name: 'Completed column in Ada Lovelace' })).toHaveTextContent('Ada done');
    expect(ada.getByRole('region', { name: 'In Progress column in Ada Lovelace' })).toBeInTheDocument();
    // one set of column headers on top, the status switcher is for phones
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Pending', 'In Progress', 'Completed']);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    const toggle = ada.getByRole('button', { name: /Ada Lovelace/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Ada pending')).not.toBeInTheDocument();
    expect(screen.getByText('Grace pending')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText('Ada pending')).toBeInTheDocument();
  });

  it('is ignored on phones', () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn(),
    }));
    render(<BoardView tasks={tasks} {...handlers()} controls={{ groupBy: 'assignee' }} />);
    expect(screen.queryByRole('region', { name: /swimlane/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Task status' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pending column' })).toBeInTheDocument();
  });

  it('groups through the "Group by" select', async () => {
    const setGroupBy = jest.fn();
    render(<BoardView tasks={tasks} {...handlers()} controls={{ groupBy: 'none', setGroupBy }} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Project' }));
    expect(setGroupBy).toHaveBeenCalledWith('project');
  });

  it('only accepts a dropped card in the columns of its own lane', () => {
    const onUpdate = jest.fn().mockResolvedValue(null);
    render(<BoardView tasks={tasks} {...handlers()} onUpdate={onUpdate} controls={{ groupBy: 'assignee' }} />);
    const dragged = tasks[0];
    const dataTransfer = { setData: jest.fn(), getData: () => dragged._id, effectAllowed: '' };

    fireEvent.dragStart(screen.getByRole('button', { name: dragged.title }).closest('article') as HTMLElement, { dataTransfer });
    fireEvent.drop(screen.getByRole('region', { name: 'In Progress column in Grace Hopper' }), { dataTransfer });
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.dragStart(screen.getByRole('button', { name: dragged.title }).closest('article') as HTMLElement, { dataTransfer });
    fireEvent.drop(screen.getByRole('region', { name: 'In Progress column in Ada Lovelace' }), { dataTransfer });
    expect(onUpdate).toHaveBeenCalledWith(dragged._id, expect.objectContaining({ status: 'in-progress' }));
  });
});

describe('BoardView WIP limits', () => {
  const pending = (count: number) => Array.from({ length: count }, (_, index) => makeTask({ title: `p${index}`, status: 'pending' }));
  const header = (label: string) => screen.getByRole('heading', { name: label }).closest('header') as HTMLElement;

  it('turns the header red with "5 / 4" and an accessible warning when over the limit', async () => {
    mockedApi.get.mockResolvedValue({ data: { wipLimits: { pending: 4, 'in-progress': null, completed: null } } });
    render(<BoardView tasks={pending(5)} {...handlers()} workspaceSlug="acme" />);

    await waitFor(() => expect(within(header('Pending')).getByText('5 / 4')).toBeInTheDocument());
    expect(header('Pending').className).toContain('bg-red-50');
    expect(within(header('Pending')).getByText('over WIP limit')).toHaveClass('sr-only');
    expect(within(header('In Progress')).queryByText('over WIP limit')).not.toBeInTheDocument();
    expect(mockedApi.get).toHaveBeenCalledWith('/workspaces/acme/board-settings');
  });

  it('does not warn at or under the limit, and never blocks moving cards in', async () => {
    mockedApi.get.mockResolvedValue({ data: { wipLimits: { pending: 5, 'in-progress': 1, completed: null } } });
    const onUpdate = jest.fn().mockResolvedValue(null);
    const tasks = [...pending(5), makeTask({ title: 'Active', status: 'in-progress' }), makeTask({ title: 'Next', status: 'pending' })];
    render(<BoardView tasks={tasks} {...handlers()} onUpdate={onUpdate} workspaceSlug="acme" />);

    await waitFor(() => expect(within(header('In Progress')).getByText('1 / 1')).toBeInTheDocument());
    expect(within(header('In Progress')).queryByText('over WIP limit')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Start Next: move to In Progress' }));
    expect(onUpdate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'in-progress' }));
  });

  it('counts the whole column, not only what the page filters show', async () => {
    mockedApi.get.mockResolvedValue({ data: { wipLimits: { pending: 2, 'in-progress': null, completed: null } } });
    const all = pending(3);
    render(<BoardView tasks={all.slice(0, 1)} allTasks={all} {...handlers()} workspaceSlug="acme" />);
    await waitFor(() => expect(within(header('Pending')).getByText('3 / 2')).toBeInTheDocument());
  });

  it('treats a missing endpoint (404) as no limits', async () => {
    render(<BoardView tasks={pending(3)} {...handlers()} workspaceSlug="acme" />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(within(header('Pending')).getByText('3')).toBeInTheDocument();
    expect(within(header('Pending')).queryByText('over WIP limit')).not.toBeInTheDocument();
  });

  it('offers "Set WIP limits" only to people who can manage the workspace', async () => {
    const { rerender } = render(<BoardView tasks={[]} {...handlers()} workspaceSlug="acme" />);
    expect(screen.queryByRole('button', { name: /Options for/ })).not.toBeInTheDocument();

    rerender(<BoardView tasks={[]} {...handlers()} workspaceSlug="acme" canManageBoard />);
    expect(screen.getAllByRole('button', { name: /Options for .* column/ })).toHaveLength(3);
  });

  it('saves limits from the column menu', async () => {
    mockedApi.get.mockResolvedValue({ data: { wipLimits: { pending: 8, 'in-progress': null, completed: null } } });
    mockedApi.put.mockResolvedValue({ data: { wipLimits: { pending: 8, 'in-progress': 3, completed: null } } });
    render(<BoardView tasks={[]} {...handlers()} workspaceSlug="acme" canManageBoard />);
    await waitFor(() => expect(within(header('Pending')).getByText('0 / 8')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Options for In Progress column' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Set WIP limits/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Set WIP limits' });
    expect(within(dialog).getByLabelText('Pending')).toHaveValue('8');
    expect(within(dialog).getByLabelText('In Progress')).toHaveFocus();

    await userEvent.type(within(dialog).getByLabelText('In Progress'), '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save limits' }));

    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledWith(
      '/workspaces/acme/board-settings',
      { wipLimits: { pending: 8, 'in-progress': 3, completed: null } },
    ));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(header('In Progress')).getByText('0 / 3')).toBeInTheDocument();
  });

  it('rejects values that are not whole numbers and keeps the dialog open', async () => {
    render(<BoardView tasks={[]} {...handlers()} workspaceSlug="acme" canManageBoard />);

    await userEvent.click(screen.getByRole('button', { name: 'Options for Pending column' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Set WIP limits/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Set WIP limits' });
    await userEvent.type(within(dialog).getByLabelText('Pending'), 'abc');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save limits' }));

    expect(await within(dialog).findByText(/whole number from 1 to 999/)).toBeInTheDocument();
    expect(mockedApi.put).not.toHaveBeenCalled();
  });

  it('shows the server error when saving fails', async () => {
    mockedApi.put.mockRejectedValue(new Error('boom'));
    render(<BoardView tasks={[]} {...handlers()} workspaceSlug="acme" canManageBoard />);

    await userEvent.click(screen.getByRole('button', { name: 'Options for Pending column' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Set WIP limits/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Set WIP limits' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save limits' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not save the WIP limits');
  });
});
