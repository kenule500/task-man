import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import api from '@/utils/api';
import { clearSession, saveSession } from '@/utils/session';
import SsoCompletePage from '../SsoCompletePage';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));
jest.mock('@/utils/session', () => ({ saveSession: jest.fn(), clearSession: jest.fn() }));

const get = api.get as jest.Mock;

jest.setTimeout(30000);

const Where = () => {
  const { pathname, search } = useLocation();
  return <p>{`at ${pathname}${search}`}</p>;
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/sso/complete']}>
      <Routes>
        <Route path="/sso/complete" element={<SsoCompletePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

const arrive = (hash: string, started = true) => {
  window.history.replaceState(null, '', `/sso/complete${hash}`);
  sessionStorage.clear();
  if (started) sessionStorage.setItem('ssoPending', JSON.stringify({ provider: 'google', at: Date.now() }));
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({
    data: { _id: 'u1', name: 'Ada', email: 'ada@example.com', onboarding: { completedAt: '2026-01-01' }, activeWorkspace: 'w1', workspaces: [{ _id: 'w1', slug: 'demo' }] },
  });
});

describe('SsoCompletePage', () => {
  it('stores the session from the fragment, removes the fragment and continues to the workspace', async () => {
    arrive('#token=header.payload.sig');
    renderPage();

    expect(await screen.findByText('at /demo/dashboard')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(saveSession).toHaveBeenLastCalledWith('header.payload.sig', expect.objectContaining({ _id: 'u1', email: 'ada@example.com', activeWorkspaceSlug: 'demo', onboardingComplete: true }));
    // The token is stored before the profile request, whose interceptor reads it from storage
    expect((saveSession as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(get.mock.invocationCallOrder[0]);
    expect(sessionStorage.getItem('ssoPending')).toBeNull();
  });

  it('sends a new account to onboarding and honours a pending invitation', async () => {
    arrive('#token=a.b.c');
    get.mockResolvedValue({ data: { _id: 'u2', name: 'New', email: 'n@example.com', workspaces: [] } });
    const first = renderPage();
    expect(await screen.findByText('at /onboarding')).toBeInTheDocument();
    first.unmount();

    arrive('#token=a.b.c');
    sessionStorage.setItem('pendingInvite', 'CODE9');
    renderPage();
    expect(await screen.findByText('at /join/CODE9')).toBeInTheDocument();
  });

  it('continues to a safe redirect from the server and ignores an unsafe one', async () => {
    arrive('#token=a.b.c&redirect=%2Fjoin%2FXYZ');
    const first = renderPage();
    expect(await screen.findByText('at /join/XYZ')).toBeInTheDocument();
    first.unmount();

    arrive('#token=a.b.c&redirect=https%3A%2F%2Fevil.example');
    renderPage();
    expect(await screen.findByText('at /demo/dashboard')).toBeInTheDocument();
  });

  it('refuses a callback that this tab did not start', async () => {
    arrive('#token=a.b.c', false);
    renderPage();
    expect(await screen.findByText('at /login?sso_error=not_started')).toBeInTheDocument();
    expect(saveSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('goes back to the login page without a token', async () => {
    arrive('');
    renderPage();
    expect(await screen.findByText('at /login?sso_error=invalid_state')).toBeInTheDocument();
  });

  it('forgets the session when the profile cannot be loaded', async () => {
    arrive('#token=a.b.c');
    get.mockRejectedValue(new Error('401'));
    renderPage();
    expect(await screen.findByText('at /login?sso_error=server_error')).toBeInTheDocument();
    expect(clearSession).toHaveBeenCalled();
  });
});
