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

/** jsdom has no matchMedia: `phone` = below md, `reduced` = prefers-reduced-motion. */
const mockViewport = ({ phone = false, reduced = false } = {}) => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduced : query.includes('min-width') ? !phone : false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
};

const touch = (clientX: number, clientY: number) => ({ clientX, clientY });
const swipe = (from: [number, number], to: [number, number]) => {
  const board = screen.getByTestId('board-columns');
  fireEvent.touchStart(board, { touches: [touch(...from)] });
  fireEvent.touchEnd(board, { changedTouches: [touch(...to)] });
};

// The phone layout is CSS (max-md:hidden, md:hidden), which jsdom does not apply: every column stays in the DOM.
describe('BoardView status switcher (phones)', () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const tabs = () => within(screen.getByRole('tablist', { name: 'Task status' }));
  const tab = (name: RegExp) => tabs().getByRole('tab', { name });
  const section = (label: string) => screen.getByRole('region', { name: `${label} column` });

  it('shows a sticky segmented tab per status with its count, Pending first, below md only', () => {
    render(
      <BoardView
        tasks={[makeTask({ status: 'pending' }), makeTask({ status: 'pending' }), makeTask({ status: 'completed' })]}
        {...handlers()}
      />,
    );

    const all = tabs().getAllByRole('tab');
    expect(all.map(item => item.textContent)).toEqual(['Pending2 tasks', 'In Progress0 tasks', 'Completed1 tasks']);
    expect(all.map(item => item.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(screen.getByTestId('board-tabs').className).toContain('sticky');
    expect(screen.getByTestId('board-tabs').className).toContain('md:hidden');
    all.forEach(item => expect(item.className).toContain('min-h-11'));
  });

  it('shows one column at a time on phones: the others are hidden below md', async () => {
    render(<BoardView tasks={[]} {...handlers()} />);
    expect(section('Pending').className).not.toContain('max-md:hidden');
    expect(section('In Progress').className).toContain('max-md:hidden');
    expect(section('Completed').className).toContain('max-md:hidden');

    await userEvent.click(tab(/^In Progress/));
    expect(tab(/^In Progress/)).toHaveAttribute('aria-selected', 'true');
    expect(section('In Progress').className).not.toContain('max-md:hidden');
    expect(section('Pending').className).toContain('max-md:hidden');
    // no horizontal scroller any more
    expect(screen.getByTestId('board-columns').className).not.toContain('overflow-x');
  });

  it('reads and writes the selected column through the page controls (the URL)', async () => {
    const setColumn = jest.fn();
    render(<BoardView tasks={[]} {...handlers()} controls={{ column: 'in-progress', setColumn }} />);
    expect(tab(/^In Progress/)).toHaveAttribute('aria-selected', 'true');
    expect(section('Pending').className).toContain('max-md:hidden');

    await userEvent.click(tab(/^Completed/));
    expect(setColumn).toHaveBeenCalledWith('completed');
  });

  it('moves between tabs with the arrow keys, Home and End', async () => {
    render(<BoardView tasks={[]} {...handlers()} />);

    tab(/^Pending/).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tab(/^In Progress/)).toHaveFocus();
    expect(tab(/^In Progress/)).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{End}');
    expect(tab(/^Completed/)).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(tab(/^Pending/)).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab(/^Completed/)).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(tab(/^Pending/)).toHaveAttribute('aria-selected', 'true');
  });

  describe('swipe', () => {
    beforeEach(() => mockViewport({ phone: true }));

    it('switches to the next column on a left swipe and back on a right swipe', () => {
      render(<BoardView tasks={[]} {...handlers()} />);

      swipe([240, 300], [120, 310]);
      expect(tab(/^In Progress/)).toHaveAttribute('aria-selected', 'true');
      swipe([240, 300], [120, 300]);
      expect(tab(/^Completed/)).toHaveAttribute('aria-selected', 'true');
      swipe([240, 300], [120, 300]);
      expect(tab(/^Completed/)).toHaveAttribute('aria-selected', 'true');
      swipe([100, 300], [220, 300]);
      expect(tab(/^In Progress/)).toHaveAttribute('aria-selected', 'true');
    });

    it('ignores short swipes and vertical scrolls', () => {
      render(<BoardView tasks={[]} {...handlers()} />);

      swipe([200, 300], [160, 300]);
      swipe([200, 300], [100, 520]);
      expect(tab(/^Pending/)).toHaveAttribute('aria-selected', 'true');
    });

    it('ignores multi-finger gestures', () => {
      render(<BoardView tasks={[]} {...handlers()} />);
      const board = screen.getByTestId('board-columns');
      fireEvent.touchStart(board, { touches: [touch(240, 300), touch(260, 300)] });
      fireEvent.touchEnd(board, { changedTouches: [touch(100, 300)] });
      expect(tab(/^Pending/)).toHaveAttribute('aria-selected', 'true');
    });

    it('does nothing from the md breakpoint up, where all columns are visible', () => {
      mockViewport({ phone: false });
      render(<BoardView tasks={[]} {...handlers()} />);
      swipe([240, 300], [100, 300]);
      expect(tab(/^Pending/)).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('slide transition', () => {
    const animate = jest.fn();
    beforeEach(() => {
      animate.mockClear();
      Element.prototype.animate = animate;
    });
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    it('plays a short slide and fade on the incoming column', async () => {
      mockViewport({ phone: true });
      render(<BoardView tasks={[]} {...handlers()} />);
      await userEvent.click(tab(/^In Progress/));

      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.calls[0][1]).toEqual(expect.objectContaining({ duration: 150 }));
      expect(animate.mock.contexts[0]).toBe(section('In Progress'));
    });

    it('skips it for prefers-reduced-motion', async () => {
      mockViewport({ phone: true, reduced: true });
      render(<BoardView tasks={[]} {...handlers()} />);
      await userEvent.click(tab(/^In Progress/));
      expect(animate).not.toHaveBeenCalled();
    });
  });

  it('offers a "Moved to ... · View" chip that switches to the column the card went to', async () => {
    const onUpdate = jest.fn().mockResolvedValue(null);
    render(<BoardView tasks={[makeTask({ title: 'Card', status: 'pending' })]} {...handlers()} onUpdate={onUpdate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start Card: move to In Progress' }));
    expect(screen.getByRole('status')).toHaveTextContent('Moved to In Progress');
    expect(tab(/^Pending/)).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'View In Progress' }));
    expect(tab(/^In Progress/)).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('status')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('disables native drag and drop on phones', () => {
    mockViewport({ phone: true });
    render(<BoardView tasks={[makeTask()]} {...handlers()} />);
    expect(screen.getByRole('article')).toHaveAttribute('draggable', 'false');
  });
});

describe('BoardView cards', () => {
  it('shows priority as an icon with a screen reader label, no thick top border', () => {
    render(<BoardView tasks={[makeTask({ title: 'Urgent', priority: 'high' })]} {...handlers()} />);
    const card = screen.getByRole('article');
    expect(card.className).not.toMatch(/border-t-\[3px\]|border-t-danger|border-t-warning|border-t-success|border-t-amber/);
    const priority = within(card).getByTitle('High priority');
    expect(priority.className).toContain('text-danger-fg');
    expect(priority.querySelector('svg')).toBeInTheDocument();
    expect(within(card).getByText('High')).toHaveClass('sr-only');
  });

  it('mutes completed cards without dropping below AA', () => {
    render(<BoardView tasks={[makeTask({ title: 'Shipped', status: 'completed' })]} {...handlers()} />);
    const title = screen.getByRole('button', { name: 'Shipped' });
    expect(title.className).toContain('line-through');
    expect(title.className).toContain('text-slate-500');
    expect(screen.getByRole('article').className).not.toMatch(/opacity-/);
  });

  it('marks overdue dates in danger-fg for unfinished tasks only', () => {
    const { rerender } = render(<BoardView tasks={[makeTask({ deadline: '2000-01-01' })]} {...handlers()} />);
    expect(screen.getByText('(overdue)').parentElement).toHaveClass('text-danger-fg');

    rerender(<BoardView tasks={[makeTask({ deadline: '2000-01-01', status: 'completed' })]} {...handlers()} />);
    expect(screen.queryByText('(overdue)')).not.toBeInTheDocument();
  });

  it('shows the type icon for non-plain tasks only', () => {
    render(<BoardView tasks={[makeTask({ title: 'Bug card', type: 'bug' }), makeTask({ title: 'Plain', type: 'task' })]} {...handlers()} />);
    expect(screen.getAllByRole('img', { name: 'Bug' })).toHaveLength(1);
    expect(screen.queryByRole('img', { name: 'Task' })).not.toBeInTheDocument();
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
