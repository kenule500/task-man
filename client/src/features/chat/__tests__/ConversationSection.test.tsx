import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConversationSection from '../components/ConversationSection';
import type { ConversationCard } from '../types';

const card = (overrides: Partial<ConversationCard> & { _id: string }): ConversationCard => ({
  name: overrides._id,
  project: null,
  avatarUrl: null,
  archived: false,
  lastMessage: null,
  unread: false,
  unreadCount: 0,
  ...overrides,
});

const renderSection = (items: ConversationCard[], overrides: Partial<React.ComponentProps<typeof ConversationSection>> = {}) => {
  const props = {
    title: 'Direct messages',
    items,
    currentChannelId: 'c1',
    loading: false,
    loadingCopy: 'Loading direct messages…',
    emptyCopy: 'No direct messages yet.',
    footer: 'Only you and the other person can read a direct message',
    onSelect: jest.fn(),
    onOpenSettings: jest.fn(),
    ...overrides,
  };
  render(<ConversationSection {...props} />);
  return props;
};

describe('ConversationSection', () => {
  it('AC-057: shows the preview, the archived marker and the active row', () => {
    renderSection([
      card({
        _id: 'c1',
        name: 'Ada Lovelace',
        archived: true,
        lastMessage: { body: 'ship it', at: '2026-10-02T10:00:00.000Z', authorName: 'Ada' },
      }),
    ]);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Ada: ship it')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ada Lovelace/ })).toHaveAttribute('aria-current', 'page');
  });

  it('AC-057: says when a conversation has no messages yet', () => {
    renderSection([card({ _id: 'c2', name: 'Grace' })], { currentChannelId: undefined });
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('AC-058: the row is a shared, keyboard-reachable button wired to onSelect', async () => {
    const props = renderSection([card({ _id: 'c2', name: 'Grace' })]);
    const row = screen.getByRole('button', { name: /Grace/ });

    expect(row).toHaveClass('min-h-11');
    await userEvent.click(row);
    expect(props.onSelect).toHaveBeenCalledWith('c2');
  });

  it('AC-058: only team sections offer the settings affordance', () => {
    const { unmount } = render(
      <ConversationSection
        title="Team channels"
        items={[card({ _id: 'c3', name: 'Project One' })]}
        currentChannelId="c3"
        loading={false}
        loadingCopy="Loading"
        emptyCopy="Empty"
        footer="Members only"
        canManage
        onSelect={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Project One/ }));
    expect(screen.getByRole('button', { name: 'Settings for Project One' })).toBeInTheDocument();
    unmount();

    renderSection([card({ _id: 'c4', name: 'Grace' })]);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Grace/ }));
    expect(screen.queryByRole('button', { name: /Settings for/ })).not.toBeInTheDocument();
  });

  it('AC-064: renders the unread count, capped at 9+', () => {
    renderSection([
      card({ _id: 'c5', name: 'Many', unread: true, unreadCount: 12 }),
      card({ _id: 'c6', name: 'Few', unread: true, unreadCount: 3 }),
    ], { currentChannelId: 'c1' });

    expect(screen.getByText('9+')).toBeInTheDocument();
    expect(screen.getByText('12 unread messages')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('3 unread messages')).toBeInTheDocument();
  });

  it('AC-064: does not badge the conversation that is open', () => {
    renderSection([card({ _id: 'c1', name: 'Open', unread: true, unreadCount: 4 })]);
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('AC-059: shows loading and empty copy instead of disappearing', () => {
    const { unmount } = render(
      <ConversationSection
        title="Direct messages"
        items={[]}
        currentChannelId={undefined}
        loading
        loadingCopy="Loading direct messages…"
        emptyCopy="No direct messages yet."
        footer="Private"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText('Loading direct messages…')).toBeInTheDocument();
    unmount();

    renderSection([], { currentChannelId: undefined });
    const list = screen.getByRole('navigation', { name: 'Direct messages' });
    expect(within(list).getByText('No direct messages yet.')).toBeInTheDocument();
    expect(within(list).getByText('Only you and the other person can read a direct message')).toBeInTheDocument();
  });
});
