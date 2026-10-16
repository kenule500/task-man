import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewResult from '../components/ReviewResult';
import VerdictBadge from '../components/VerdictBadge';
import { review } from './fixtures';

jest.setTimeout(30000);

describe('VerdictBadge', () => {
  it.each([
    ['match', 'Match'],
    ['partial', 'Partial'],
    ['mismatch', 'Mismatch'],
  ] as const)('shows %s as a word with its tone', (verdict, label) => {
    render(<VerdictBadge verdict={verdict} />);
    const badge = screen.getByText(label);
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[data-verdict]')).toHaveAttribute('data-verdict', verdict);
    expect(badge.closest('span')?.className).toMatch(verdict === 'match' ? /success/ : verdict === 'partial' ? /warning/ : /danger/);
  });
});

describe('ReviewResult', () => {
  it('shows the verdict, the counts, the summary and who asked', () => {
    render(<ReviewResult review={review()} />);
    expect(screen.getByText('The pull request implements part of this ticket')).toBeInTheDocument();
    const counts = screen.getByText('Completed', { selector: 'dt' }).closest('div');
    expect(counts).toHaveTextContent('1');
    expect(counts).toHaveTextContent('of 2');
    expect(screen.getByText('Missing', { selector: 'dt' }).closest('div')).toHaveTextContent('1');
    expect(screen.getByText('Issues', { selector: 'dt' }).closest('div')).toHaveTextContent('2');
    expect(screen.getByText('The form exists but the error message is missing.')).toBeInTheDocument();
    expect(screen.getByText('Model qwen-max')).toBeInTheDocument();
    expect(screen.getByText('Requested by Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('acme/app#7')).toBeInTheDocument();
  });

  it('says so when a review was started automatically', () => {
    render(<ReviewResult review={review({ requestedBy: null })} />);
    expect(screen.getByText('Automatic review of a new commit')).toBeInTheDocument();
  });

  it('lists every criterion with its status and expands evidence and explanation on demand', async () => {
    render(<ReviewResult review={review()} />);
    const analysis = screen.getByRole('region', { name: 'Detailed analysis' });
    const rows = within(analysis).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Completed')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Missing')).toBeInTheDocument();

    expect(screen.queryByText('src/login.ts', { selector: 'code' })).toBeNull();
    const toggle = within(rows[0]).getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(rows[0]).getByText('src/login.ts')).toBeInTheDocument();
    expect(within(rows[0]).getByText('The form posts to /api/login.')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Implemented in the login form.')).toBeInTheDocument();

    await userEvent.click(within(rows[1]).getByRole('button'));
    expect(within(rows[1]).getByText('Nothing in the pull request shows this.')).toBeInTheDocument();
    expect(within(rows[1]).getByText('No error state is rendered.')).toBeInTheDocument();
  });

  it('groups the code issues by severity, most severe first', () => {
    render(<ReviewResult review={review()} />);
    const issues = screen.getByRole('region', { name: 'Code issues' });
    const headings = within(issues).getAllByRole('heading', { level: 5 }).map(heading => heading.textContent);
    expect(headings).toEqual(['High severity (1)', 'Low severity (1)']);
    expect(within(issues).getByText('The password is logged in clear text.')).toBeInTheDocument();
    expect(within(issues).getByText('src/login.ts:12')).toBeInTheDocument();
    expect(within(issues).getByText('Security')).toBeInTheDocument();
  });

  it('says when no code issue was found', () => {
    render(<ReviewResult review={review({ issues: [], counts: { met: 2, partial: 0, missing: 0, issues: 0 }, verdict: 'match' })} />);
    expect(screen.getByText('No code issues were found.')).toBeInTheDocument();
    expect(screen.getByText('The pull request implements this ticket')).toBeInTheDocument();
  });

  it('never hides that a review is partial, and names the files left out', () => {
    render(<ReviewResult review={review({ truncated: true, omittedFiles: ['pnpm-lock.yaml', 'src/big.ts (partly shown)'] })} />);
    const banner = screen.getByText('Partial review').closest('[role="status"]') as HTMLElement;
    expect(banner).toBeInTheDocument();
    expect(within(banner).getByText('pnpm-lock.yaml')).toBeInTheDocument();
    expect(within(banner).getByText('src/big.ts (partly shown)')).toBeInTheDocument();
  });

  it('caps a long list of omitted files and counts the rest', () => {
    const many = Array.from({ length: 20 }, (_, index) => `src/f${index}.ts`);
    render(<ReviewResult review={review({ truncated: true, omittedFiles: many })} />);
    expect(screen.getByText('and 8 more')).toBeInTheDocument();
    expect(screen.queryByText('src/f19.ts')).toBeNull();
  });

  it('does not show the partial banner for a complete review', () => {
    render(<ReviewResult review={review()} />);
    expect(screen.queryByText('Partial review')).toBeNull();
  });

  it('mentions partly met criteria', () => {
    render(<ReviewResult review={review({ counts: { met: 1, partial: 2, missing: 0, issues: 0 } })} />);
    expect(screen.getByText('2 partly met')).toBeInTheDocument();
  });
});
