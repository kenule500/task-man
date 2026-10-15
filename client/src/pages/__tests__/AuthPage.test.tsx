import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '@/utils/api';
import AuthPage from '../AuthPage';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const post = api.post as jest.Mock;

jest.setTimeout(30000);

const renderSignup = () =>
  render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<AuthPage />} />
        <Route path="/login" element={<AuthPage />} />
      </Routes>
    </MemoryRouter>,
  );

const fillAndSubmit = async () => {
  await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
  await userEvent.type(screen.getByLabelText(/email address/i), 'ada@example.com');
  await userEvent.type(screen.getByLabelText(/^password/i), 'analytical-engine');
  await userEvent.click(screen.getByRole('button', { name: /create account/i }));
};

describe('AuthPage signup', () => {
  it('says the account is ready when the server verified it automatically', async () => {
    post.mockResolvedValue({ data: { message: 'Account created and verified.', requiresVerification: false } });
    renderSignup();
    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: /your account is ready/i })).toBeInTheDocument();
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/auth/signup', expect.objectContaining({ email: 'ada@example.com', name: 'Ada Lovelace' }));
  });

  it('asks to check the inbox when email verification is required', async () => {
    post.mockResolvedValue({ data: { message: 'Check your email', requiresVerification: true } });
    renderSignup();
    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });
});
