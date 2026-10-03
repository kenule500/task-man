import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DueDate, PriorityIndicator, StatusBadge } from '../components/TaskBadges';
import { InlineText } from '../components/InlineEdit';
import EmptyState from '../components/EmptyState';

describe('TaskBadges', () => {
  it('renders human labels for status and priority', () => {
    render(<><StatusBadge status="in-progress" /><PriorityIndicator priority="high" /></>);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('announces overdue dates for unfinished tasks only', () => {
    const { rerender } = render(<DueDate deadline="2000-01-01" />);
    expect(screen.getByText('(overdue)')).toBeInTheDocument();

    rerender(<DueDate deadline="2000-01-01" completed />);
    expect(screen.queryByText('(overdue)')).not.toBeInTheDocument();
  });
});

describe('InlineText', () => {
  it('saves a trimmed value on Enter', async () => {
    const onSave = jest.fn();
    render(<InlineText value="Old title" label="Rename task" onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Old title' }));
    const input = screen.getByRole('textbox', { name: 'Rename task' });
    await userEvent.clear(input);
    await userEvent.type(input, '  New title  {Enter}');

    expect(onSave).toHaveBeenCalledWith('New title');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cancels on Escape and ignores empty or unchanged values', async () => {
    const onSave = jest.fn();
    render(<InlineText value="Keep me" label="Rename task" onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Keep me' }));
    await userEvent.type(screen.getByRole('textbox'), ' edited{Escape}');
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Keep me' }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Keep me' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders the message and an optional action', () => {
    render(<EmptyState title="No tasks" description="Create one" action={<button>Add task</button>} />);
    expect(screen.getByRole('heading', { name: 'No tasks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
  });
});
