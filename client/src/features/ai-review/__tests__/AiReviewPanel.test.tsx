import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { aiReviewApi } from '../api';
import AiReviewPanel from '../components/AiReviewPanel';
import type { TaskLink } from '@/features/tasks/types';
import { review, settings } from './fixtures';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  aiReviewApi: {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    run: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
  },
}));

const api = aiReviewApi as jest.Mocked<typeof aiReviewApi>;

const link = (overrides: Partial<TaskLink> = {}): TaskLink => ({
  provider: 'github', kind: 'pull_request', url: 'https://github.com/acme/app/pull/7', title: 'Add login', number: 7, state: 'open',
  repo: 'acme/app', updatedAt: '2026-10-16T09:00:00.000Z', ...overrides,
});

const renderPanel = (props: { links?: TaskLink[]; canWrite?: boolean; slug?: string | undefined } = {}) => {
  const { links = [link()], canWrite = true, slug = 'acme' } = props;
  return render(
    <MemoryRouter>
      <AiReviewPanel task={{ _id: 'task-1', links, acceptanceCriteria: [{ _id: 'c1' }] }} taskKey="WEB-12" workspaceSlug={slug || undefined} canWrite={canWrite} />
    </MemoryRouter>,
  );
};

const runButton = () => screen.findByRole('button', { name: /Run AI review|Run again/ });

beforeEach(() => {
  api.getSettings.mockResolvedValue(settings());
  api.list.mockResolvedValue([]);
  api.get.mockImplementation(async (_slug, _task, id) => review({ _id: id }));
});

describe('AiReviewPanel', () => {
  it('renders nothing without a workspace', () => {
    const { container } = renderPanel({ slug: '' });
    expect(container).toBeEmptyDOMElement();
    expect(api.getSettings).not.toHaveBeenCalled();
  });

  it('starts with the linked pull request and then shows the progress', async () => {
    api.run.mockResolvedValue(review({ _id: 'r9', status: 'queued', createdAt: new Date().toISOString(), verdict: null, summary: '', criteria: undefined, issues: undefined }));
    renderPanel();
    expect(await screen.findByText('No review has been run for this task yet.')).toBeInTheDocument();

    await userEvent.click(await runButton());
    expect(api.run).toHaveBeenCalledWith('acme', 'task-1', 'https://github.com/acme/app/pull/7');
    expect(await screen.findByText('Waiting to start...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review in progress/ })).toBeDisabled();
  });

  it('polls until the review is done, then shows the result with its details', async () => {
    api.run.mockResolvedValue(review({ _id: 'r9', status: 'queued', createdAt: new Date().toISOString(), verdict: null, summary: '', criteria: undefined, issues: undefined }));
    api.list
      .mockResolvedValueOnce([])
      .mockResolvedValue([review({ _id: 'r9', createdAt: new Date().toISOString() })]);
    renderPanel();
    await userEvent.click(await runButton());

    expect(await screen.findByTestId('review-result', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('acme', 'task-1', 'r9');
    expect(await screen.findByText('The password is logged in clear text.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run again/ })).toBeEnabled();
  });

  it('shows the error of a failed review', async () => {
    api.list.mockResolvedValue([review({ _id: 'r2', status: 'failed', verdict: null, summary: '', error: 'GitHub did not find this pull request.' })]);
    renderPanel();
    expect(await screen.findByText('The review could not be completed')).toBeInTheDocument();
    expect(screen.getByText('GitHub did not find this pull request.')).toBeInTheDocument();
  });

  it('is disabled with an explanation when the server has no key', async () => {
    api.getSettings.mockResolvedValue(settings({ available: false, enabled: false }));
    renderPanel();
    const button = await runButton();
    await waitFor(() => expect(button).toBeDisabled());
    expect(await screen.findByText(/not configured for this workspace/)).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription(/not configured for this workspace/);
  });

  it('AC-032: is disabled with an explanation when the workspace has not opted in', async () => {
    api.getSettings.mockResolvedValue(settings({ enabled: false }));
    renderPanel();
    const button = await runButton();
    await waitFor(() => expect(button).toBeDisabled());
    expect(await screen.findByText(/turned off for this workspace/)).toBeInTheDocument();
  });

  it('AC-032/AC-033: is disabled for people who cannot edit tasks, but they still see earlier results', async () => {
    api.list.mockResolvedValue([review()]);
    renderPanel({ canWrite: false });
    expect(await screen.findByTestId('review-result')).toBeInTheDocument();
    const button = await runButton();
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByText('You need permission to edit tasks to run a review.')).toBeInTheDocument();
  });

  it('asks for a pull request address when none is linked, and validates it', async () => {
    api.run.mockResolvedValue(review({ _id: 'r9', status: 'queued', createdAt: new Date().toISOString(), verdict: null, summary: '' }));
    renderPanel({ links: [] });
    const input = await screen.findByLabelText('Pull request address');
    expect(await screen.findByText(/No pull request is linked yet. Mention WEB-12/)).toBeInTheDocument();
    const button = await runButton();
    expect(button).toBeDisabled();

    await userEvent.type(input, 'https://example.com/x');
    expect(await screen.findByText(/Use an address like/)).toBeInTheDocument();
    expect(button).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, 'https://github.com/acme/app/pull/9');
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(api.run).toHaveBeenCalledWith('acme', 'task-1', 'https://github.com/acme/app/pull/9');
  });

  it('shows a refusal from the server next to the button', async () => {
    api.run.mockRejectedValue({ response: { status: 429, data: { message: 'This workspace has used its 50 AI reviews for today.' } } });
    renderPanel();
    await userEvent.click(await runButton());
    expect(await screen.findByText('This workspace has used its 50 AI reviews for today.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run AI review/ })).toBeEnabled();
  });

  it('lists the previous runs and switches between them', async () => {
    api.list.mockResolvedValue([
      review({ _id: 'new', verdict: 'match', summary: 'Newest summary.' }),
      review({ _id: 'old', verdict: 'mismatch', createdAt: '2026-10-15T10:00:00.000Z', completedAt: '2026-10-15T10:01:00.000Z' }),
    ]);
    api.get.mockImplementation(async (_slug, _task, id) =>
      id === 'old' ? review({ _id: 'old', verdict: 'mismatch', summary: 'Older summary.' }) : review({ _id: 'new', verdict: 'match', summary: 'Newest summary.' }));
    renderPanel();
    expect(await screen.findByText('Newest summary.')).toBeInTheDocument();

    const history = screen.getByRole('region', { name: 'Previous runs' });
    const entries = within(history).getAllByRole('button');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveAttribute('aria-current', 'true');
    await userEvent.click(entries[1]);
    expect(await screen.findByText('Older summary.')).toBeInTheDocument();
  });

  it('can retry when the reviews do not load', async () => {
    api.list.mockRejectedValueOnce({ request: {} }).mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No review has been run for this task yet.')).toBeInTheDocument();
  });
});
