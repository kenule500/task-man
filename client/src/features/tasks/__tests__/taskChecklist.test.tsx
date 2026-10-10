import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskChecklist from '../components/TaskChecklist';
import { ChecklistBadge, RepeatBadge } from '../components/TaskBadges';
import type { ChecklistItem } from '../types';

jest.setTimeout(30000);

const items: ChecklistItem[] = [
  { _id: 'a', text: 'Draft', done: true },
  { _id: 'b', text: 'Review', done: false },
  { _id: 'c', text: 'Ship', done: false },
];

const setup = (props: Partial<ComponentProps<typeof TaskChecklist>> = {}) => {
  const onChange = jest.fn().mockResolvedValue(undefined);
  const view = render(<TaskChecklist items={items} canWrite onChange={onChange} {...props} />);
  return { ...view, onChange };
};

describe('TaskChecklist', () => {
  it('shows the progress and one checkbox per item', () => {
    setup();
    const section = screen.getByRole('region', { name: 'Checklist' });
    expect(within(section).getByText('1/3')).toBeInTheDocument();
    expect(within(section).getByText('1 of 3 checklist items done')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'Mark "Draft" as not done' })).toBeChecked();
  });

  it('ticks an item', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Review" as done' }));
    expect(onChange).toHaveBeenCalledWith([items[0], { ...items[1], done: true }, items[2]]);
  });

  it('adds a trimmed item with Enter and clears the input', async () => {
    const { onChange } = setup();
    const input = screen.getByRole('textbox', { name: 'Add checklist item' });
    await userEvent.type(input, '  Celebrate {Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ChecklistItem[];
    expect(next).toHaveLength(4);
    expect(next[3]).toMatchObject({ text: 'Celebrate', done: false });
    expect(next[3]._id).toMatch(/^[0-9a-f]{24}$/);
    expect(input).toHaveValue('');
  });

  it('does not add an empty item', async () => {
    const { onChange } = setup();
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add checklist item' }), '   {Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renames an item inline: Enter saves, Escape cancels', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    const input = screen.getByRole('textbox', { name: 'Rename checklist item "Review"' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Peer review{Enter}');
    expect(onChange).toHaveBeenCalledWith([items[0], { ...items[1], text: 'Peer review' }, items[2]]);

    onChange.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Ship' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Rename checklist item "Ship"' }), ' now{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ship' })).toBeInTheDocument();
  });

  it('deletes an item', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Delete checklist item "Review"' }));
    expect(onChange).toHaveBeenCalledWith([items[0], items[2]]);
  });

  it('reorders with the up and down buttons, which stop at the ends', async () => {
    const { onChange } = setup();
    expect(screen.getByRole('button', { name: 'Move "Draft" up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move "Ship" down' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Move "Review" up' }));
    expect(onChange).toHaveBeenLastCalledWith([items[1], items[0], items[2]]);
    await userEvent.click(screen.getByRole('button', { name: 'Move "Review" down' }));
    expect(onChange).toHaveBeenLastCalledWith([items[0], items[2], items[1]]);
  });

  it('is keyboard operable', async () => {
    const { onChange } = setup();
    screen.getByRole('button', { name: 'Move "Draft" down' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith([items[1], items[0], items[2]]);
  });

  it('is read-only without write access, and hidden when empty', () => {
    const { rerender } = setup({ canWrite: false });
    expect(screen.getAllByRole('checkbox').every(box => box.hasAttribute('data-disabled') || box.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete checklist item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();

    rerender(<TaskChecklist items={[]} canWrite={false} onChange={jest.fn()} />);
    expect(screen.queryByRole('region', { name: 'Checklist' })).not.toBeInTheDocument();
  });

  it('invites the first item on an empty list and stops at 50', () => {
    const { rerender } = setup({ items: [] });
    expect(screen.getByText('No checklist items yet.')).toBeInTheDocument();
    const full = Array.from({ length: 50 }, (_, i) => ({ _id: `i${i}`, text: `Item ${i}`, done: false }));
    rerender(<TaskChecklist items={full} canWrite onChange={jest.fn()} />);
    expect(screen.queryByRole('textbox', { name: 'Add checklist item' })).not.toBeInTheDocument();
    expect(screen.getByText(/at most 50 items/i)).toBeInTheDocument();
  });
});

describe('task meta badges', () => {
  it('shows the checklist progress only for a non-empty checklist', () => {
    const { container, rerender } = render(<ChecklistBadge items={items} />);
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 checklist items done')).toBeInTheDocument();
    rerender(<ChecklistBadge items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the repeat icon only when the task repeats', () => {
    const { container, rerender } = render(<RepeatBadge recurrence={{ every: 2, unit: 'week', basis: 'due' }} />);
    expect(screen.getByText('Repeats every 2 weeks')).toBeInTheDocument();
    expect(container.querySelector('[title="Every 2 weeks, from due date"]')).not.toBeNull();
    rerender(<RepeatBadge recurrence={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
