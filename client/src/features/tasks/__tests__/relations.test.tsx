import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clearCache, getCached, setCached, tasksKey } from '@/lib/queryCache';
import { tasksApi } from '../api';
import SubtaskList from '../components/SubtaskList';
import TaskActionsMenu from '../components/TaskActionsMenu';
import TaskRelations from '../components/TaskRelations';
import { RelationCount, SubtaskProgress } from '../components/TaskBadges';
import { groupLinks, linkCandidates, parentCandidates } from '../lib/relations';
import { sumSubtaskPoints } from '../lib/subtasks';
import type { Task } from '../types';
import { makeTask } from './fixtures';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  tasksApi: {
    addRelation: jest.fn(),
    removeRelation: jest.fn(),
    moveTask: jest.fn(),
  },
}));

const api = tasksApi as jest.Mocked<typeof tasksApi>;

beforeEach(() => {
  clearCache();
  jest.clearAllMocks();
});

const build = () => {
  const task = makeTask({
    _id: 'a', title: 'Alpha', number: 1,
    dependencies: ['b'],
    relations: [{ type: 'relates', task: 'c' }, { type: 'duplicates', task: 'd' }],
  });
  const blocker = makeTask({ _id: 'b', title: 'Bravo blocker', number: 2 });
  const related = makeTask({ _id: 'c', title: 'Charlie related', number: 3, status: 'completed' });
  const dup = makeTask({ _id: 'd', title: 'Delta duplicate', number: 4 });
  const blocked = makeTask({ _id: 'e', title: 'Echo blocked', number: 5, dependencies: ['a'] });
  const free = makeTask({ _id: 'f', title: 'Foxtrot free', number: 6 });
  return { task, tasks: [task, blocker, related, dup, blocked, free] };
};

describe('relation helpers', () => {
  it('groups links by type in display order, deriving blocks from dependencies', () => {
    const { task, tasks } = build();
    const groups = groupLinks(task, tasks);
    expect(groups.map(group => group.type)).toEqual(['blocks', 'blocked_by', 'relates', 'duplicates']);
    expect(groups[0].items.map(item => item._id)).toEqual(['e']);
    expect(groups[1].items.map(item => item._id)).toEqual(['b']);
  });

  it('searches candidates by key or title and never offers the task itself', () => {
    const { task, tasks } = build();
    const keyOf = (item: Task) => `WEB-${item.number}`;
    expect(linkCandidates(task, tasks, '', keyOf).map(item => item._id)).not.toContain('a');
    expect(linkCandidates(task, tasks, 'web-6', keyOf).map(item => item._id)).toEqual(['f']);
    expect(linkCandidates(task, tasks, 'CHARLIE', keyOf).map(item => item._id)).toEqual(['c']);
  });

  it('offers only top-level non-epic tasks as parents', () => {
    const task = makeTask({ _id: 'x' });
    const top = makeTask({ _id: 'top' });
    const epic = makeTask({ _id: 'epic', type: 'epic' });
    const sub = makeTask({ _id: 'sub', parent: 'top' });
    expect(parentCandidates(task, [task, top, epic, sub]).map(item => item._id)).toEqual(['top']);
  });

  it('sums story points of done and all subtasks', () => {
    const subs = [
      makeTask({ status: 'completed', storyPoints: 3 }),
      makeTask({ storyPoints: 5 }),
      makeTask({ status: 'completed' }),
    ];
    expect(sumSubtaskPoints(subs)).toEqual({ done: 3, total: 8 });
  });
});

