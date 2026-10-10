import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import { TwoFactorCard } from '../components/TwoFactorCard';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  getApiErrorMessage: (err: unknown, fallback: string) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback,
}));
jest.mock('@/utils/session', () => ({
  getStoredUser: () => ({ _id: 'u1', name: 'Ada', email: 'ada@example.com' }),
}));

const mockedApi = api as jest.Mocked<typeof api>;

jest.setTimeout(30000);

const SECRET = 'JBSWY3DPEHPK3PXP';
const OTPAUTH = `otpauth://totp/TaskMan:ada%40example.com?secret=${SECRET}&issuer=TaskMan`;
const CODES = ['aaaa-bbbb', 'cccc-dddd', 'eeee-ffff'];

let status = { enabled: false, enabledAt: null as string | null, recoveryCodesRemaining: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  status = { enabled: false, enabledAt: null, recoveryCodesRemaining: 0 };
  mockedApi.get.mockImplementation(async (url: string) => {
    if (url === '/profile/2fa') return { data: status };
    throw new Error(`unexpected ${url}`);
  });
  mockedApi.post.mockImplementation(async (url: string) => {
    if (url === '/profile/2fa/setup') return { data: { secret: SECRET, otpauthUrl: OTPAUTH } };
    if (url === '/profile/2fa/enable') {
      status = { enabled: true, enabledAt: '2026-10-10T08:00:00Z', recoveryCodesRemaining: 3 };
      return { data: { enabled: true, recoveryCodes: CODES } };
    }
    if (url === '/profile/2fa/disable') {
      status = { enabled: false, enabledAt: null, recoveryCodesRemaining: 0 };
      return { data: { enabled: false } };
    }
    if (url === '/profile/2fa/recovery-codes') return { data: { recoveryCodes: CODES } };
    throw new Error(`unexpected ${url}`);
  });
});

describe('TwoFactorCard: off', () => {
  it('offers the setup and walks through scan, verify, recovery codes and done', async () => {
    render(<TwoFactorCard />);
    await userEvent.click(await screen.findByRole('button', { name: /set up two-factor authentication/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('list', { name: /setup progress/i })).toBeInTheDocument();
    expect(await within(dialog).findByTestId('two-factor-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    expect(await within(dialog).findByRole('img', { name: /qr code/i })).toBeInTheDocument();
    expect(mockedApi.post).toHaveBeenCalledWith('/profile/2fa/setup');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    const code = within(dialog).getByLabelText(/6-digit code/i);
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    await userEvent.click(code);
    await userEvent.paste('123 456');
    expect(code).toHaveValue('123456');

    // Needs the password too
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(within(dialog).getByText('Enter your password.')).toBeInTheDocument();
    expect(mockedApi.post).not.toHaveBeenCalledWith('/profile/2fa/enable', expect.anything());

    await userEvent.type(within(dialog).getByLabelText('Your password'), 'correct horse');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(mockedApi.post).toHaveBeenCalledWith('/profile/2fa/enable', { code: '123456', password: 'correct horse' });

    // Recovery codes are shown once and cannot be skipped
    const list = await within(dialog).findByRole('list', { name: 'Recovery codes' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(CODES);
    expect(within(dialog).getByRole('button', { name: /download/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /copy codes/i })).toBeInTheDocument();
    const next = within(dialog).getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /saved these recovery codes/i }));
    await userEvent.click(next);

    expect(await within(dialog).findByText('Two-factor authentication is on')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/3 recovery codes left/)).toBeInTheDocument();
  });

  it('shows the server message when the code is wrong and stays on the step', async () => {
    mockedApi.post.mockImplementation(async (url: string) => {
      if (url === '/profile/2fa/setup') return { data: { secret: SECRET, otpauthUrl: OTPAUTH } };
      throw { response: { status: 400, data: { message: 'That code is not valid.', code: 'INVALID_CODE' } } };
    });
    render(<TwoFactorCard />);
    await userEvent.click(await screen.findByRole('button', { name: /set up two-factor authentication/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Next' }));
    await userEvent.type(within(dialog).getByLabelText(/6-digit code/i), '000000');
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'correct horse');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(await within(dialog).findByText('That code is not valid.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument();
  });
});

describe('TwoFactorCard: on', () => {
  beforeEach(() => {
    status = { enabled: true, enabledAt: '2026-10-01T08:00:00Z', recoveryCodesRemaining: 1 };
  });

  it('shows the state, warns about few recovery codes and disables with password and code', async () => {
    render(<TwoFactorCard />);
    expect(await screen.findByText(/1 recovery code left/)).toBeInTheDocument();
    expect(screen.getByText(/running low on recovery codes/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /turn off/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'correct horse');
    await userEvent.type(within(dialog).getByLabelText(/6-digit code/i), '654321');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));

    expect(mockedApi.post).toHaveBeenCalledWith('/profile/2fa/disable', { password: 'correct horse', code: '654321' });
    expect(await screen.findByRole('button', { name: /set up two-factor authentication/i })).toBeInTheDocument();
  });

  it('can turn off with a recovery code instead', async () => {
    render(<TwoFactorCard />);
    await userEvent.click(await screen.findByRole('button', { name: /turn off/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /use a recovery code instead/i }));
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'correct horse');
    await userEvent.type(within(dialog).getByLabelText('Recovery code'), 'ABCDEFGH');
    expect(within(dialog).getByLabelText('Recovery code')).toHaveValue('abcd-efgh');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    expect(mockedApi.post).toHaveBeenCalledWith('/profile/2fa/disable', { password: 'correct horse', recoveryCode: 'abcd-efgh' });
  });

  it('creates new recovery codes and shows them once', async () => {
    render(<TwoFactorCard />);
    await userEvent.click(await screen.findByRole('button', { name: /new recovery codes/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'correct horse');
    await userEvent.type(within(dialog).getByLabelText(/6-digit code/i), '654321');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create new codes' }));
    expect(mockedApi.post).toHaveBeenCalledWith('/profile/2fa/recovery-codes', { password: 'correct horse', code: '654321' });

    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });
});
