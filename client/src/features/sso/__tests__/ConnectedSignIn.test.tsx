import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import { ConnectedSignIn } from '../components/ConnectedSignIn';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), delete: jest.fn() },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

const mockedApi = api as jest.Mocked<typeof api>;

jest.setTimeout(30000);

const respond = (data: unknown) => mockedApi.get.mockResolvedValue({ data });

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.delete.mockResolvedValue({ data: {} });
});

describe('ConnectedSignIn', () => {
  it('lists the linked provider with its email and removes it after confirming', async () => {
    respond({ methods: [{ provider: 'google', email: 'ada@example.com', linkedAt: '2026-01-01T00:00:00Z' }], hasPassword: true, available: ['google'] });
    render(<ConnectedSignIn />);

    const item = await screen.findByRole('listitem');
    expect(within(item).getByText('Google')).toBeInTheDocument();
    expect(within(item).getByText('ada@example.com')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Google sign-in' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/profile/sso/google'));
    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
    expect(screen.getByText(/No provider is connected/)).toBeInTheDocument();
  });

  it('keeps the only way to sign in: removal is disabled and the reason is shown', async () => {
    respond({ methods: [{ provider: 'microsoft', email: null, linkedAt: null }], hasPassword: false, available: ['microsoft'] });
    render(<ConnectedSignIn />);
    expect(await screen.findByRole('button', { name: 'Remove Microsoft sign-in' })).toBeDisabled();
    expect(screen.getByText(/only way to sign in/)).toBeInTheDocument();
    expect(screen.getByText('Email not shared')).toBeInTheDocument();
  });

  it('stays hidden when the server offers no provider and none is linked, or when loading fails', async () => {
    respond({ methods: [], hasPassword: true, available: [] });
    const { container, rerender } = render(<ConnectedSignIn />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();

    mockedApi.get.mockRejectedValue(new Error('unexpected'));
    rerender(<ConnectedSignIn key="again" />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
