import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import { WorkspaceSecurityCard } from '../components/WorkspaceSecurityCard';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
  getApiErrorMessage: (err: unknown, fallback: string) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback,
}));

const mockedApi = api as jest.Mocked<typeof api>;

const withStatus = (enabled: boolean) =>
  mockedApi.get.mockResolvedValue({ data: { enabled, enabledAt: null, recoveryCodesRemaining: enabled ? 10 : 0 } });

const switchOf = () => screen.getByRole('switch', { name: 'Require two-factor authentication' });
// Base UI marks a disabled switch with aria-disabled (it is a span, not a button)
const isDisabled = () => switchOf().getAttribute('aria-disabled') === 'true';

const renderCard = async (props: Partial<React.ComponentProps<typeof WorkspaceSecurityCard>> = {}) => {
  const onChange = jest.fn();
  render(
    <MemoryRouter>
      <WorkspaceSecurityCard workspaceSlug="demo" require2fa={false} canManage onChange={onChange} {...props} />
    </MemoryRouter>,
  );
  // Let the two-factor status request settle
  await act(async () => {});
  return onChange;
};

beforeEach(() => jest.clearAllMocks());

describe('WorkspaceSecurityCard', () => {
  it('turns the policy on when the admin has two-factor themselves', async () => {
    withStatus(true);
    mockedApi.put.mockResolvedValue({ data: { security: { require2fa: true } } });
    const onChange = await renderCard();

    expect(isDisabled()).toBe(false);
    await userEvent.click(switchOf());

    expect(mockedApi.put).toHaveBeenCalledWith('/workspaces/demo', { require2fa: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
    expect(screen.queryByText(/for your own account first/i)).not.toBeInTheDocument();
  });

  it('warns and blocks turning it on when the admin has no two-factor', async () => {
    withStatus(false);
    await renderCard();
    expect(await screen.findByText(/for your own account first/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /security settings/i })).toHaveAttribute('href', '/settings/security');
    expect(isDisabled()).toBe(true);
  });

  it('lets an admin without two-factor turn the policy off', async () => {
    withStatus(false);
    mockedApi.put.mockResolvedValue({ data: { security: { require2fa: false } } });
    const onChange = await renderCard({ require2fa: true });
    expect(isDisabled()).toBe(false);
    await userEvent.click(switchOf());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
  });

  it('is read-only without settings:manage', async () => {
    withStatus(true);
    await renderCard({ canManage: false });
    expect(isDisabled()).toBe(true);
    expect(screen.getByText(/only owners and admins/i)).toBeInTheDocument();
  });

  it('shows the server message when saving fails', async () => {
    withStatus(true);
    mockedApi.put.mockRejectedValue({ response: { data: { message: 'Turn on two-factor first.' } } });
    await renderCard();
    await userEvent.click(switchOf());
    expect(await screen.findByText('Turn on two-factor first.')).toBeInTheDocument();
  });
});
