import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListView from '../views/ListView';
import BoardView from '../views/BoardView';
import TimelineView from '../views/TimelineView';
import type { TaskViewProps } from '../views/types';
import { makeTask } from './fixtures';

// Menus, selects and dialogs are slow to open on constrained machines.
jest.setTimeout(30000);

const handlers = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
});

// jsdom applies no CSS, so both the desktop and the phone structures are in the DOM.
// Tests scope queries with these test ids.
describe('ListView', () => {
  it('shows a first-run empty state', () => {
    render(<ListView tasks={[]} totalCount={0} {...handlers()} />);
    expect(screen.getByText(/create your first task/i)).toBeInTheDocument();
  });

  it('tells filtered-out results apart from an empty workspace', () => {
    render(<ListView tasks={[]} totalCount={4} {...handlers()} />);
    expect(screen.getByText(/no tasks match your current filters/i)).toBeInTheDocument();
  });

  it('marks a task as done from its round done button', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Write tests' });
    render(<ListView tasks={[task]} totalCount={1} {...props} />);

    const table = within(screen.getByTestId('list-table'));
    await userEvent.click(table.getByRole('button', { name: 'Mark "Write tests" as done' }));
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, { status: 'completed' });
  });

  it('renames a task inline', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Draft' });
    render(<ListView tasks={[task]} totalCount={1} {...props} />);

    const table = within(screen.getByTestId('list-table'));
    await userEvent.click(table.getByRole('button', { name: 'Draft' }));
    await userEvent.type(table.getByRole('textbox', { name: 'Rename Draft' }), ' v2{Enter}');
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, { title: 'Draft v2' });
  });

  it('renders the desktop table and the phone cards for the same tasks', () => {
    const tasks = [makeTask({ title: 'Alpha' }), makeTask({ title: 'Beta' })];
    render(<ListView tasks={tasks} totalCount={2} {...handlers()} />);

    const table = screen.getByTestId('list-table');
    expect(table.className).toContain('hidden');
    expect(table.className).toContain('md:block');
    expect(within(table).getAllByRole('row')).toHaveLength(3);

    const cards = screen.getByTestId('list-cards');
    expect(cards.className).toContain('md:hidden');
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByTestId('list-card')).toHaveLength(2);
  });

  it('edits a task from its phone card', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Card task', deadline: '2026-10-10T00:00:00.000Z' });
    render(<ListView tasks={[task]} totalCount={1} {...props} />);

    const card = within(screen.getByTestId('list-card'));
    expect(card.getByRole('combobox', { name: 'Status of Card task' })).toBeInTheDocument();
    expect(card.getByRole('combobox', { name: 'Priority of Card task' })).toBeInTheDocument();
    expect(card.getByLabelText('Due date for Card task')).toBeInTheDocument();

    await userEvent.click(card.getByRole('button', { name: 'Mark "Card task" as done' }));
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, { status: 'completed' });

    await userEvent.click(card.getByRole('button', { name: 'Card task' }));
    await userEvent.type(card.getByRole('textbox', { name: 'Rename Card task' }), '!{Enter}');
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, { title: 'Card task!' });
  });

  it('keeps the phone card actions visible on touch and opens the menu', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Touch me' });
    render(<ListView tasks={[task]} totalCount={1} {...props} />);

    const trigger = within(screen.getByTestId('list-card')).getByRole('button', { name: 'Actions for Touch me' });
    expect(trigger.className).not.toMatch(/(^|\s)opacity-0/);
    expect(trigger.className).toContain('size-10');

    const desktopTrigger = within(screen.getByTestId('list-table')).getByRole('button', { name: 'Actions for Touch me' });
    expect(desktopTrigger.className).toContain('md:opacity-0');
    expect(desktopTrigger.className).not.toMatch(/(^|\s)opacity-0/);

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));
    expect(props.onDelete).toHaveBeenCalledWith(task);
  });
});

describe('BoardView', () => {
  it('renders the three workflow columns with counts', () => {
    render(
      <BoardView
        tasks={[makeTask({ status: 'pending' }), makeTask({ status: 'pending' }), makeTask({ status: 'completed' })]}
        {...handlers()}
      />,
    );

    expect(screen.getByTestId('board-columns').className).toContain('md:grid-cols-3');
    const columns = screen.getAllByRole('region');
    expect(columns.map(column => within(column).getByRole('heading').textContent)).toEqual([
      'Pending', 'In Progress', 'Completed',
    ]);
    expect(within(columns[0]).getAllByRole('article')).toHaveLength(2);
    expect(within(columns[1]).getByText('Drop tasks here')).toBeInTheDocument();
  });

  it('offers "Move to" actions as the touch alternative to drag and drop', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Move me', status: 'pending' });
    render(<BoardView tasks={[task]} {...props} />);

    const trigger = screen.getByRole('button', { name: 'Actions for Move me' });
    expect(trigger.className).toContain('md:opacity-0');
    expect(trigger.className).not.toMatch(/(^|\s)opacity-0/);

    await userEvent.click(trigger);
    expect(await screen.findByRole('menuitemradio', { name: 'Pending' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'In Progress' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Completed' }));
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, expect.objectContaining({ status: 'completed' }));
  });

  it('opens a prefilled create form from a column', async () => {
    const props = handlers();
    render(<BoardView tasks={[]} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add task to In Progress' }));
    expect(props.onCreate).toHaveBeenCalledWith({ status: 'in-progress' });
  });
});

describe('TimelineView', () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('reports dependency conflicts and moves bars with the keyboard', async () => {
    const props = handlers();
    const design = makeTask({ _id: 'design', title: 'Design', startDate: '2026-10-01', deadline: '2026-10-05' });
    const build = makeTask({ _id: 'build', title: 'Build', startDate: '2026-10-03', deadline: '2026-10-08', dependencies: ['design'] });
    render(<TimelineView tasks={[design, build]} {...props} />);

    expect(screen.getByRole('status')).toHaveTextContent('1 scheduling conflict');

    const bar = screen.getByRole('button', { name: /^Build, Pending/ });
    bar.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(props.onUpdate).toHaveBeenCalledWith('build', { startDate: '2026-10-04', deadline: '2026-10-09' });

    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(props.onUpdate).toHaveBeenLastCalledWith('build', { startDate: '2026-10-03', deadline: '2026-10-07' });
  });

  it('invites to create a task when empty', () => {
    render(<TimelineView tasks={[]} {...handlers()} />);
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument();
  });

  it('zooms in by day on desktop and out by week on phones', () => {
    const task = makeTask({ title: 'Plan', startDate: '2026-10-01', deadline: '2026-10-05' });
    const mockMedia = (matches: boolean) => {
      window.matchMedia = jest.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
    };

    mockMedia(false);
    const { unmount } = render(<TimelineView tasks={[task]} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'Days' })).toHaveAttribute('aria-pressed', 'true');
    unmount();

    mockMedia(true);
    render(<TimelineView tasks={[task]} {...handlers()} />);
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
    expect(screen.getByRole('button', { name: 'Weeks' })).toHaveAttribute('aria-pressed', 'true');
  });
});
