import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import { SsoButtons } from '../components/SsoButtons';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

const get = api.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

describe('SsoButtons', () => {
  it('shows a button for each enabled provider, linking to the server start address', async () => {
    get.mockResolvedValue({ data: { providers: [{ id: 'google', label: 'Google' }, { id: 'microsoft', label: 'Microsoft' }] } });
    render(<SsoButtons />);

    const google = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(google).toHaveAttribute('href', 'http://localhost:5000/api/auth/sso/google/start');
    expect(screen.getByRole('link', { name: 'Continue with Microsoft' })).toHaveAttribute('href', 'http://localhost:5000/api/auth/sso/microsoft/start');
    expect(screen.getByRole('separator', { name: 'or' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/auth/sso/providers');
  });

  it('remembers that the sign-in started in this tab', async () => {
    get.mockResolvedValue({ data: { providers: [{ id: 'google', label: 'Google' }] } });
    render(<SsoButtons />);
    const link = await screen.findByRole('link', { name: 'Continue with Google' });
    link.addEventListener('click', (event) => event.preventDefault()); // jsdom cannot navigate
    await userEvent.click(link);
    expect(JSON.parse(sessionStorage.getItem('ssoPending') as string)).toMatchObject({ provider: 'google' });
  });

  it('renders nothing when no provider is configured, when the request fails, and ignores unknown providers', async () => {
    get.mockResolvedValue({ data: { providers: [] } });
    const { container, rerender } = render(<SsoButtons />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();

    get.mockRejectedValue(new Error('offline'));
    rerender(<SsoButtons redirect="/join/ABC" />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();

    get.mockResolvedValue({ data: { providers: [{ id: 'github', label: 'GitHub' }] } });
    const second = render(<SsoButtons />);
    await Promise.resolve();
    expect(second.container).toBeEmptyDOMElement();
  });
});
