import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { integrationsApi } from '../api';
import GitHubIntegrationCard from '../components/GitHubIntegrationCard';
import type { GitHubIntegration } from '../types';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  integrationsApi: {
    getGitHub: jest.fn(),
    enableGitHub: jest.fn(),
    regenerateGitHubSecret: jest.fn(),
    setGitHubAutoTransition: jest.fn(),
    disableGitHub: jest.fn(),
  },
}));

const mocked = integrationsApi as jest.Mocked<typeof integrationsApi>;

const URL_TEXT = 'https://taskman.example/api/integrations/github/acme';
const SECRET = 'a1'.repeat(32);

const off: GitHubIntegration = { enabled: false, webhookUrl: URL_TEXT, autoTransition: true, connectedAt: null };
const on: GitHubIntegration = { ...off, enabled: true, secret: SECRET, connectedAt: '2026-10-10T10:00:00.000Z' };

describe('GitHubIntegrationCard', () => {
  it('offers to enable the integration and shows the credentials afterwards', async () => {
    mocked.getGitHub.mockResolvedValue(off);
    mocked.enableGitHub.mockResolvedValue(on);
    render(<GitHubIntegrationCard workspaceSlug="acme" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Enable GitHub integration' }));

    expect(mocked.enableGitHub).toHaveBeenCalledWith('acme');
    expect(await screen.findByText(URL_TEXT)).toBeInTheDocument();
    // The secret is masked until asked for
    expect(screen.queryByText(SECRET)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Show secret/ }));
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide secret/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lists the GitHub setup steps while enabled', async () => {
    mocked.getGitHub.mockResolvedValue(on);
    render(<GitHubIntegrationCard workspaceSlug="acme" />);
    expect(await screen.findByText(/Pull requests/)).toBeInTheDocument();
    expect(screen.getByText('application/json')).toBeInTheDocument();
    expect(screen.getByText(/Branch or tag creation/)).toBeInTheDocument();
  });

  it('copies the payload URL', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mocked.getGitHub.mockResolvedValue(on);
    render(<GitHubIntegrationCard workspaceSlug="acme" />);

    await userEvent.click(await screen.findByRole('button', { name: /Copy payload url/i }));

    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(await screen.findByText('Payload URL copied to clipboard')).toBeInTheDocument();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('saves the auto-transition switch at once', async () => {
    mocked.getGitHub.mockResolvedValue(on);
    mocked.setGitHubAutoTransition.mockResolvedValue({ ...on, autoTransition: false });
    render(<GitHubIntegrationCard workspaceSlug="acme" />);

    const toggle = await screen.findByRole('switch', { name: 'Move tasks automatically' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);

    expect(mocked.setGitHubAutoTransition).toHaveBeenCalledWith('acme', false);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Move tasks automatically' })).toHaveAttribute('aria-checked', 'false'));
  });

  it('asks before regenerating the secret and shows the new one', async () => {
    const fresh = 'b2'.repeat(32);
    mocked.getGitHub.mockResolvedValue(on);
    mocked.regenerateGitHubSecret.mockResolvedValue({ ...on, secret: fresh });
    render(<GitHubIntegrationCard workspaceSlug="acme" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate secret' }));
    expect(mocked.regenerateGitHubSecret).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Regenerate secret' }));

    await waitFor(() => expect(mocked.regenerateGitHubSecret).toHaveBeenCalledWith('acme'));
    await userEvent.click(await screen.findByRole('button', { name: /Show secret/ }));
    expect(await screen.findByText(fresh)).toBeInTheDocument();
  });

  it('turns the integration off after confirmation', async () => {
    mocked.getGitHub.mockResolvedValue(on);
    mocked.disableGitHub.mockResolvedValue(off);
    render(<GitHubIntegrationCard workspaceSlug="acme" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Turn off GitHub integration' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));

    await waitFor(() => expect(mocked.disableGitHub).toHaveBeenCalledWith('acme'));
    expect(await screen.findByRole('button', { name: 'Enable GitHub integration' })).toBeInTheDocument();
  });

  it('shows a retryable error when loading fails', async () => {
    mocked.getGitHub.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(off);
    render(<GitHubIntegrationCard workspaceSlug="acme" />);

    expect(await screen.findByText(/could not load the GitHub integration/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Enable GitHub integration' })).toBeInTheDocument();
  });
});
