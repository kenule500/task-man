import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import GetStartedChecklist from '../GetStartedChecklist';
import { buildChecklist } from '../getStarted';

// react-router needs TextEncoder, which jsdom lacks: a plain anchor is enough here
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

const renderChecklist = (input: Parameters<typeof buildChecklist>[0]) =>
  render(<GetStartedChecklist steps={buildChecklist(input)} workspaceSlug="acme" />);

describe('GetStartedChecklist', () => {
  it('lists the three steps with links for the open ones', () => {
    renderChecklist({ taskCount: 0, memberCount: 1, boardTried: false, canInvite: true });
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create task' })).toHaveAttribute('href', '/acme/tasks?view=list');
    expect(screen.getByRole('link', { name: 'Invite teammate' })).toHaveAttribute('href', '/acme/team');
    expect(screen.getByRole('link', { name: 'Open board' })).toHaveAttribute('href', '/acme/tasks?view=board');
  });

  it('ticks steps that real data already satisfies', () => {
    renderChecklist({ taskCount: 4, memberCount: 3, boardTried: false, canInvite: true });
    expect(screen.getByText('2 of 3 done')).toBeInTheDocument();
    expect(screen.getByText('Create your first task')).toHaveTextContent('(done)');
    expect(screen.queryByRole('link', { name: 'Create task' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
  });
});
