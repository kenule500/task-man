import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageItem from '../components/MessageItem';
import type { ChatMessage } from '../types';

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  _id: 'm1',
  channel: 'c1',
  author: { _id: 'u1', name: 'Ada' },
  body: 'hello there',
  mentions: [],
  attachments: [],
  replyCount: 0,
  createdAt: '2026-10-02T10:00:00.000Z',
  ...overrides,
});

const renderItem = (overrides: Partial<React.ComponentProps<typeof MessageItem>> = {}) => {
  const props = {
    message: message(),
    reactions: [],
    currentUserId: 'u1',
    memberNames: [],
    canWrite: true,
    canModerate: false,
    onToggleReaction: jest.fn(),
    onReply: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onPin: jest.fn(),
    attachmentHref: (id: string) => `/files/${id}`,
    ...overrides,
  };
  const view = render(<MessageItem {...props} />);
  return { ...props, view };
};

describe('MessageItem', () => {
  it('AC-048: own messages align right without an avatar, others align left', () => {
    const { view } = renderItem();
    expect(view.container.querySelector('li')).toHaveClass('justify-end');
    expect(view.container.querySelector('img')).toBeNull();

    view.unmount();
    const other = renderItem({ message: message({ author: { _id: 'u2', name: 'Grace' } }) });
    expect(other.view.container.querySelector('li')).toHaveClass('justify-start');
    expect(other.view.container.querySelector('img')).toBeNull();
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('AC-052: highlights a mention that matches a known member', () => {
    renderItem({ message: message({ body: 'hi @Ada, look' }), memberNames: ['Ada'] });

    const highlighted = screen.getByText('@Ada');
    expect(highlighted.tagName).toBe('SPAN');
    expect(highlighted.className).toContain('bg-primary/15');
  });

  it('AC-018: offers edit only on your own message', () => {
    const { view } = renderItem();
    expect(screen.getByRole('button', { name: 'Edit message' })).toBeInTheDocument();
    view.unmount();

    renderItem({ message: message({ author: { _id: 'u2', name: 'Grace' } }), currentUserId: 'u1' });
    expect(screen.queryByRole('button', { name: 'Edit message' })).not.toBeInTheDocument();
  });

  it('AC-019: offers delete to the author and to a moderator', () => {
    const { view } = renderItem();
    expect(screen.getByRole('button', { name: 'Delete message' })).toBeInTheDocument();
    view.unmount();

    renderItem({ message: message({ author: { _id: 'u2', name: 'Grace' } }), currentUserId: 'u1', canModerate: true });
    expect(screen.getByRole('button', { name: 'Delete message' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit message' })).not.toBeInTheDocument();
  });

  it('AC-012: shows the reply count and opens the thread', async () => {
    const props = renderItem({ message: message({ replyCount: 2 }) });
    const replies = screen.getByRole('button', { name: '2 replies' });

    await userEvent.click(replies);
    expect(props.onReply).toHaveBeenCalledTimes(1);
  });

  it('AC-019: renders a tombstone instead of content for a deleted message', () => {
    renderItem({ message: message({ deletedAt: '2026-10-02T11:00:00.000Z' }) });

    expect(screen.getByText('This message was deleted')).toBeInTheDocument();
    expect(screen.queryByText('hello there')).not.toBeInTheDocument();
  });

  it('AC-018: edits through the composer form', async () => {
    const props = renderItem();
    await userEvent.click(screen.getByRole('button', { name: 'Edit message' }));

    const field = screen.getByRole('textbox', { name: 'Edit message' });
    await userEvent.clear(field);
    await userEvent.type(field, 'hello again');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ _id: 'm1' }), 'hello again');
  });
});
