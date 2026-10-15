import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskComments, { type TaskCommentsProps } from '../components/TaskComments';
import type { TaskComment } from '../types';

jest.setTimeout(30000);

const members = [
  { _id: 'u2', name: 'Grace Hopper' },
  { _id: 'u3', name: 'Alan Turing' },
  { _id: 'u1', name: 'Ada Lovelace' },
];

const comment = (overrides: Partial<TaskComment> = {}): TaskComment => ({
  _id: 'c1',
  author: { _id: 'u1', name: 'Ada Lovelace' },
  text: 'Plain comment',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const renderComments = (props: Partial<TaskCommentsProps> = {}) => {
  const onAdd = jest.fn().mockResolvedValue(undefined);
  const view = render(
    <TaskComments
      comments={[]}
      currentUserId="u1"
      canWrite
      members={members}
      onAdd={onAdd}
      onRemove={jest.fn()}
      {...props}
    />,
  );
  return { onAdd, box: screen.getByRole('textbox', { name: 'Add a comment' }), ...view };
};

describe('mention autocomplete', () => {
  it('opens a listbox of teammates when typing @, without the current user', async () => {
    const { box } = renderComments();
    await userEvent.type(box, 'Hi @');

    const list = await screen.findByRole('listbox', { name: 'Mention a teammate' });
    expect(within(list).getAllByRole('option').map(option => option.lastElementChild?.textContent)).toEqual(['Grace Hopper', 'Alan Turing']);
    expect(box).toHaveAttribute('aria-controls', list.id);
  });

  it('filters while typing and inserts @Name with Enter', async () => {
    const { box, onAdd } = renderComments();
    await userEvent.type(box, 'Hi @gr');
    expect(within(await screen.findByRole('listbox')).getAllByRole('option')).toHaveLength(1);

    await userEvent.keyboard('{Enter}');
    expect(box).toHaveValue('Hi @Grace Hopper ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // Enter chose the person, it did not send the comment
    expect(onAdd).not.toHaveBeenCalled();

    await userEvent.type(box, 'please look');
    await userEvent.click(screen.getByRole('button', { name: /^Comment$/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Hi @Grace Hopper please look'));
  });

  it('moves with the arrow keys and exposes the active option', async () => {
    const { box } = renderComments();
    await userEvent.type(box, '@');
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', options[0].id);

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', options[1].id);

    await userEvent.keyboard('{Enter}');
    expect(box).toHaveValue('@Alan Turing ');
  });

  it('closes with Escape and keeps the text', async () => {
    const { box } = renderComments();
    await userEvent.type(box, '@a');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).toHaveValue('@a');
  });

  it('inserts the person that is clicked', async () => {
    const { box } = renderComments();
    await userEvent.type(box, 'cc @al');
    await userEvent.click(await screen.findByRole('option', { name: /Alan Turing/ }));
    expect(box).toHaveValue('cc @Alan Turing ');
    expect(box).toHaveFocus();
  });

  it('does not open for an @ inside an email address', async () => {
    const { box } = renderComments();
    await userEvent.type(box, 'mail me at ada@exa');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('stays closed when there is nobody to suggest', async () => {
    const { box } = renderComments({ members: [] });
    await userEvent.type(box, '@');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('mentions in posted comments', () => {
  it('highlights @Name without changing the surrounding text', () => {
    renderComments({ comments: [comment({ text: 'Thanks @Grace Hopper, and @alan too' })] });
    const section = within(screen.getByRole('region', { name: 'Comments' }));

    const highlighted = section.getAllByText(/^@/);
    expect(highlighted.map(node => node.textContent)).toEqual(['@Grace Hopper', '@alan']);
    expect(section.getByText(/Thanks/).closest('p')).toHaveTextContent('Thanks @Grace Hopper, and @alan too');
  });

  it('leaves comments without mentions as plain text', () => {
    renderComments({ comments: [comment()] });
    expect(screen.getByText('Plain comment')).toBeInTheDocument();
  });
});
