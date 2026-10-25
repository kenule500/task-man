import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorkspaceSettingsPage from '../WorkspaceSettingsPage';
import api from '@/utils/api';
import { aiReviewApi } from '@/features/ai-review/api';
import { settings as aiSettings } from '@/features/ai-review/__tests__/fixtures';

jest.mock('@/features/ai-review/api', () => ({
  ...jest.requireActual('@/features/ai-review/api'),
  aiReviewApi: { ...jest.requireActual('@/features/ai-review/api').aiReviewApi, getSettings: jest.fn() },
}));

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

jest.mock('@/features/workspace', () => ({
  useWorkspaceData: () => ({
    workspace: { _id: 'w1', name: 'Demo', slug: 'demo', inviteCode: 'ABC123' },
    setWorkspace: jest.fn(),
    loading: false,
    error: '',
  }),
  workspaceApi: { update: jest.fn(), regenerateInvite: jest.fn() },
}));

let granted: string[] = [];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (permission: string) => granted.includes(permission), user: null, loading: false }),
}));

const mockedApi = api as jest.Mocked<typeof api>;

const catalog = {
  Projects: [{ key: 'projects:read', label: 'View projects' }],
  Tasks: [{ key: 'tasks:read', label: 'View tasks' }],
};

const system = (name: string, permissions: string[]) => ({
  _id: name,
  name,
  description: `${name} role`,
  permissions,
  isSystem: true,
  workspaceId: null as string | null,
});
const custom = (name: string) => ({
  _id: name,
  name,
  description: '',
  permissions: ['tasks:read'],
  isSystem: false,
  workspaceId: 'w1',
});

let roles: (ReturnType<typeof system> | ReturnType<typeof custom>)[] = [];

beforeEach(() => {
  granted = ['settings:manage'];
  (aiReviewApi.getSettings as jest.Mock).mockResolvedValue(aiSettings());
  roles = [system('Product Owner', ['projects:read', 'tasks:read']), system('Viewer', ['projects:read']), custom('Auditor')];
  mockedApi.get.mockImplementation(async (url: string) => {
    if (url === '/roles/permissions') return { data: catalog };
    if (url === '/workspaces/demo/roles') return { data: roles };
    if (url === '/workspaces/demo') return { data: { members: [{ roleId: { _id: 'Viewer' } }] } };
    throw new Error(`unexpected ${url}`);
  });
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/demo/settings']}>
      <Routes>
        <Route path="/:workspaceSlug/settings" element={<WorkspaceSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('WorkspaceSettingsPage roles', () => {
  it('shows the permission matrix by default on wide screens and lets the user switch to cards', async () => {
    renderPage();

    expect(await screen.findByRole('region', { name: 'Permission matrix' })).toBeInTheDocument();
    expect(screen.getByText('1 member')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Matrix' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Cards' }));

    const cards = await screen.findByRole('region', { name: 'Role cards' });
    expect(cards).toHaveClass('overflow-y-auto', 'max-h-[60dvh]');
    expect(screen.queryByRole('region', { name: 'Permission matrix' })).not.toBeInTheDocument();
    expect(screen.getByText('Product Owner')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Matrix' }));
    expect(await screen.findByRole('region', { name: 'Permission matrix' })).toBeInTheDocument();
  });

  it('starts on cards on phone-sized screens', async () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    try {
      renderPage();
      expect(await screen.findByRole('region', { name: 'Role cards' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Cards' })).toBeChecked();
    } finally {
      window.matchMedia = original;
    }
  });

  it('shows edit controls for custom roles to managers', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Edit role Auditor' })).toBeInTheDocument();
  });

  it('AC-022: mounts the AI provider settings only for members who can manage settings', async () => {
    const { unmount } = renderPage();
    expect(await screen.findByRole('region', { name: 'AI assistant' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'AI provider' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('combobox', { name: 'Provider' }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/API key/)[0]).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: 'Test connection' }).length).toBeGreaterThan(0);
    unmount();

    granted = [];
    renderPage();
    expect(await screen.findByRole('region', { name: 'Permission matrix' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'AI assistant' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { name: 'AI provider' })).toHaveLength(0);
    expect(screen.queryAllByRole('combobox', { name: 'Provider' })).toHaveLength(0);
  });

  it('hides edit controls from read-only users but still shows the matrix', async () => {
    granted = [];
    renderPage();

    expect(await screen.findByRole('region', { name: 'Permission matrix' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit role/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New role/ })).not.toBeInTheDocument();
  });

  it('adds a role search only when there are more than six roles', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Permission matrix' });
    expect(screen.queryByRole('searchbox', { name: 'Search roles' })).not.toBeInTheDocument();
  });

  it('filters roles with the search field when there are many', async () => {
    roles = [
      system('Product Owner', ['projects:read']),
      system('Viewer', ['projects:read']),
      ...['Auditor', 'Contractor', 'Designer', 'Finance', 'Legal'].map(custom),
    ];
    renderPage();

    const search = await screen.findByRole('searchbox', { name: 'Search roles' });
    await userEvent.type(search, 'contr');

    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Auditor/ })).not.toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: /Contractor/ })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(await screen.findByText(/No roles match/)).toBeInTheDocument();
  });
});
