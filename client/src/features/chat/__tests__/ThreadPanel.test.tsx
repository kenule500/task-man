import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreadPanel from '../components/ThreadPanel';
import type { ChatMessage } from '../types';

const parent: ChatMessage = {
  _id: 'parent-1',
  channel: 'c1',
  author: { _id: 'u1', name: 'Ada' },
  body: 'Should we deploy today?',
  mentions: [],
  attachments: [],
  replyCount: 1,
  createdAt: '2026-10-02T10:00:00.000Z',
};

const reply = (id: string, body: string, deleted = false): ChatMessage => ({
  _id: id,
  channel: 'c1',
  author: { _id: 'u2', name: 'Grace' },
  body,
  parent: 'parent-1',
  mentions: [],
  attachments: [],
  replyCount: 0,
  deletedAt: deleted ? '2026-10-02T11:00:00.000Z' : null,
  createdAt: '2026-10-02T10:30:00.000Z',
});

const renderThread = (overrides: Partial<React.ComponentProps<typeof ThreadPanel>> = {}) => {
  const props = {
    parent,
    replies: [reply('r1', 'Yes, after standup')],
    reactions: {},
    members: [],
    currentUserId: 'u1',
    canWrite: true,
    loading: false,
    onClose: jest.fn(),
    onSend: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ThreadPanel {...props} />);
  return props;
};

describe('ThreadPanel', () => {
  it('AC-013: lists the replies beside the conversation without navigating', () => {
    renderThread();

    expect(screen.getByRole('complementary', { name: 'Thread' })).toBeInTheDocument();
    expect(screen.getByText('Should we deploy today?')).toBeInTheDocument();
    expect(screen.getByText('Yes, after standup')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('AC-013: sends a reply with its parent and clears the field', async () => {
    const props = renderThread();
    const field = screen.getByRole('textbox', { name: 'Reply in thread' });

    await userEvent.type(field, 'Works for me');
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(props.onSend).toHaveBeenCalledWith('Works for me', {
      parentId: 'parent-1',
      mentionIds: [],
      attachmentIds: [],
    });
    expect(field).toHaveValue('');
  });

  it('AC-013: refuses an empty reply', async () => {
    const props = renderThread();
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('AC-013: shows a tombstone for a deleted reply and hides the composer when read-only', () => {
    renderThread({ replies: [reply('r2', 'gone', true)], canWrite: false });

    expect(screen.getByText('This message was deleted')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Reply in thread' })).not.toBeInTheDocument();
  });

  it('AC-013: reports loading and the empty state', () => {
    const { unmount } = render(<ThreadPanel parent={parent} replies={[]} reactions={{}} members={[]} currentUserId="u1" canWrite loading onClose={jest.fn()} onSend={jest.fn()} />);
    expect(screen.getByText('Loading replies…')).toBeInTheDocument();
    unmount();

    render(<ThreadPanel parent={parent} replies={[]} reactions={{}} members={[]} currentUserId="u1" canWrite={false} loading={false} onClose={jest.fn()} onSend={jest.fn()} />);
    expect(screen.getByText('No replies yet. Start the thread below.')).toBeInTheDocument();
  });
});
