import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamChannelList from '../components/TeamChannelList';
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

const team = card({
  _id: 'team-1',
  name: 'Alpha Project',
  project: 'project-1',
  avatarUrl: '/chat/team-1/avatar',
  lastMessage: { body: 'Ship it', at: '2026-10-18T10:00:00.000Z', authorName: 'Ada' },
  unread: true,
  unreadCount: 3,
});

describe('TeamChannelList', () => {
  it('AC-042: a row carries the avatar, name, last message and unread state, and opens the channel', async () => {
    const onSelect = jest.fn();
    render(
      <TeamChannelList
        teams={[team]}
        currentChannelId="other-channel"
        loading={false}
        canManage={false}
        onSelect={onSelect}
        onOpenSettings={jest.fn()}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Team channels' });
    expect(within(nav).getByText('Alpha Project')).toBeInTheDocument();
    // The avatar slot renders the channel's initials when the picture has not loaded
    expect(within(nav).getByText('AP')).toBeInTheDocument();
    expect(within(nav).getByText('Ada: Ship it')).toBeInTheDocument();
    expect(within(nav).getByText('3 unread messages')).toBeInTheDocument();

    await userEvent.click(within(nav).getByRole('button', { name: /Alpha Project/ }));
    expect(onSelect).toHaveBeenCalledWith('team-1');
  });

  it('AC-043: says explicitly when the caller has no readable team channel', () => {
    render(
      <TeamChannelList
        teams={[]}
        currentChannelId={undefined}
        loading={false}
        canManage={false}
        onSelect={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Team channels' });
    expect(within(nav).getByText(/not on any project yet/i)).toBeInTheDocument();
    // The section does not vanish without explanation, and it states who can read it
    expect(within(nav).getByText(/Only project members can read a team channel/i)).toBeInTheDocument();
    expect(within(nav).queryByRole('listitem')).not.toBeInTheDocument();
  });
});
