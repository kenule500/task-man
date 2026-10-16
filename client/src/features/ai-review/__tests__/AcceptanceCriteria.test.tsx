import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcceptanceCriteria from '../components/AcceptanceCriteria';
import { MAX_CRITERIA } from '../lib/criteria';

jest.setTimeout(30000);

const items = [
  { _id: 'a', text: 'Sign in works' },
  { _id: 'b', text: 'Wrong password shows an error' },
  { _id: 'c', text: 'Locks after five tries' },
];

const setup = (props: Partial<ComponentProps<typeof AcceptanceCriteria>> = {}) => {
  const onChange = jest.fn().mockResolvedValue(undefined);
  const view = render(<AcceptanceCriteria items={items} canWrite onChange={onChange} {...props} />);
  return { ...view, onChange };
};

describe('AcceptanceCriteria', () => {
  it('lists the criteria in order with a count', () => {
    setup();
    const section = screen.getByRole('region', { name: 'Acceptance criteria' });
    expect(section).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('adds a trimmed criterion with Enter and clears the input', async () => {
    const { onChange } = setup();
    const input = screen.getByRole('textbox', { name: 'Add an acceptance criterion' });
    await userEvent.type(input, '  Password is hashed  {Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(4);
    expect(next[3].text).toBe('Password is hashed');
    expect(next[3]._id).toMatch(/^[a-f0-9]{24}$/);
    expect(input).toHaveValue('');
  });

  it('does not add an empty criterion', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('renames on click and Enter, and keeps the old text on Escape', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in works' }));
    const edit = screen.getByRole('textbox', { name: 'Edit criterion: Sign in works' });
    await userEvent.clear(edit);
    await userEvent.type(edit, 'Sign in works with SSO{Enter}');
    expect(onChange).toHaveBeenCalledWith([{ _id: 'a', text: 'Sign in works with SSO' }, items[1], items[2]]);

    onChange.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Locks after five tries' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Edit criterion: Locks after five tries' }), ' extra{Escape}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('moves and deletes rows', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Move criterion up: Wrong password shows an error' }));
    expect(onChange).toHaveBeenLastCalledWith([items[1], items[0], items[2]]);
    await userEvent.click(screen.getByRole('button', { name: 'Move criterion down: Sign in works' }));
    expect(onChange).toHaveBeenLastCalledWith([items[1], items[0], items[2]]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete criterion: Locks after five tries' }));
    expect(onChange).toHaveBeenLastCalledWith([items[0], items[1]]);
    expect(screen.getByRole('button', { name: 'Move criterion up: Sign in works' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move criterion down: Locks after five tries' })).toBeDisabled();
  });

  it('is read-only without write access and hidden when empty', () => {
    const { unmount } = setup({ canWrite: false });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Sign in works')).toBeInTheDocument();
    unmount();
    const { container } = setup({ canWrite: false, items: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('explains that an empty list is what the review reads', () => {
    setup({ items: [] });
    expect(screen.getByText(/tell the AI code review what the pull request must do/)).toBeInTheDocument();
  });

  it('stops adding at the limit', () => {
    const full = Array.from({ length: MAX_CRITERIA }, (_, index) => ({ _id: String(index), text: `Criterion ${index}` }));
    setup({ items: full });
    expect(screen.queryByRole('textbox', { name: 'Add an acceptance criterion' })).toBeNull();
    expect(screen.getByText(`A task can have at most ${MAX_CRITERIA} acceptance criteria.`)).toBeInTheDocument();
  });
});
