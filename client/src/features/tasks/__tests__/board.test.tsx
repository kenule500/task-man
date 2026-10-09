import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BoardView from '../views/BoardView';
import type { TaskViewProps } from '../views/types';
import { makeTask } from './fixtures';

jest.setTimeout(30000);

const handlers = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
});

// The status tabs only show below lg, but jsdom applies no CSS so they are always in the DOM.
describe('BoardView status tabs', () => {
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  afterEach(() => {
    HTMLElement.prototype.scrollTo = originalScrollTo;
  });

  const tabs = () => within(screen.getByRole('tablist', { name: 'Task status' }));

  it('shows a sticky tab per status with its count, Pending first', () => {
    render(
      <BoardView
        tasks={[makeTask({ status: 'pending' }), makeTask({ status: 'pending' }), makeTask({ status: 'completed' })]}
        {...handlers()}
      />,
    );

    const all = tabs().getAllByRole('tab');
    expect(all.map(tab => tab.textContent)).toEqual(['Pending2 tasks', 'In Progress0 tasks', 'Completed1 tasks']);
    expect(all.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(screen.getByTestId('board-tabs').className).toContain('sticky');
    expect(screen.getByTestId('board-tabs').className).toContain('lg:hidden');
  });

  it('scrolls the column into view when a tab is tapped', async () => {
    const scrollTo = jest.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    render(<BoardView tasks={[]} {...handlers()} />);

    await userEvent.click(tabs().getByRole('tab', { name: /^In Progress/ }));
    expect(tabs().getByRole('tab', { name: /^In Progress/ })).toHaveAttribute('aria-selected', 'true');
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
  });

  it('moves between tabs with the arrow keys', async () => {
    HTMLElement.prototype.scrollTo = jest.fn();
    render(<BoardView tasks={[]} {...handlers()} />);

    tabs().getByRole('tab', { name: /^Pending/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs().getByRole('tab', { name: /^In Progress/ })).toHaveFocus();
    expect(tabs().getByRole('tab', { name: /^In Progress/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{End}');
    expect(tabs().getByRole('tab', { name: /^Completed/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('activates the tab of the column that is scrolled into view', () => {
    render(<BoardView tasks={[]} {...handlers()} />);
    const lefts = { Pending: -340, 'In Progress': 8, Completed: 360 };
    for (const [label, left] of Object.entries(lefts)) {
      screen.getByRole('region', { name: `${label} column` }).getBoundingClientRect = () => ({ left }) as DOMRect;
    }

    fireEvent.scroll(screen.getByTestId('board-columns'));
    expect(tabs().getByRole('tab', { name: /^In Progress/ })).toHaveAttribute('aria-selected', 'true');
  });
});

const column = (label: string) => within(screen.getByRole('region', { name: `${label} column` }));

describe('BoardView moving tasks', () => {
  it('shows a labelled quick action with the next state on every card', async () => {
    const onUpdate = jest.fn().mockResolvedValue(null);
    const tasks = [
      makeTask({ title: 'A', status: 'pending' }),
      makeTask({ title: 'B', status: 'in-progress', position: 50 }),
      makeTask({ title: 'C', status: 'completed' }),
    ];
    render(<BoardView tasks={tasks} {...handlers()} onUpdate={onUpdate} />);

    const start = screen.getByRole('button', { name: 'Start A: move to In Progress' });
    expect(start).toHaveTextContent('Start');
    expect(start.className).toContain('md:hidden');
    expect(screen.getByRole('button', { name: 'Done B: move to Completed' })).toHaveTextContent('Done');
    expect(screen.getByRole('button', { name: 'Reopen C: move to Pending' })).toHaveTextContent('Reopen');

    await userEvent.click(start);
    expect(onUpdate).toHaveBeenCalledWith(tasks[0]._id, { status: 'in-progress', position: 1074 });
    expect(screen.getByRole('status')).toHaveTextContent('Moved to In Progress');
  });

  it('moves a task from the three-dot menu radio group', async () => {
    const onUpdate = jest.fn().mockResolvedValue(null);
    const task = makeTask({ title: 'Menu card', status: 'pending' });
    render(<BoardView tasks={[task]} {...handlers()} onUpdate={onUpdate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Menu card' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Completed' }));
    expect(onUpdate).toHaveBeenCalledWith(task._id, expect.objectContaining({ status: 'completed' }));
    expect(screen.getByRole('status')).toHaveTextContent('Moved to Completed');
  });

  it('opens the move sheet from the menu and moves from it', async () => {
    const onUpdate = jest.fn().mockResolvedValue(null);
    const task = makeTask({ title: 'Sheet card', status: 'pending' });
    render(<BoardView tasks={[task]} {...handlers()} onUpdate={onUpdate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Sheet card' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /move to…/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^In Progress/ }));
    expect(onUpdate).toHaveBeenCalledWith(task._id, expect.objectContaining({ status: 'in-progress' }));
  });

  describe('long press', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const press = (card: HTMLElement, init: PointerEventInit = {}) =>
      fireEvent.pointerDown(card, { pointerType: 'touch', clientX: 10, clientY: 10, ...init });

    it('opens the move sheet after 500 ms', () => {
      render(<BoardView tasks={[makeTask({ title: 'Held' })]} {...handlers()} />);
      const card = screen.getByRole('article');

      press(card);
      act(() => { jest.advanceTimersByTime(499); });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      act(() => { jest.advanceTimersByTime(2); });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('cancels when the finger moves or lifts early', () => {
      render(<BoardView tasks={[makeTask({ title: 'Moved' })]} {...handlers()} />);
      const card = screen.getByRole('article');

      press(card);
      fireEvent.pointerMove(card, { pointerType: 'touch', clientX: 40, clientY: 10 });
      act(() => { jest.advanceTimersByTime(600); });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      press(card);
      fireEvent.pointerUp(card, { pointerType: 'touch' });
      act(() => { jest.advanceTimersByTime(600); });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ignores the mouse', () => {
      render(<BoardView tasks={[makeTask()]} {...handlers()} />);
      press(screen.getByRole('article'), { pointerType: 'mouse' });
      act(() => { jest.advanceTimersByTime(600); });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('has no move controls without write access', async () => {
    render(<BoardView tasks={[makeTask({ title: 'Locked' })]} {...handlers()} canWrite={false} canDelete={false} onOpen={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /move to/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Locked' }));
    expect(await screen.findByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /move to…/i })).not.toBeInTheDocument();
  });
});

describe('BoardView pagination', () => {
  const many = (count: number, status: 'pending' | 'completed' = 'pending') =>
    Array.from({ length: count }, (_, index) => makeTask({ title: `${status}-${index + 1}`, status, position: index + 1 }));

  it('shows the first 10 cards per column with a counter and Show more', async () => {
    render(<BoardView tasks={many(23)} {...handlers()} />);

    expect(column('Pending').getAllByRole('article')).toHaveLength(10);
    expect(column('Pending').getByText('Showing 10 of 23')).toBeInTheDocument();
    expect(column('Completed').queryByText(/Showing/)).not.toBeInTheDocument();

    await userEvent.click(column('Pending').getByRole('button', { name: 'Show 10 more Pending tasks' }));
    expect(column('Pending').getAllByRole('article')).toHaveLength(20);
    expect(column('Pending').getByText('Showing 20 of 23')).toBeInTheDocument();
    expect(column('Pending').getByRole('button', { name: 'Show 3 more Pending tasks' })).toBeInTheDocument();
    expect(column('Pending').queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();

    await userEvent.click(column('Pending').getByRole('button', { name: 'Show 3 more Pending tasks' }));
    expect(column('Pending').getAllByRole('article')).toHaveLength(23);
    expect(column('Pending').queryByRole('button', { name: /show .* more/i })).not.toBeInTheDocument();
  });

  it('moves focus to the first newly shown card', async () => {
    render(<BoardView tasks={many(15)} {...handlers()} />);
    await userEvent.click(column('Pending').getByRole('button', { name: 'Show 5 more Pending tasks' }));
    expect(column('Pending').getByRole('button', { name: 'pending-11' })).toHaveFocus();
  });

  it('offers Show all when more than a page remains', async () => {
    render(<BoardView tasks={many(34)} {...handlers()} />);
    await userEvent.click(column('Pending').getByRole('button', { name: 'Show all 34 Pending tasks' }));
    expect(column('Pending').getAllByRole('article')).toHaveLength(34);
    expect(column('Pending').getByRole('button', { name: 'pending-11' })).toHaveFocus();
  });

  it('resets to the first page when the task set changes', async () => {
    const tasks = many(23);
    const { rerender } = render(<BoardView tasks={tasks} {...handlers()} />);
    await userEvent.click(column('Pending').getByRole('button', { name: 'Show all 23 Pending tasks' }));
    expect(column('Pending').getAllByRole('article')).toHaveLength(23);

    rerender(<BoardView tasks={tasks.slice(0, 15)} {...handlers()} />);
    expect(column('Pending').getAllByRole('article')).toHaveLength(10);
  });

  it('keeps the expanded page when a task only changes status', async () => {
    const tasks = many(23);
    const { rerender } = render(<BoardView tasks={tasks} {...handlers()} />);
    await userEvent.click(column('Pending').getByRole('button', { name: 'Show all 23 Pending tasks' }));

    rerender(<BoardView tasks={[{ ...tasks[0], status: 'completed' }, ...tasks.slice(1)]} {...handlers()} />);
    expect(column('Pending').getAllByRole('article')).toHaveLength(22);
  });

  it('still drops a dragged card into a paginated column', () => {
    const onUpdate = jest.fn().mockResolvedValue(null);
    const dragged = makeTask({ title: 'Drag me', status: 'completed', position: 1 });
    render(<BoardView tasks={[...many(23), dragged]} {...handlers()} onUpdate={onUpdate} />);

    const section = screen.getByRole('region', { name: 'Pending column' });
    fireEvent.drop(section, { dataTransfer: { getData: () => dragged._id } });
    expect(onUpdate).toHaveBeenCalledWith(dragged._id, expect.objectContaining({ status: 'pending' }));
  });
});
