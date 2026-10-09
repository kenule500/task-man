import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarView from '../views/CalendarView';
import type { TaskViewProps } from '../views/types';
import { makeTask } from './fixtures';

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

// jsdom applies no CSS, so both the desktop grid and the phone layout are in the DOM.
describe('CalendarView', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  const phone = () => within(screen.getByTestId('calendar-agenda'));
  const weekStrip = () => within(screen.getByRole('list', { name: 'Week' }));

  it('places tasks on their due day and navigates months', async () => {
    const task = makeTask({ title: 'Ship v1', deadline: '2026-10-14T00:00:00.000Z' });
    render(<CalendarView tasks={[task]} initialMonth={new Date(2026, 9, 1)} {...handlers()} />);

    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(within(screen.getByTestId('calendar-grid')).getByRole('button', { name: 'Ship v1' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
  });

  it('lists the days of the month with tasks in a collapsed "Upcoming" agenda for phones', async () => {
    const props = handlers();
    const first = makeTask({ title: 'Kickoff', deadline: '2030-03-03T00:00:00.000Z' });
    const second = makeTask({ title: 'Review', deadline: '2030-03-20T00:00:00.000Z' });
    const elsewhere = makeTask({ title: 'Next month', deadline: '2030-04-05T00:00:00.000Z' });
    render(<CalendarView tasks={[second, elsewhere, first]} initialMonth={new Date(2030, 2, 1)} {...props} />);

    const toggle = phone().getByRole('button', { name: /Upcoming this month/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(phone().queryAllByTestId('agenda-day')).toHaveLength(0);

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(phone().getAllByTestId('agenda-day')).toHaveLength(2);
    const headings = phone().getAllByRole('heading', { level: 4 }).map(heading => heading.textContent);
    expect(headings[0]).toMatch(/Mar 3$/);
    expect(headings[1]).toMatch(/Mar 20$/);
    expect(phone().queryByText('Next month')).not.toBeInTheDocument();

    await userEvent.click(phone().getByRole('button', { name: /^Review/ }));
    expect(props.onEdit).toHaveBeenCalledWith(second);
  });

  it('selects the 1st in other months and offers to add a task on an empty day', async () => {
    const props = handlers();
    render(<CalendarView tasks={[]} initialMonth={new Date(2030, 2, 1)} {...props} />);

    const panel = within(screen.getByTestId('calendar-day-panel'));
    expect(panel.getByRole('heading', { level: 3 }).textContent).toMatch(/Mar 1$/);
    expect(panel.getByText('Nothing due this day.')).toBeInTheDocument();

    await userEvent.click(panel.getByRole('button', { name: 'Add task' }));
    expect(props.onCreate).toHaveBeenLastCalledWith({ deadline: '2030-03-01' });
  });

  it('hides the add action on an empty day without write access', () => {
    render(<CalendarView tasks={[]} canWrite={false} initialMonth={new Date(2030, 2, 1)} {...handlers()} />);
    expect(within(screen.getByTestId('calendar-day-panel')).queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
  });

  it('shows the tasks of the picked day in the week strip as event cards', async () => {
    const props = handlers();
    const kickoff = makeTask({
      title: 'Kickoff',
      project: 'Launch',
      status: 'in-progress',
      startDate: '2030-03-01',
      deadline: '2030-03-03T00:00:00.000Z',
      assignees: [{ _id: 'u1', name: 'Ada Lovelace' }],
    });
    render(<CalendarView tasks={[kickoff]} initialMonth={new Date(2030, 2, 1)} {...props} />);

    expect(weekStrip().getAllByRole('button')).toHaveLength(7);
    expect(weekStrip().getByRole('button', { name: 'Friday, March 1' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    const pill = weekStrip().getByRole('button', { name: 'Sunday, March 3, 1 task' });
    expect(pill).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'true');

    const card = within(screen.getByTestId('calendar-day-panel')).getByRole('button', { name: /^Kickoff/ });
    expect(card).toHaveTextContent('Launch');
    expect(card).toHaveTextContent('Mar 1 → Mar 3');
    expect(card).toHaveTextContent('In Progress');
    expect(card).toHaveTextContent('Assigned to Ada Lovelace');

    await userEvent.click(card);
    expect(props.onEdit).toHaveBeenCalledWith(kickoff);
  });

  it('follows the week strip into the neighbouring month', async () => {
    render(<CalendarView tasks={[]} initialMonth={new Date(2030, 2, 1)} {...handlers()} />);

    // Fri Mar 1 minus one week is Fri Feb 22
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByRole('heading', { name: 'February 2030' })).toBeInTheDocument();
    expect(weekStrip().getByRole('button', { name: 'Friday, February 22' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects today in the day panel and marks it in the upcoming list', async () => {
    const today = makeTask({ title: 'Due now', deadline: `${localDateKey()}T00:00:00.000Z` });
    render(<CalendarView tasks={[today]} {...handlers()} />);

    const panel = within(screen.getByTestId('calendar-day-panel'));
    expect(panel.getByText('Today')).toBeInTheDocument();
    expect(panel.getByRole('button', { name: /^Due now/ })).toBeInTheDocument();
    expect(weekStrip().getByRole('button', { pressed: true })).toHaveAttribute('aria-current', 'date');

    await userEvent.click(phone().getByRole('button', { name: /Upcoming this month/ }));
    const day = phone().getByTestId('agenda-day');
    expect(day).toHaveAttribute('aria-current', 'date');
    expect(within(day).getByText('Today')).toBeInTheDocument();
  });

  it('explains an empty month in the upcoming list', async () => {
    render(<CalendarView tasks={[]} initialMonth={new Date(2026, 9, 1)} {...handlers()} />);
    await userEvent.click(phone().getByRole('button', { name: /Upcoming this month/ }));
    expect(phone().getByText('No tasks due in October 2026.')).toBeInTheDocument();
  });

  it('creates a task due on the clicked day', async () => {
    const props = handlers();
    render(<CalendarView tasks={[]} initialMonth={new Date(2026, 9, 1)} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add task due October 20' }));
    expect(props.onCreate).toHaveBeenCalledWith({ deadline: '2026-10-20' });
  });

  describe('Today', () => {
    const currentHeading = () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const todayCell = () => screen.getByTestId('calendar-grid').querySelector<HTMLElement>(`[data-day-key="${localDateKey()}"]`);

    it('is always enabled, labelled and returns to the current month', async () => {
      render(<CalendarView tasks={[]} initialMonth={new Date(2030, 2, 1)} {...handlers()} />);

      const button = screen.getByRole('button', { name: 'Go to today' });
      expect(button).toBeEnabled();
      await userEvent.click(button);
      expect(screen.getByRole('heading', { name: currentHeading() })).toBeInTheDocument();
    });

    it('selects today, scrolls to it and focuses its cell even when already on the current month', async () => {
      const scrollIntoView = jest.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(<CalendarView tasks={[]} {...handlers()} />);

      // pick another day first, so "Today" has something to undo
      await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
      expect(weekStrip().getByRole('button', { pressed: true })).not.toHaveAttribute('aria-current');

      await userEvent.click(screen.getByRole('button', { name: 'Go to today' }));

      expect(weekStrip().getByRole('button', { pressed: true })).toHaveAttribute('aria-current', 'date');
      expect(todayCell()).toHaveFocus();
      expect(scrollIntoView).toHaveBeenCalled();
      expect(todayCell()?.className).toContain('ring-primary');
    });

    it('works with the "t" shortcut, except while typing', async () => {
      render(
        <>
          <input aria-label="Search" />
          <CalendarView tasks={[]} initialMonth={new Date(2030, 2, 1)} {...handlers()} />
        </>,
      );

      await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 't');
      expect(screen.getByRole('heading', { name: 'March 2030' })).toBeInTheDocument();

      screen.getByRole('textbox', { name: 'Search' }).blur();
      await userEvent.keyboard('t');
      expect(screen.getByRole('heading', { name: currentHeading() })).toBeInTheDocument();
    });
  });
});
