import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SidebarChannels from '../components/SidebarChannels';
import { chatApi } from '../api';
import type { ChatChannel, ChatUser } from '../types';

const mockCan = jest.fn((permission: string) => permission === 'chat:read');

jest.mock('../api', () => ({
  chatApi: { channels: jest.fn(), members: jest.fn() },
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (permission: string) => mockCan(permission), loading: false }),
}));

jest.mock('@/utils/session', () => ({
  getStoredUser: () => ({ _id: 'me' }),
}));

jest.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ setOpenMobile: jest.fn() }),
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-chat">{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({ render }: { render?: React.ReactElement }) => render ?? null,
}));

const channels = jest.mocked(chatApi.channels);
const members = jest.mocked(chatApi.members);

const channel = (overrides: Partial<ChatChannel> & { _id: string; kind: ChatChannel['kind']; name: string }): ChatChannel => ({
  description: '',
  participants: [],
  archived: false,
  mainMenu: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const directory: ChatUser[] = [
  { _id: 'me', name: 'Me' },
  { _id: 'ada', name: 'Ada Lovelace' },
];

const renderBar = () => render(
  <MemoryRouter initialEntries={['/acme/chat/c1']}>
    <Routes>
      <Route path="/:workspaceSlug/chat/:channelId" element={<SidebarChannels />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  mockCan.mockReset();
  mockCan.mockImplementation((permission: string) => permission === 'chat:read');
  channels.mockReset();
  members.mockReset();
  channels.mockResolvedValue([
    channel({ _id: 'c1', kind: 'team', name: 'Team Chat', mainMenu: true }),
    channel({ _id: 'c2', kind: 'general', name: 'General', mainMenu: true }),
    channel({ _id: 'c3', kind: 'project', name: 'Project One' }),
    channel({ _id: 'c4', kind: 'direct', name: 'Direct message', participants: ['me', 'ada'] }),
  ]);
  members.mockResolvedValue(directory);
});

describe('SidebarChannels', () => {
  it('AC-001/AC-041: lists the CHAT group with only the team and general channels', async () => {
    renderBar();

    expect(await screen.findByText('Team Chat')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.queryByText('Project One')).not.toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('AC-002: renders nothing without chat:read', () => {
    mockCan.mockReturnValue(false);
    renderBar();

    expect(screen.queryByTestId('sidebar-chat')).not.toBeInTheDocument();
    expect(channels).not.toHaveBeenCalled();
  });
});
