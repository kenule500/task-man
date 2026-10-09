import { fireEvent, render, screen, within } from '@testing-library/react';
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
