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
});
