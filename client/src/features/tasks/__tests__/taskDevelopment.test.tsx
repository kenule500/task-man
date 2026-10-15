import { render, screen, within } from '@testing-library/react';
import TaskDevelopment from '../components/TaskDevelopment';
import { groupDevelopmentLinks, safeLinkHref, shortSha } from '../lib/development';
import type { TaskLink } from '../types';
import { makeTask } from './fixtures';

const link = (overrides: Partial<TaskLink>): TaskLink => ({
  provider: 'github',
  kind: 'pull_request',
  url: 'https://github.com/acme/app/pull/1',
  title: 'Add login',
  repo: 'acme/app',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

describe('development lib', () => {
  it('groups links and puts open pull requests first, newest commits first', () => {
    const groups = groupDevelopmentLinks([
      link({ url: 'https://github.com/acme/app/pull/1', state: 'merged', number: 1 }),
      link({ url: 'https://github.com/acme/app/pull/2', state: 'open', number: 2 }),
      link({ url: 'https://github.com/acme/app/pull/3', state: 'closed', number: 3 }),
      link({ kind: 'commit', url: 'https://github.com/acme/app/commit/a', sha: 'a'.repeat(40), updatedAt: '2026-10-01T09:00:00.000Z' }),
      link({ kind: 'commit', url: 'https://github.com/acme/app/commit/b', sha: 'b'.repeat(40), updatedAt: '2026-10-02T09:00:00.000Z' }),
      link({ kind: 'branch', url: 'https://github.com/acme/app/tree/x', title: 'x' }),
    ]);
    expect(groups.pullRequests.map(item => item.number)).toEqual([2, 1, 3]);
    expect(groups.commits.map(item => item.sha?.[0])).toEqual(['b', 'a']);
    expect(groups.branches).toHaveLength(1);
    expect(groupDevelopmentLinks(undefined)).toEqual({ pullRequests: [], commits: [], branches: [] });
  });

  it('shortens shas and only accepts github.com https links', () => {
    expect(shortSha('1234567890abcdef')).toBe('1234567');
    expect(shortSha(undefined)).toBe('');
    expect(safeLinkHref('https://github.com/acme/app')).toBe('https://github.com/acme/app');
    expect(safeLinkHref('javascript:alert(1)')).toBeNull();
    expect(safeLinkHref('https://evil.example/github.com')).toBeNull();
    expect(safeLinkHref('not a url')).toBeNull();
  });
});

describe('TaskDevelopment', () => {
  it('explains how to link work when there is nothing yet', () => {
    render(<TaskDevelopment task={makeTask({ number: 12 })} />);
    const section = screen.getByRole('region', { name: 'Development' });
    expect(section).toHaveTextContent('TM-12');
    expect(section).toHaveTextContent(/branch name, commit message or pull request/i);
  });

  it('lists pull requests with a state label, commits with a short sha and branches', () => {
    const task = makeTask({
      number: 12,
      links: [
        link({ state: 'merged', number: 7, title: 'Add login form' }),
        link({ kind: 'commit', url: 'https://github.com/acme/app/commit/abc', sha: 'abcdef1234567890', title: 'TM-12 wire the form' }),
        link({ kind: 'branch', url: 'https://github.com/acme/app/tree/tm-12-login', title: 'tm-12-login' }),
      ],
    });
    render(<TaskDevelopment task={task} />);

    const prs = screen.getByRole('heading', { name: /Pull requests/ }).nextElementSibling as HTMLElement;
    expect(within(prs).getByText('Merged')).toBeInTheDocument();
    const prLink = within(prs).getByRole('link', { name: /Add login form/ });
    expect(prLink).toHaveAttribute('href', 'https://github.com/acme/app/pull/1');
    expect(prLink).toHaveAttribute('target', '_blank');
    expect(prLink).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByText('abcdef1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /TM-12 wire the form/ })).toHaveAttribute('href', 'https://github.com/acme/app/commit/abc');
    expect(screen.getByRole('link', { name: /tm-12-login/ })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never renders a link that is not on github.com as an anchor', () => {
    render(<TaskDevelopment task={makeTask({ links: [link({ url: 'javascript:alert(1)', title: 'Sneaky' })] })} />);
    expect(screen.getByText('Sneaky')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
