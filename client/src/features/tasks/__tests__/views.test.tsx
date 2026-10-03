import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListView from '../views/ListView';
import BoardView from '../views/BoardView';
import CalendarView from '../views/CalendarView';
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

const localDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

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

  it('marks a task as done from its checkbox', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Write tests' });
    render(<ListView tasks={[task]} totalCount={1} {...props} />);

    const table = within(screen.getByTestId('list-table'));
    await userEvent.click(table.getByRole('checkbox', { name: 'Mark "Write tests" as done' }));
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

    await userEvent.click(card.getByRole('checkbox', { name: 'Mark "Card task" as done' }));
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

    expect(screen.getByTestId('board-columns').className).toContain('snap-x');
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
    expect(screen.queryByRole('menuitem', { name: /move to pending/i })).not.toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: /move to in progress/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /move to completed/i }));
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, expect.objectContaining({ status: 'completed' }));
  });

  it('opens a prefilled create form from a column', async () => {
    const props = handlers();
    render(<BoardView tasks={[]} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add task to In Progress' }));
    expect(props.onCreate).toHaveBeenCalledWith({ status: 'in-progress' });
  });
});

describe('CalendarView', () => {
  it('places tasks on their due day and navigates months', async () => {
    const task = makeTask({ title: 'Ship v1', deadline: '2026-10-14T00:00:00.000Z' });
    render(<CalendarView tasks={[task]} initialMonth={new Date(2026, 9, 1)} {...handlers()} />);

    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(within(screen.getByTestId('calendar-grid')).getByRole('button', { name: 'Ship v1' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
  });

  it('shows an agenda of the days with tasks for phones', async () => {
    const props = handlers();
    const first = makeTask({ title: 'Kickoff', deadline: '2030-03-03T00:00:00.000Z' });
    const second = makeTask({ title: 'Review', deadline: '2030-03-20T00:00:00.000Z' });
    const elsewhere = makeTask({ title: 'Next month', deadline: '2030-04-05T00:00:00.000Z' });
    render(<CalendarView tasks={[second, elsewhere, first]} initialMonth={new Date(2030, 2, 1)} {...props} />);

    const agenda = within(screen.getByTestId('calendar-agenda'));
    expect(agenda.getAllByTestId('agenda-day')).toHaveLength(2);
    const headings = agenda.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent);
    expect(headings[0]).toMatch(/Mar 3$/);
    expect(headings[1]).toMatch(/Mar 20$/);
    expect(agenda.queryByText('Next month')).not.toBeInTheDocument();

    await userEvent.click(agenda.getByRole('button', { name: /^Review/ }));
    expect(props.onEdit).toHaveBeenCalledWith(second);

    await userEvent.click(agenda.getByRole('button', { name: 'Add task on March 3' }));
    expect(props.onCreate).toHaveBeenLastCalledWith({ deadline: '2030-03-03' });

    await userEvent.click(agenda.getByRole('button', { name: 'Add task' }));
    expect(props.onCreate).toHaveBeenLastCalledWith();
  });

  it('highlights today in the agenda and explains an empty month', () => {
    const today = makeTask({ title: 'Due now', deadline: `${localDateKey()}T00:00:00.000Z` });
    const { unmount } = render(<CalendarView tasks={[today]} {...handlers()} />);
    const day = within(screen.getByTestId('calendar-agenda')).getByTestId('agenda-day');
    expect(day).toHaveAttribute('aria-current', 'date');
    expect(within(day).getByText('Today')).toBeInTheDocument();
    unmount();

    render(<CalendarView tasks={[]} initialMonth={new Date(2026, 9, 1)} {...handlers()} />);
    expect(within(screen.getByTestId('calendar-agenda')).getByText('No tasks due in October 2026.')).toBeInTheDocument();
  });

  it('creates a task due on the clicked day', async () => {
    const props = handlers();
    render(<CalendarView tasks={[]} initialMonth={new Date(2026, 9, 1)} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add task due October 20' }));
    expect(props.onCreate).toHaveBeenCalledWith({ deadline: '2026-10-20' });
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
