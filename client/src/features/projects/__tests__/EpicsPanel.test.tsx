import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import EpicsPanel from '../components/EpicsPanel';
import { buildBurndown } from '../lib/burndown';
import { groupProjectTasks } from '../lib/grouping';
import { workProgress } from '../lib/sprintStats';
import { makeSprint } from './fixtures';

jest.setTimeout(30000);

const checkout = makeTask({
  _id: 'epic-1', title: 'Checkout revamp', type: 'epic', project: 'Web',
  startDate: '2026-10-05T00:00:00.000Z', deadline: '2026-12-01T00:00:00.000Z',
});
const search = makeTask({ _id: 'epic-2', title: 'Search', type: 'epic', project: 'Web' });
const items = [
  makeTask({ epic: 'epic-1', status: 'completed', storyPoints: 5, project: 'Web' }),
  makeTask({ epic: 'epic-1', status: 'in-progress', storyPoints: 3, project: 'Web' }),
  makeTask({ epic: 'epic-1', status: 'pending', storyPoints: 8, project: 'Web' }),
];

describe('EpicsPanel', () => {
  it('shows the rolled-up progress, counts and date span of each epic', () => {
    render(<EpicsPanel epics={[checkout, search]} tasks={[checkout, search, ...items]} canWrite onOpen={jest.fn()} />);

    const rows = within(screen.getByRole('list', { name: 'Epics' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('progressbar', { name: 'Checkout revamp progress' })).toHaveAttribute('aria-valuenow', '31');
    expect(rows[0]).toHaveTextContent('31%');
    expect(rows[0]).toHaveTextContent('1 of 3 items done, 5 of 16 points');
    expect(rows[0]).toHaveTextContent('Oct 5 – Dec 1, 2026');
    expect(within(rows[1]).getByRole('progressbar', { name: 'Search progress' })).toHaveAttribute('aria-valuenow', '0');
    expect(rows[1]).toHaveTextContent('No items yet');
  });

  it('opens the epic on click', async () => {
    const onOpen = jest.fn();
    render(<EpicsPanel epics={[checkout]} tasks={[checkout]} canWrite={false} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Checkout revamp' }));
    expect(onOpen).toHaveBeenCalledWith(checkout);
  });

  it('adds an epic by title, only with write access', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const { rerender } = render(<EpicsPanel epics={[]} tasks={[]} canWrite onOpen={jest.fn()} onAdd={onAdd} />);
    expect(screen.getByText('No epics yet')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: 'Add an epic…' }), 'Onboarding{enter}');
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Onboarding'));

    rerender(<EpicsPanel epics={[]} tasks={[]} canWrite={false} onOpen={jest.fn()} onAdd={onAdd} />);
    expect(screen.queryByRole('textbox', { name: 'Add an epic…' })).not.toBeInTheDocument();
  });
});

describe('epics are not sprint work', () => {
  it('stay out of the backlog and sprint lists', () => {
    const sprint = makeSprint();
    const groups = groupProjectTasks([checkout, ...items], [sprint]);
    expect(groups.backlog).toHaveLength(3);
    expect(groups.backlog).not.toContain(checkout);
  });

  it('are not counted in project progress or the burndown', () => {
    const sprint = makeSprint({ startDate: '2026-10-01', endDate: '2026-10-14' });
    const inSprint = makeTask({ sprint: sprint._id, storyPoints: 5, status: 'completed', completedAt: '2026-10-03T00:00:00.000Z' });
    const stray = makeTask({ type: 'epic', sprint: sprint._id, storyPoints: 40 });

    expect(workProgress([inSprint, stray, checkout])).toMatchObject({ totalTasks: 1, totalPoints: 5, donePoints: 5 });
    expect(buildBurndown(sprint, [inSprint, stray], new Date(2026, 9, 5)).total).toBe(5);
  });
});
