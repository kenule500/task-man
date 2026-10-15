import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import HelpPage from '../HelpPage';

jest.mock('@/components/AppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.setTimeout(30000);

const LocationProbe = () => <div data-testid="search">{useLocation().search}</div>;

const renderHelp = (url = '/demo/help') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <HelpPage />
      <LocationProbe />
    </MemoryRouter>,
  );

describe('HelpPage', () => {
  it('renders the search, topic chips and the FAQ list', () => {
    renderHelp();
    expect(screen.getByRole('heading', { level: 1, name: /help center/i })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search help/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Projects & sprints/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'What is a workspace?' })).toBeInTheDocument();
    expect(document.getElementById('shortcuts-heading')).toHaveTextContent('Shortcut reference');
  });

  it('filters by the search text, announces the count and keeps ?q= in sync', async () => {
    renderHelp();
    await userEvent.type(screen.getByRole('searchbox', { name: /search help/i }), 'burndown');

    expect(screen.getByRole('status')).toHaveTextContent(/1 answer for "burndown"/);
    expect(screen.getByRole('button', { name: /what is the burndown chart/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'What is a workspace?' })).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?q=burndown');

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByRole('searchbox', { name: /search help/i })).toHaveValue('');
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('starts from a ?q= deep link and highlights the matches', () => {
    renderHelp('/demo/help?q=invite');
    expect(screen.getByRole('searchbox', { name: /search help/i })).toHaveValue('invite');
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent?.toLowerCase()).toBe('invite');
  });

  it('shows an empty state with a contact hint when nothing matches', async () => {
    renderHelp();
    await userEvent.type(screen.getByRole('searchbox', { name: /search help/i }), 'zzzzqqq');

    expect(screen.getByRole('heading', { name: 'No answers found' })).toBeInTheDocument();
    expect(screen.getByText(/contact your workspace owner/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/0 answers/);

    await userEvent.click(screen.getByRole('button', { name: /clear search and filters/i }));
    expect(screen.getByRole('button', { name: 'What is a workspace?' })).toBeInTheDocument();
  });

  it('filters by topic chip', async () => {
    renderHelp();
    await userEvent.click(screen.getByRole('button', { name: /^Mobile & offline/ }));

    expect(screen.getByRole('button', { name: /^Mobile & offline/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /does taskman work offline/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'What is a workspace?' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^All topics/ }));
    expect(screen.getByRole('button', { name: 'What is a workspace?' })).toBeInTheDocument();
  });

  it('toggles an answer open and closed', async () => {
    renderHelp();
    const question = screen.getByRole('button', { name: 'What is a workspace?' });
    expect(question).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(question.getAttribute('aria-controls')!)!;
    expect(panel).not.toHaveAttribute('inert');
    expect(within(panel).getByText(/holds your projects, tasks and team/i)).toBeInTheDocument();

    await userEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('inert');
  });
});
