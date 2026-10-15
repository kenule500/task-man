import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DueDate, PriorityIndicator, StatusBadge } from '../components/TaskBadges';
import { InlineText } from '../components/InlineEdit';
import TaskActionsMenu from '../components/TaskActionsMenu';
import { makeTask } from './fixtures';
import { EmptyState } from '@/components/ds';

// Menus open slowly on constrained machines.
jest.setTimeout(30000);

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

describe('TaskActionsMenu', () => {
  it('has a 40px touch target and a "Move to" radio group with the current state checked', async () => {
    const onMove = jest.fn();
    const task = makeTask({ title: 'Menu task', status: 'in-progress' });
    render(<TaskActionsMenu task={task} onEdit={jest.fn()} onDelete={jest.fn()} onMove={onMove} />);

    const trigger = screen.getByRole('button', { name: 'Actions for Menu task' });
    expect(trigger.className).toContain('size-10');

    await userEvent.click(trigger);
    const radios = await screen.findAllByRole('menuitemradio');
    expect(radios.map(radio => radio.textContent)).toEqual(['Pending', 'In Progress', 'Completed']);
    expect(screen.getByRole('menuitemradio', { name: 'In Progress' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Pending' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Pending' }));
    expect(onMove).toHaveBeenCalledWith(task, 'pending');
  });

  it('offers "Move to…" for the sheet when a handler is given', async () => {
    const onOpenMoveSheet = jest.fn();
    const task = makeTask({ title: 'Sheet menu' });
    render(<TaskActionsMenu task={task} onEdit={jest.fn()} onDelete={jest.fn()} onMove={jest.fn()} onOpenMoveSheet={onOpenMoveSheet} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Sheet menu' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /move to…/i }));
    expect(onOpenMoveSheet).toHaveBeenCalledWith(task);
  });

  it('omits "Move to" without a handler or without write access', async () => {
    const { unmount } = render(<TaskActionsMenu task={makeTask({ title: 'Plain' })} onEdit={jest.fn()} onDelete={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Plain' }));
    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
    unmount();

    render(<TaskActionsMenu task={makeTask({ title: 'Locked' })} onEdit={jest.fn()} onDelete={jest.fn()} onMove={jest.fn()} onOpen={jest.fn()} canEdit={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Locked' }));
    expect(await screen.findByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  });
});
