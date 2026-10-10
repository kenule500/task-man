import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '@/utils/api';
import { saveSession } from '@/utils/session';
import AuthPage from '../AuthPage';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  getApiErrorMessage: (err: unknown, fallback: string) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback,
}));
jest.mock('@/utils/session', () => ({ saveSession: jest.fn() }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

jest.setTimeout(30000);

const SESSION = { _id: 'u1', name: 'Ada', email: 'ada@example.com', token: 'session-token', onboardingComplete: true, activeWorkspaceSlug: 'demo' };

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/signup" element={<AuthPage />} />
        <Route path="/demo/dashboard" element={<p>dashboard page</p>} />
        <Route path="/join/:code" element={<p>join page</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, '', '/login');
  get.mockResolvedValue({ data: { providers: [{ id: 'google', label: 'Google' }] } });
});

describe('AuthPage: single sign-on', () => {
  it('offers the configured providers on the sign-in and sign-up forms', async () => {
    const login = renderAt('/login');
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
    login.unmount();

    renderAt('/signup');
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('shows no provider buttons when none is configured', async () => {
    get.mockResolvedValue({ data: { providers: [] } });
    renderAt('/login');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    await Promise.resolve();
    expect(screen.queryByRole('link', { name: /continue with/i })).not.toBeInTheDocument();
  });

  it('explains a failed sign-in in plain language, never the raw code', async () => {
    renderAt('/login?sso_error=email_unverified');
    expect(await screen.findByText(/has not verified that email address/i)).toBeInTheDocument();
    expect(screen.queryByText(/email_unverified/)).not.toBeInTheDocument();
  });

  it('continues to the second step when the provider sign-in needs a code', async () => {
    window.history.replaceState(null, '', '/login#challenge=chal.len.ge&redirect=%2Fjoin%2FXYZ');
    post.mockResolvedValue({ data: SESSION });
    renderAt('/login');

    expect(await screen.findByRole('heading', { name: 'Enter the 6-digit code' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');

    await userEvent.click(screen.getByLabelText('Authentication code'));
    await userEvent.paste('123456');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));

    expect(post).toHaveBeenCalledWith('/auth/login/2fa', { challenge: 'chal.len.ge', code: '123456' });
    expect(await screen.findByText('join page')).toBeInTheDocument();
    expect(saveSession).toHaveBeenCalledWith('session-token', expect.objectContaining({ email: 'ada@example.com' }));
  });
});
