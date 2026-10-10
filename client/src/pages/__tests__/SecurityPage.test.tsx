import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SecurityPage from '../SecurityPage';
import api from '@/utils/api';
import { clearSession } from '@/utils/session';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));
jest.mock('@/utils/session', () => ({
  clearSession: jest.fn(),
  getStoredUser: () => ({ _id: 'u1', name: 'Ada', email: 'ada@example.com' }),
}));

const mockedApi = api as jest.Mocked<typeof api>;

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';

const now = Date.now();
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();

// Deliberately not "current first": the list must sort it to the top.
const sessions = () => [
  { _id: 's2', userAgent: SAFARI_IPHONE, ipAddress: '10.0.0.2', createdAt: iso(300), lastLoggedIn: iso(12), current: false },
  { _id: 's1', userAgent: CHROME_WIN, ipAddress: '10.0.0.1', createdAt: iso(5), lastLoggedIn: iso(1), current: true },
  { _id: 's3', userAgent: FIREFOX_LINUX, ipAddress: '10.0.0.3', createdAt: iso(90), lastLoggedIn: iso(60), current: false },
];

const LOGIN = 'login page';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/settings/security']}>
      <Routes>
        <Route path="/settings/security" element={<SecurityPage />} />
        <Route path="/login" element={<p>{LOGIN}</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.get.mockImplementation(async (url: string) => {
    if (url === '/profile/sessions') return { data: sessions() };
    if (url === '/profile/2fa') return { data: { enabled: false, enabledAt: null, recoveryCodesRemaining: 0 } };
    throw new Error(`unexpected ${url}`);
  });
  mockedApi.delete.mockResolvedValue({ data: {} });
  mockedApi.post.mockResolvedValue({ data: { revoked: 2 } });
});

describe('SecurityPage signed-in devices', () => {
  it('lists the current device first with a tag, and the explanatory note', async () => {
    renderPage();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Chrome on Windows')).toBeInTheDocument();
    expect(within(items[0]).getByText('This device')).toBeInTheDocument();
    expect(within(items[0]).getByText(/10\.0\.0\.1/)).toBeInTheDocument();
    expect(within(items[0]).getByText(/Signed in 1 min ago/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Safari on iOS')).toBeInTheDocument();
    expect(screen.getAllByText('This device')).toHaveLength(1);
    expect(screen.getByText(/stay signed in for 7 days/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out Safari on iOS' })).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    // Only the first devices request fails (the two-factor and sign-in method cards load their own data)
    let failed = false;
    mockedApi.get.mockImplementation(async (url: string) => {
      if (url === '/profile/2fa') return { data: { enabled: false, enabledAt: null, recoveryCodesRemaining: 0 } };
      if (url === '/profile/sso') return { data: { methods: [], hasPassword: true, available: [] } };
      if (!failed) {
        failed = true;
        throw new Error('boom');
      }
      return { data: sessions() };
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your signed-in devices.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
  });

  it('shows an empty fallback and disables the bulk action', async () => {
    mockedApi.get.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText('No active devices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out all other devices' })).toBeDisabled();
  });

  it('signs out another device without confirmation and removes its row', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out Safari on iOS' }));
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/profile/sessions/s2'));
    await waitFor(() => expect(screen.queryByText('Safari on iOS')).not.toBeInTheDocument());
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('signs out all other devices after confirming', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    expect(mockedApi.post).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out other devices' }));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/profile/sessions/revoke-others'));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out all other devices' })).toBeDisabled();
  });

  it('does not call the API when the bulk confirmation is cancelled', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(mockedApi.post).not.toHaveBeenCalled();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('confirms before signing out this browser, then clears the session and goes to login', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out Chrome on Windows' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/signs this browser out/i);
    expect(mockedApi.delete).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/profile/sessions/s1'));
    await waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(await screen.findByText(LOGIN)).toBeInTheDocument();
  });
});
