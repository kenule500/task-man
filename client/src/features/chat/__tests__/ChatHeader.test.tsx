import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatHeader from '../components/ChatHeader';
import type { ChatChannel } from '../types';

const channel: ChatChannel = {
  _id: 'channel-1',
  kind: 'team',
  name: 'Team Chat',
  description: 'Team coordination',
  participants: [],
  archived: false,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
};

const renderHeader = (onBack?: () => void) => render(
  <ChatHeader
    channel={channel}
    label="Team Chat"
    memberCount={3}
    onlineUserIds={[]}
    transport="live"
    onBack={onBack}
    onOpenSearch={jest.fn()}
    onTogglePins={jest.fn()}
    onOpenMembers={jest.fn()}
  />,
);

describe('ChatHeader', () => {
  it('offers a back control to the conversation list below lg', async () => {
    const onBack = jest.fn();
    renderHeader(onBack);

    const back = screen.getByRole('button', { name: 'Back to conversations' });
    expect(back).toHaveClass('lg:hidden');

    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the back control when the caller has nowhere to go back to', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: 'Back to conversations' })).not.toBeInTheDocument();
  });

  it('AC-034: states the channel purpose under the title', () => {
    renderHeader();
    expect(screen.getByText('Team coordination')).toBeInTheDocument();
  });

  it('AC-033: reports a degraded transport instead of appearing healthy', () => {
    render(
      <ChatHeader
        channel={channel}
        label="Team Chat"
        memberCount={3}
        onlineUserIds={[]}
        transport="degraded"
        onOpenSearch={jest.fn()}
        onTogglePins={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    expect(screen.getByText('Reconnecting — updates may lag')).toBeInTheDocument();
  });

  it('AC-068: reports the member count it is given, never a fallback', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Members, 3 in this channel' })).toBeInTheDocument();
  });

  it('AC-069: a direct conversation shows the person, not a lock glyph', () => {
    const { container } = render(
      <ChatHeader
        channel={{ ...channel, kind: 'direct', name: 'Direct message' }}
        label="Ada Lovelace"
        peer={{ _id: 'u1', name: 'Ada Lovelace' }}
        peerOnline
        memberCount={2}
        onlineUserIds={['u1']}
        transport="live"
        onOpenSearch={jest.fn()}
        onTogglePins={jest.fn()}
        onOpenMembers={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(container.querySelector('.lucide-lock')).toBeNull();
    expect(container.querySelector('.lucide-hash')).toBeNull();
    expect(screen.getByRole('button', { name: 'Members, 2 in this channel' })).toBeInTheDocument();
  });
});
