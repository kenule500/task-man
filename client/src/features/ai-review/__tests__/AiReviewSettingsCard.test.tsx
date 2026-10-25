import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aiReviewApi } from '../api';
import AiReviewSettingsCard from '../components/AiReviewSettingsCard';
import { settings } from './fixtures';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  aiReviewApi: { getSettings: jest.fn(), updateSettings: jest.fn(), run: jest.fn(), list: jest.fn(), get: jest.fn() },
}));

const api = aiReviewApi as jest.Mocked<typeof aiReviewApi>;
const TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';

describe('AiReviewSettingsCard', () => {
  it('TEST-015 AC-015/AC-021/AC-031/AC-033: tells people their code goes to a third party before they can switch it on', async () => {
    api.getSettings.mockResolvedValue(settings({ enabled: false }));
    render(<AiReviewSettingsCard workspaceSlug="acme" />);
    expect(await screen.findByText('Your code is sent to a third party')).toBeInTheDocument();
    expect(screen.getByText(/AI provider \(qwen-max\), an outside processor/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Enable AI features' })).toHaveAttribute('aria-checked', 'false');
    // Auto review needs the feature on first
    expect(screen.getByRole('switch', { name: 'Review new commits automatically' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('TEST-031 AC-031/AC-032: turns the feature on and then auto review', async () => {
    api.getSettings.mockResolvedValue(settings({ enabled: false }));
    api.updateSettings.mockResolvedValueOnce(settings({ enabled: true })).mockResolvedValueOnce(settings({ enabled: true, autoReview: true }));
    render(<AiReviewSettingsCard workspaceSlug="acme" />);

    await userEvent.click(await screen.findByRole('switch', { name: 'Enable AI features' }));
    expect(api.updateSettings).toHaveBeenCalledWith('acme', { enabled: true });
    const auto = screen.getByRole('switch', { name: 'Review new commits automatically' });
    await waitFor(() => expect(auto).not.toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(auto);
    expect(api.updateSettings).toHaveBeenLastCalledWith('acme', { autoReview: true });
    await waitFor(() => expect(auto).toHaveAttribute('aria-checked', 'true'));
  });

  it('AC-024/AC-031: cannot be switched on while the server has no key', async () => {
    api.getSettings.mockResolvedValue(settings({ available: false, enabled: false }));
    render(<AiReviewSettingsCard workspaceSlug="acme" />);
    expect(await screen.findByText(/No usable AI provider is configured/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Enable AI features' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('TEST-021 AC-015/AC-021/AC-031: shows usage and the model', async () => {
    api.getSettings.mockResolvedValue(settings({ usedToday: 12, dailyLimit: 50 }));
    render(<AiReviewSettingsCard workspaceSlug="acme" />);
    expect(await screen.findByText('12 of 50 reviews')).toBeInTheDocument();
    expect(screen.getByText('Model: qwen-max')).toBeInTheDocument();
  });

  it('AC-025: saves the GitHub token write-only: the field is cleared and the token is never shown again', async () => {
    api.getSettings.mockResolvedValue(settings());
    api.updateSettings.mockResolvedValue(settings({ githubTokenSet: true }));
    render(<AiReviewSettingsCard workspaceSlug="acme" />);

    expect(await screen.findByText(/No token saved/)).toBeInTheDocument();
    const field = screen.getByLabelText('GitHub access token (private repositories)');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(field, TOKEN);
    await userEvent.click(screen.getByRole('button', { name: 'Save token' }));

    expect(api.updateSettings).toHaveBeenCalledWith('acme', { githubToken: TOKEN });
    expect(await screen.findByText('A token is saved.')).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveValue(''));
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(screen.getByRole('button', { name: 'Remove token' })).toBeInTheDocument();
  });

  it('AC-025/AC-030: rejects something that is not a token without calling the API', async () => {
    api.getSettings.mockResolvedValue(settings());
    render(<AiReviewSettingsCard workspaceSlug="acme" />);
    await userEvent.type(await screen.findByLabelText('GitHub access token (private repositories)'), 'not a token');
    await userEvent.click(screen.getByRole('button', { name: 'Save token' }));
    expect(await screen.findByText('That does not look like a GitHub token.')).toBeInTheDocument();
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('AC-025: removes a saved token', async () => {
    api.getSettings.mockResolvedValue(settings({ githubTokenSet: true }));
    api.updateSettings.mockResolvedValue(settings({ githubTokenSet: false }));
    render(<AiReviewSettingsCard workspaceSlug="acme" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove token' }));
    expect(api.updateSettings).toHaveBeenCalledWith('acme', { githubToken: null });
    expect(await screen.findByText(/No token saved/)).toBeInTheDocument();
  });

  it('AC-024/AC-030: shows the server message when a change is refused, and lets the load be retried', async () => {
    api.getSettings.mockRejectedValueOnce({ request: {} }).mockResolvedValue(settings());
    render(<AiReviewSettingsCard workspaceSlug="acme" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    api.updateSettings.mockRejectedValue({ response: { status: 403, data: { message: 'You do not have permission to do that.' } } });
    await userEvent.click(await screen.findByRole('switch', { name: 'Enable AI features' }));
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
  });
});
