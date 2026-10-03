import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListView from '../views/ListView';
import BoardView from '../views/BoardView';
import CalendarView from '../views/CalendarView';
import TimelineView from '../views/TimelineView';
import type { TaskViewProps } from '../views/types';
import { makeTask } from './fixtures';

const handlers = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
});

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

    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Write tests" as done' }));
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, { status: 'completed' });
  });

  it('renames a task inline', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Draft' });
    render(<ListView tasks={[task]} totalCount={1} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Draft' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Rename Draft' }), ' v2{Enter}');
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, { title: 'Draft v2' });
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

    const columns = screen.getAllByRole('region');
    expect(columns.map(column => within(column).getByRole('heading').textContent)).toEqual([
      'Pending', 'In Progress', 'Completed',
    ]);
    expect(within(columns[0]).getAllByRole('article')).toHaveLength(2);
    expect(within(columns[1]).getByText('Drop tasks here')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Ship v1' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
  });

  it('creates a task due on the clicked day', async () => {
    const props = handlers();
    render(<CalendarView tasks={[]} initialMonth={new Date(2026, 9, 1)} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add task due October 20' }));
    expect(props.onCreate).toHaveBeenCalledWith({ deadline: '2026-10-20' });
  });
});

describe('TimelineView', () => {
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
});
