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
  beforeEach(() => {
    window.localStorage.clear();
  });
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
    const pill = weekStrip().getByRole('button', { name: 'Sunday, March 3, 1 in progress' });
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

  describe('state dots', () => {
    const tasks = [
      makeTask({ title: 'Late', status: 'pending', deadline: '2020-03-10T00:00:00.000Z' }),
      makeTask({ title: 'Doing', status: 'in-progress', deadline: '2020-03-10T00:00:00.000Z' }),
      makeTask({ title: 'Doing too', status: 'in-progress', deadline: '2020-03-10T00:00:00.000Z' }),
      makeTask({ title: 'Shipped', status: 'completed', deadline: '2020-03-10T00:00:00.000Z' }),
    ];
    const label = 'Tuesday, March 10, 3 overdue, 1 completed'; // unfinished tasks in the past are overdue

    it('puts the colored dots and a text summary on each week day, hidden from assistive tech', async () => {
      render(<CalendarView tasks={tasks} initialMonth={new Date(2020, 2, 1)} {...handlers()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Next week' }));

      const pill = weekStrip().getByRole('button', { name: label });
      const dots = pill.querySelectorAll('[aria-hidden="true"] > span.rounded-full');
      expect(Array.from(dots).map(dot => dot.className)).toEqual([
        expect.stringContaining('bg-red-600'),
        expect.stringContaining('bg-red-600'),
        expect.stringContaining('bg-red-600'),
      ]);
      expect(pill).toHaveTextContent('+1');
    });

    it('lists the dot colors in a legend', () => {
      render(<CalendarView tasks={[]} initialMonth={new Date(2020, 2, 1)} {...handlers()} />);
      const legend = within(within(screen.getByTestId('calendar-agenda')).getByRole('list', { name: 'Legend' }));
      expect(legend.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Pending', 'In progress', 'Done', 'Overdue']);
    });

    it('colors the event card bar red when the task is overdue', async () => {
      render(<CalendarView tasks={tasks} initialMonth={new Date(2020, 2, 1)} {...handlers()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
      await userEvent.click(weekStrip().getByRole('button', { name: label }));
      const panel = within(screen.getByTestId('calendar-day-panel'));
      expect(panel.getByRole('button', { name: /^Late/ }).querySelector('span[class~="w-1.5"]')?.className).toContain('bg-red-600');
      expect(panel.getByRole('button', { name: /^Shipped/ }).querySelector('span[class~="w-1.5"]')?.className).toContain('bg-emerald-500');
      expect(panel.getByRole('button', { name: /^Late/ })).toHaveTextContent('(overdue)');
    });

    it('adds the dot summary to the desktop day cell', () => {
      render(<CalendarView tasks={tasks} initialMonth={new Date(2020, 2, 1)} {...handlers()} />);
      const cell = screen.getByTestId('calendar-grid').querySelector('[data-day-key="2020-03-10"]') as HTMLElement;
      expect(cell.querySelectorAll('[aria-hidden="true"] > span.rounded-full.bg-red-600')).toHaveLength(3);
      expect(within(cell).getByRole('button', { name: 'Late' })).toBeInTheDocument();
    });
  });

  describe('phone month mode', () => {
    const month = () => within(screen.getByRole('list', { name: 'Month' }));

    it('defaults to the week strip and switches to a compact month grid that is remembered', async () => {
      const { unmount } = render(<CalendarView tasks={[]} initialMonth={new Date(2030, 2, 1)} {...handlers()} />);
      expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked();
      expect(screen.queryByRole('list', { name: 'Month' })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('radio', { name: 'Month' }));
      expect(screen.queryByRole('list', { name: 'Week' })).not.toBeInTheDocument();
      expect(month().getAllByRole('button')).toHaveLength(42);
      expect(window.localStorage.getItem('taskman.calendar.mobileMode')).toBe('month');

      unmount();
      render(<CalendarView tasks={[]} initialMonth={new Date(2030, 2, 1)} {...handlers()} />);
      expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked();
      expect(month().getByRole('button', { name: 'Friday, March 1' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('selects a day on tap and shows its task cards', async () => {
      const task = makeTask({ title: 'Kickoff', status: 'in-progress', deadline: '2030-03-12T00:00:00.000Z' });
      window.localStorage.setItem('taskman.calendar.mobileMode', 'month');
      render(<CalendarView tasks={[task]} initialMonth={new Date(2030, 2, 1)} {...handlers()} />);

      const cell = month().getByRole('button', { name: 'Tuesday, March 12, 1 in progress' });
      await userEvent.click(cell);
      expect(cell).toHaveAttribute('aria-pressed', 'true');
      expect(within(screen.getByTestId('calendar-day-panel')).getByRole('button', { name: /^Kickoff/ })).toBeInTheDocument();
    });

    it('keeps Today working in month mode', async () => {
      window.localStorage.setItem('taskman.calendar.mobileMode', 'month');
      render(<CalendarView tasks={[]} initialMonth={new Date(2030, 2, 1)} {...handlers()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Go to today' }));
      expect(month().getByRole('button', { pressed: true })).toHaveAttribute('aria-current', 'date');
    });
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
