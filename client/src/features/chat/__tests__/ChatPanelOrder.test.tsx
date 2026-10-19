import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { chatApi } from '../api';
import ChatView from '../views/ChatView';
import type { ChatChannel, ConversationCard } from '../types';

jest.mock('@/hooks/useAuthGuard', () => ({
  __esModule: true,
  useAuthGuard: () => ({ user: { _id: 'me', name: 'Me' }, logout: jest.fn() }),
}));
jest.mock('@/hooks/usePermissions', () => ({
  __esModule: true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
jest.mock('../hooks/useChatChannels', () => ({
  __esModule: true,
  useChatChannels: () => ({
    active: [
      {
        _id: 'c1', kind: 'team', name: 'Team Chat', description: 'Team coordination',
        participants: [], archived: false, memberCount: 4, createdAt: '', updatedAt: '',
      },
      {
        _id: 'd2', kind: 'direct', name: 'Direct message', description: '',
        participants: ['me', 'u3'], archived: false, memberCount: 2, createdAt: '', updatedAt: '',
      },
    ],
    members: [
      { _id: 'me', name: 'Me' },
      { _id: 'u2', name: 'Ada Lovelace' },
      { _id: 'u3', name: 'Grace Hopper' },
    ],
    loading: false,
    error: null,
    markRead: jest.fn(),
    addChannel: jest.fn(),
    nameOf: (id: string) => ({ me: 'Me', u2: 'Ada Lovelace', u3: 'Grace Hopper' } as Record<string, string>)[id] ?? id,
    defaultChannelId: 'c1',
  }),
}));
jest.mock('../hooks/useChatMessages', () => ({
  __esModule: true,
  useChatMessages: () => ({
    messages: [],
    reactions: {},
    loading: false,
    loadingOlder: false,
    error: null,
    hasMore: false,
    applyMessage: jest.fn(),
    applyUpdated: jest.fn(),
    applyReaction: jest.fn(),
    loadOlder: jest.fn(),
  }),
}));
jest.mock('../hooks/useChatSocket', () => ({
  __esModule: true,
  useChatSocket: () => ({ state: 'live', send: jest.fn(async () => null), notifyTyping: jest.fn() }),
}));
jest.mock('../api', () => ({
  __esModule: true,
  chatApi: {
    conversations: jest.fn(),
    startDirect: jest.fn(),
    send: jest.fn(),
    search: jest.fn(),
    pinned: jest.fn(),
    react: jest.fn(),
    edit: jest.fn(),
    remove: jest.fn(),
    pin: jest.fn(),
    unpin: jest.fn(),
  },
}));

const conversations = chatApi.conversations as unknown as jest.Mock;
const startDirect = chatApi.startDirect as unknown as jest.Mock;

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

const ada = card({ _id: 'd1', name: 'Ada Lovelace' });
const grace = card({ _id: 'd2', name: 'Grace Hopper' });
const alpha = card({ _id: 'p1', name: 'Alpha Project', project: 'project-1' });

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
};

const renderChat = () => render(
  <MemoryRouter initialEntries={['/demo/chat/c1']}>
    <Routes>
      <Route
        path="/:workspaceSlug/chat/:channelId"
        element={(
          <>
            <ChatView />
            <LocationProbe />
          </>
        )}
      />
    </Routes>
  </MemoryRouter>,
);

const isBefore = (first: HTMLElement, second: HTMLElement) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  conversations.mockReset();
  conversations.mockResolvedValue({ directs: [ada], teams: [alpha] });
  startDirect.mockReset();
});

describe('conversation panel', () => {
  it('AC-050/AC-056: shows the picker first, then direct messages, then team channels, each in exactly one section', async () => {
    renderChat();

    const directSection = await screen.findByRole('navigation', { name: 'Direct messages' });
    const teamSection = screen.getByRole('navigation', { name: 'Team channels' });
    const picker = screen.getByRole('button', { name: /New direct message/ });

    // Exactly two labelled conversation sections
    expect(screen.getAllByRole('navigation')).toHaveLength(2);
    expect(isBefore(picker, directSection)).toBe(true);
    expect(isBefore(directSection, teamSection)).toBe(true);

    // Each readable conversation appears in exactly one of them
    expect(within(directSection).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(directSection).queryByText('Alpha Project')).not.toBeInTheDocument();
    expect(within(teamSection).getByText('Alpha Project')).toBeInTheDocument();
    expect(within(teamSection).queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('AC-060: starting a direct conversation adds its row in place and selects it', async () => {
    const created: ChatChannel = {
      _id: 'd2',
      kind: 'direct',
      name: 'Direct message',
      description: '',
      participants: ['me', 'u3'],
      archived: false,
      memberCount: 2,
      createdAt: '',
      updatedAt: '',
    };
    startDirect.mockResolvedValue(created);
    // The refresh after startDirect includes the new conversation, once
    conversations
      .mockResolvedValueOnce({ directs: [ada], teams: [alpha] })
      .mockResolvedValueOnce({ directs: [ada, grace], teams: [alpha] });

    renderChat();

    const directSection = await screen.findByRole('navigation', { name: 'Direct messages' });
    await waitFor(() => expect(within(directSection).getByText('Ada Lovelace')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /New direct message/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Grace Hopper' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/demo/chat/d2'));
    await waitFor(() => expect(within(directSection).getByText('Grace Hopper')).toBeInTheDocument());
    expect(within(directSection).getAllByText('Grace Hopper')).toHaveLength(1);
    expect(startDirect).toHaveBeenCalledWith('demo', 'u3');
  });
});