describe('TaskRelations', () => {
  it('renders the groups with key, title and status and opens a linked task', async () => {
    const { task, tasks } = build();
    const onOpen = jest.fn();
    render(<TaskRelations task={task} tasks={tasks} canWrite workspaceSlug="acme" onOpen={onOpen} />);

    const section = screen.getByRole('region', { name: 'Linked work' });
    for (const label of ['Blocks', 'Is blocked by', 'Relates to', 'Duplicates']) {
      expect(within(section).getByRole('list', { name: label })).toBeInTheDocument();
    }
    expect(within(section).queryByRole('list', { name: 'Clones' })).not.toBeInTheDocument();
    const relates = within(section).getByRole('list', { name: 'Relates to' });
    expect(within(relates).getByText('Completed')).toBeInTheDocument();

    await userEvent.click(within(relates).getByRole('button', { name: 'Charlie related' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ _id: 'c' }));
  });

  it('links another task with the chosen type and updates the cache', async () => {
    const { task, tasks } = build();
    setCached(tasksKey('acme'), tasks);
    const freshTask = { ...task, relations: [...(task.relations ?? []), { type: 'clones' as const, task: 'f' }] };
    const freshOther = { ...tasks[5], relations: [{ type: 'cloned_by' as const, task: 'a' }] };
    api.addRelation.mockResolvedValue({ task: freshTask, related: freshOther });
    render(<TaskRelations task={task} tasks={tasks} canWrite workspaceSlug="acme" />);

    await userEvent.click(screen.getByRole('button', { name: 'Link work' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Link type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Clones' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Search tasks to link' }), 'foxtrot');
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    await userEvent.click(screen.getByRole('option', { name: /Foxtrot free/ }));

    expect(api.addRelation).toHaveBeenCalledWith('acme', 'a', 'clones', 'f');
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Search tasks to link' })).not.toBeInTheDocument());
    const cached = getCached<Task[]>(tasksKey('acme'))!;
    expect(cached.find(item => item._id === 'a')?.relations).toHaveLength(3);
    expect(cached.find(item => item._id === 'f')?.relations).toEqual([{ type: 'cloned_by', task: 'a' }]);
  });

  it('excludes the task itself from the search', async () => {
    const { task, tasks } = build();
    render(<TaskRelations task={task} tasks={tasks} canWrite workspaceSlug="acme" />);
    await userEvent.click(screen.getByRole('button', { name: 'Link work' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Search tasks to link' }));
    expect(await screen.findByRole('option', { name: /Foxtrot free/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Alpha/ })).not.toBeInTheDocument();
  });

  it('removes a link and offers an undo', async () => {
    const { task, tasks } = build();
    api.removeRelation.mockResolvedValue({ task: { ...task, relations: [{ type: 'duplicates', task: 'd' }] }, related: tasks[2] });
    api.addRelation.mockResolvedValue({ task, related: tasks[2] });
    render(<TaskRelations task={task} tasks={tasks} canWrite workspaceSlug="acme" />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove link: relates to Charlie related' }));
    expect(api.removeRelation).toHaveBeenCalledWith('acme', 'a', 'c', 'relates');
  });

  it('removes a blocked-by link through the blocked_by type', async () => {
    const { task, tasks } = build();
    api.removeRelation.mockResolvedValue({ task: { ...task, dependencies: [] }, related: tasks[1] });
    render(<TaskRelations task={task} tasks={tasks} canWrite workspaceSlug="acme" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove link: is blocked by Bravo blocker' }));
    expect(api.removeRelation).toHaveBeenCalledWith('acme', 'a', 'b', 'blocked_by');
  });

  it('is read-only without write access and hidden when there is nothing to show', () => {
    const { task, tasks } = build();
    const { rerender, container } = render(<TaskRelations task={task} tasks={tasks} canWrite={false} workspaceSlug="acme" />);
    expect(screen.queryByRole('button', { name: 'Link work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove link/ })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Relates to' })).toBeInTheDocument();

    rerender(<TaskRelations task={makeTask()} tasks={[]} canWrite={false} workspaceSlug="acme" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RelationCount badge', () => {
  it('shows the count of links and nothing without links', () => {
    const { container, rerender } = render(<RelationCount count={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RelationCount count={2} />);
    expect(screen.getByText('linked tasks')).toBeInTheDocument();
  });
});

describe('TaskActionsMenu convert and promote', () => {
  const open = async (title: string) => userEvent.click(screen.getByRole('button', { name: `Actions for ${title}` }));

  it('converts a task into a subtask through the parent picker', async () => {
    const task = makeTask({ _id: 'child', title: 'Loose end' });
    const parent = makeTask({ _id: 'parent', title: 'Big story', number: 7 });
    const epic = makeTask({ _id: 'epic', title: 'An epic', type: 'epic' });
    const sub = makeTask({ _id: 'sub', title: 'Already sub', parent: 'parent' });
    const moved = { ...task, parent: 'parent' };
    api.moveTask.mockResolvedValue(moved);
    const onMoved = jest.fn();
    render(
      <TaskActionsMenu task={task} tasks={[task, parent, epic, sub]} onEdit={jest.fn()} onDelete={jest.fn()} workspaceSlug="acme" onMoved={onMoved} />,
    );

    await open('Loose end');
    await userEvent.click(await screen.findByRole('menuitem', { name: /Convert to subtask/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Convert to subtask' });
    const options = within(dialog).getAllByRole('button', { name: /^Make subtask of/ });
    expect(options).toHaveLength(1);
    await userEvent.click(options[0]);

    expect(api.moveTask).toHaveBeenCalledWith('acme', 'child', 'parent');
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith(moved));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Convert to subtask' })).not.toBeInTheDocument());
  });

  it('promotes a subtask to a task', async () => {
    const task = makeTask({ _id: 'sub', title: 'Grown up', parent: 'p' });
    api.moveTask.mockResolvedValue({ ...task, parent: null });
    render(<TaskActionsMenu task={task} onEdit={jest.fn()} onDelete={jest.fn()} workspaceSlug="acme" />);

    await open('Grown up');
    expect(screen.queryByRole('menuitem', { name: /Convert to subtask/ })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Promote to task' }));
    expect(api.moveTask).toHaveBeenCalledWith('acme', 'sub', null);
  });

  it('hides both items for epics, tasks with subtasks, viewers and without a workspace', async () => {
    const epic = makeTask({ title: 'Epic one', type: 'epic' });
    const { unmount } = render(<TaskActionsMenu task={epic} onEdit={jest.fn()} onDelete={jest.fn()} workspaceSlug="acme" />);
    await open('Epic one');
    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Convert to subtask/ })).not.toBeInTheDocument();
    unmount();

    const parent = makeTask({ title: 'Has children' });
    const second = render(<TaskActionsMenu task={parent} subtaskCount={2} onEdit={jest.fn()} onDelete={jest.fn()} workspaceSlug="acme" />);
    await open('Has children');
    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Convert to subtask/ })).not.toBeInTheDocument();
    second.unmount();

    const sub = makeTask({ title: 'Viewer sub', parent: 'p' });
    const third = render(<TaskActionsMenu task={sub} canEdit={false} onEdit={jest.fn()} onDelete={jest.fn()} workspaceSlug="acme" />);
    await open('Viewer sub');
    expect(await screen.findByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Promote to task' })).not.toBeInTheDocument();
    third.unmount();

    render(<TaskActionsMenu task={sub} onEdit={jest.fn()} onDelete={jest.fn()} />);
    await open('Viewer sub');
    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Promote to task' })).not.toBeInTheDocument();
  });
});

describe('subtask progress', () => {
  it('shows the ListTree count badge', () => {
    const { container } = render(<SubtaskProgress done={2} total={5} />);
    expect(screen.getByText('2 of 5 subtasks done')).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-list-tree')).not.toBeNull();
  });

  it('shows a progress bar with done/total subtasks and story points', () => {
    const subtasks = [
      makeTask({ title: 'One', status: 'completed', storyPoints: 2, parent: 'p' }),
      makeTask({ title: 'Two', storyPoints: 3, parent: 'p' }),
      makeTask({ title: 'Three', parent: 'p' }),
    ];
    render(<SubtaskList subtasks={subtasks} canWrite canDelete={false} onAdd={jest.fn()} onToggle={jest.fn()} />);
    expect(screen.getByRole('progressbar', { name: '1 of 3 subtasks done' })).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText(/1\/3 done/)).toHaveTextContent('2/5 story points');
  });

  it('keeps the input focused after Enter adds a subtask', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    render(<SubtaskList subtasks={[]} canWrite canDelete={false} onAdd={onAdd} />);
    const input = screen.getByRole('textbox', { name: 'Add subtask' });

    await userEvent.type(input, 'First{Enter}');
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('First'));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(input).toHaveFocus();
    await userEvent.type(input, 'Second{Enter}');
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Second'));
    expect(input).toHaveFocus();
  });
});
