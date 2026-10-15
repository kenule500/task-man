import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '@/utils/api';
import { saveSession } from '@/utils/session';
import AuthPage from '../AuthPage';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  getApiErrorMessage: (err: unknown, fallback: string) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback,
}));
jest.mock('@/utils/session', () => ({ saveSession: jest.fn() }));

const post = api.post as jest.Mock;

jest.setTimeout(30000);

const CHALLENGE = 'challenge.jwt.value';
const SESSION = { _id: 'u1', name: 'Ada', email: 'ada@example.com', token: 'session-token', onboardingComplete: true, activeWorkspaceSlug: 'demo' };

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/demo/dashboard" element={<p>dashboard page</p>} />
      </Routes>
    </MemoryRouter>,
  );

const passwordStep = async () => {
  await userEvent.type(screen.getByLabelText(/email address/i), 'ada@example.com');
  await userEvent.type(screen.getByLabelText(/^password/i), 'analytical-engine');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
};

beforeEach(() => {
  jest.clearAllMocks();
  post.mockImplementation(async (url: string) => {
    if (url === '/auth/login') return { data: { twoFactorRequired: true, challenge: CHALLENGE } };
    if (url === '/auth/login/2fa') return { data: SESSION };
    throw new Error(`unexpected ${url}`);
  });
});

describe('AuthPage: second step', () => {
  it('asks for the 6-digit code after the password and signs in with it', async () => {
    renderLogin();
    await passwordStep();

    expect(await screen.findByRole('heading', { name: 'Enter the 6-digit code' })).toBeInTheDocument();
    expect(saveSession).not.toHaveBeenCalled();
    const input = screen.getByLabelText('Authentication code');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');

    await userEvent.click(input);
    await userEvent.paste('123 456');
    expect(input).toHaveValue('123456');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));

    expect(post).toHaveBeenCalledWith('/auth/login/2fa', { challenge: CHALLENGE, code: '123456' });
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    expect(saveSession).toHaveBeenCalledWith('session-token', expect.objectContaining({ email: 'ada@example.com' }));
  });

  it('does not submit an incomplete code', async () => {
    renderLogin();
    await passwordStep();
    await userEvent.type(await screen.findByLabelText('Authentication code'), '12');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));
    expect(screen.getByText('Enter the 6-digit code.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/auth/login/2fa', expect.anything());
  });

  it('signs in with a recovery code instead', async () => {
    renderLogin();
    await passwordStep();
    await userEvent.click(await screen.findByRole('button', { name: /use a recovery code instead/i }));

    const input = screen.getByLabelText('Recovery code');
    await userEvent.type(input, 'ABCDEFGH');
    expect(input).toHaveValue('abcd-efgh');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));
    expect(post).toHaveBeenCalledWith('/auth/login/2fa', { challenge: CHALLENGE, recoveryCode: 'abcd-efgh' });
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });

  it('switches between the app code and a recovery code', async () => {
    renderLogin();
    await passwordStep();
    await userEvent.click(await screen.findByRole('button', { name: /use a recovery code instead/i }));
    expect(screen.getByLabelText('Recovery code')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /use my authenticator app instead/i }));
    expect(screen.getByLabelText('Authentication code')).toBeInTheDocument();
  });

  it('shows a wrong-code message and keeps the step', async () => {
    renderLogin();
    await passwordStep();
    post.mockImplementation(async () => {
      throw { response: { status: 401, data: { message: 'That code is not valid.', code: 'INVALID_CODE' } } };
    });
    await userEvent.type(await screen.findByLabelText('Authentication code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not valid.');
    expect(screen.getByLabelText('Authentication code')).toBeInTheDocument();
  });

  it('returns to the password step when the challenge expired', async () => {
    renderLogin();
    await passwordStep();
    post.mockImplementation(async () => {
      throw { response: { status: 401, data: { message: 'This sign-in expired.', code: 'CHALLENGE_EXPIRED' } } };
    });
    await userEvent.type(await screen.findByLabelText('Authentication code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));
    expect(await screen.findByText('This sign-in expired.')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('can go back to the password step', async () => {
    renderLogin();
    await passwordStep();
    await userEvent.click(await screen.findByRole('button', { name: /back to sign in/i }));
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });
});
