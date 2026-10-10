import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { addDays, toDateKey } from '@/features/tasks';
import MyWork from '../MyWork';

const me = { _id: 'me', name: 'Ada Lovelace' };
const dayKey = (offset: number) => `${toDateKey(addDays(new Date(), offset))}T00:00:00.000Z`;

const renderCard = (tasks: ReturnType<typeof makeTask>[]) =>
  render(
    <MemoryRouter>
      <MyWork tasks={tasks} userId="me" slug="acme" />
    </MemoryRouter>,
  );

describe('MyWork', () => {
  it('lists my open tasks under their urgency with a link to each task', () => {
    renderCard([
      makeTask({ _id: 'late', title: 'Pay invoice', deadline: dayKey(-3), assignees: [me] }),
      makeTask({ _id: 'now', title: 'Ship release', deadline: dayKey(0), assignees: [me], status: 'in-progress' }),
      makeTask({ _id: 'soon', title: 'Plan sprint', deadline: dayKey(3), assignees: [me] }),
      makeTask({ _id: 'far', title: 'Annual review', deadline: dayKey(60), assignees: [me] }),
    ]);

    expect(screen.getByRole('heading', { name: /my work/i })).toBeInTheDocument();
    for (const label of ['Overdue', 'Due today', 'This week', 'Later']) {
      expect(screen.getByRole('region', { name: new RegExp(`^${label}, 1$`) })).toBeInTheDocument();
    }
    const overdue = within(screen.getByRole('region', { name: 'Overdue, 1' }));
    expect(overdue.getByRole('link', { name: /Pay invoice/ })).toHaveAttribute('href', '/acme/tasks?task=late');
    // Overdue is stated in words as well as colour
    expect(overdue.getByText('(overdue)')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Due today, 1' })).getByText('In Progress')).toBeInTheDocument();
  });

  it('links "View all" to the tasks assigned to me', () => {
    renderCard([makeTask({ title: 'Mine', deadline: dayKey(1), assignees: [me] })]);
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/acme/tasks?assignedToMe=1');
  });

  it('says how many are hidden when there are more than eight', () => {
    renderCard(Array.from({ length: 11 }, (_, index) => makeTask({ title: `Task ${index}`, deadline: dayKey(index + 1), assignees: [me] })));
    expect(screen.getByText(/Showing 8 of 11/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Task \d/ })).toHaveLength(8);
  });

  it('shows an empty message and the completed count', () => {
    renderCard([makeTask({ status: 'completed', completedAt: new Date().toISOString(), assignees: [me] })]);
    expect(screen.getByText(/nothing is assigned to you/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View all' })).not.toBeInTheDocument();
    expect(screen.getByText('1 task completed by you in the last 7 days')).toBeInTheDocument();
  });
});
