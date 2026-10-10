import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeProject, makeSprint } from '@/features/projects/__tests__/fixtures';
import ScopeBar from '../components/ScopeBar';

const active = makeSprint({
  _id: 's2', project: 'p1', name: 'Sprint 2', status: 'active', goal: 'Ship the board to every team',
  startDate: '2026-01-01T00:00:00.000Z', endDate: '2099-01-14T00:00:00.000Z',
});
const planned = makeSprint({ _id: 's3', project: 'p1', name: 'Sprint 3', status: 'planned' });
const web = makeProject({ _id: 'p1', name: 'Web', sprints: [active, planned] });

const renderBar = (filters: { project?: string; sprint?: string }, onClear = jest.fn()) => {
  render(
    <MemoryRouter>
      <ScopeBar slug="acme" filters={filters} projects={[web]} onClear={onClear} />
    </MemoryRouter>,
  );
  return onClear;
};

describe('ScopeBar', () => {
  it('renders nothing without a scope', () => {
    renderBar({ project: 'all', sprint: 'all' });
    expect(screen.queryByTestId('scope-bar')).not.toBeInTheDocument();
  });

  it('shows the project as a link to its page', () => {
    renderBar({ project: 'web', sprint: 'all' });
    expect(screen.getByRole('link', { name: 'Web' })).toHaveAttribute('href', '/acme/projects/p1');
    expect(screen.queryByRole('link', { name: /Sprint report/ })).not.toBeInTheDocument();
  });

  it('shows the active sprint with status, dates, goal, time left and its report', () => {
    renderBar({ project: 'Web', sprint: 'active' });
    expect(screen.getByText('Sprint 2')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/days left/)).toBeInTheDocument();
    expect(screen.getByText(/Ship the board/)).toHaveAttribute('title', 'Ship the board to every team');
    expect(screen.getByRole('link', { name: 'Sprint report for Sprint 2' })).toHaveAttribute('href', '/acme/projects/p1/sprints/s2/report');
  });

  it('finds the project from a sprint id and has no report for a planned sprint', () => {
    renderBar({ project: 'all', sprint: 's3' });
    expect(screen.getByRole('link', { name: 'Web' })).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sprint report/ })).not.toBeInTheDocument();
  });

  it('labels the backlog and a project without a running sprint', () => {
    renderBar({ project: 'Web', sprint: 'backlog' });
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('says so when no sprint is running', () => {
    render(
      <MemoryRouter>
        <ScopeBar slug="acme" filters={{ project: 'Web', sprint: 'active' }} projects={[{ ...web, sprints: [planned] }]} onClear={jest.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('No sprint is running')).toBeInTheDocument();
  });

  it('clears the scope with the x button', async () => {
    const onClear = renderBar({ project: 'Web', sprint: 'active' });
    await userEvent.click(screen.getByRole('button', { name: 'Clear project and sprint scope' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
