import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListView from '../views/ListView';
import type { TaskViewProps } from '../views/types';
import { makeTask } from './fixtures';

// Menus and dialogs are slow to open on constrained machines.
jest.setTimeout(30000);

const baseProps = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
});

const tasks = () => [
  makeTask({ _id: 'a', title: 'Alpha' }),
  makeTask({ _id: 'b', title: 'Beta' }),
  makeTask({ _id: 'c', title: 'Gamma' }),
  makeTask({ _id: 'd', title: 'Delta' }),
];

const table = () => within(screen.getByTestId('list-table'));
const box = (title: string) => table().getByRole('checkbox', { name: `Select "${title}"` });
const selectAll = () => table().getByRole('checkbox', { name: 'Select all tasks' });

describe('ListView bulk selection', () => {
  it('hides the selection controls without bulk callbacks', () => {
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} />);
    expect(screen.queryByRole('checkbox', { name: /^Select/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
  });

  it('hides the selection controls for a viewer (no write and no delete permission)', () => {
    render(
      <ListView tasks={tasks()} totalCount={4} {...baseProps()} canWrite={false} canDelete={false} onBulkUpdate={jest.fn()} onBulkDelete={jest.fn()} />,
    );
    expect(screen.queryByRole('checkbox', { name: /^Select/ })).not.toBeInTheDocument();
  });

  it('shows the bar with the count when a row is selected and clears it', async () => {
    const user = userEvent.setup();
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={jest.fn()} />);

    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    await user.click(box('Alpha'));
    await user.click(box('Gamma'));

    const bar = within(screen.getByTestId('bulk-action-bar'));
    expect(bar.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 tasks selected');

    await user.click(bar.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('selects all visible rows from the header checkbox, with an indeterminate state in between', async () => {
    const user = userEvent.setup();
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={jest.fn()} />);

    await user.click(box('Beta'));
    expect(selectAll()).toHaveAttribute('aria-checked', 'mixed');

    await user.click(selectAll());
    expect(selectAll()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('4 selected')).toBeInTheDocument();

    await user.click(selectAll());
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
  });

  it('selects a range with Shift+click', async () => {
    const user = userEvent.setup();
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={jest.fn()} />);

    await user.click(box('Alpha'));
    await user.keyboard('{Shift>}');
    await user.click(box('Gamma'));
    await user.keyboard('{/Shift}');

    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(box('Beta')).toBeChecked();
    expect(box('Delta')).not.toBeChecked();
  });

  it('clears the selection with Escape', async () => {
    const user = userEvent.setup();
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={jest.fn()} />);

    await user.click(box('Alpha'));
    expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
  });

  it('drops rows that disappear from the list from the selection', async () => {
    const user = userEvent.setup();
    const all = tasks();
    const { rerender } = render(<ListView tasks={all} totalCount={4} {...baseProps()} onBulkUpdate={jest.fn()} />);

    await user.click(box('Alpha'));
    await user.click(box('Beta'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    rerender(<ListView tasks={all.filter(task => task.title !== 'Alpha')} totalCount={4} {...baseProps()} onBulkUpdate={jest.fn()} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});

describe('ListView bulk actions', () => {
  it('applies a status to the selected ids', async () => {
    const user = userEvent.setup();
    const onBulkUpdate = jest.fn().mockResolvedValue(undefined);
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={onBulkUpdate} />);

    await user.click(box('Alpha'));
    await user.click(box('Delta'));
    await user.click(within(screen.getByTestId('bulk-action-bar')).getByRole('button', { name: /^Status/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Completed' }));

    await waitFor(() => expect(onBulkUpdate).toHaveBeenCalledWith(['a', 'd'], { status: 'completed' }));
    // The selection stays so several changes can follow each other
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('applies a priority and offers assignees only when members are given', async () => {
    const user = userEvent.setup();
    const onBulkUpdate = jest.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={onBulkUpdate} />);

    await user.click(box('Beta'));
    const bar = () => within(screen.getByTestId('bulk-action-bar'));
    expect(bar().queryByRole('button', { name: /^Assignee/ })).not.toBeInTheDocument();

    rerender(
      <ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={onBulkUpdate} members={[{ _id: 'u1', name: 'Ada Lovelace' }]} />,
    );
    await user.click(bar().getByRole('button', { name: /^Assignee/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ada Lovelace' }));
    await waitFor(() => expect(onBulkUpdate).toHaveBeenCalledWith(['b'], { assignees: { add: ['u1'] } }));
  });

  it('moves the selection to a sprint or the backlog', async () => {
    const user = userEvent.setup();
    const onBulkUpdate = jest.fn().mockResolvedValue(undefined);
    const projects = [{
      _id: 'p1', name: 'Website', key: 'WEB', color: 'blue', icon: 'folder', archived: false,
      sprints: [
        { _id: 's1', project: 'p1', name: 'Sprint 1', startDate: '2030-01-01', endDate: '2030-01-14', status: 'active' },
        { _id: 's0', project: 'p1', name: 'Old sprint', startDate: '2029-01-01', endDate: '2029-01-14', status: 'completed' },
      ],
    }] as never;
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={onBulkUpdate} projects={projects} />);

    await user.click(box('Alpha'));
    await user.click(within(screen.getByTestId('bulk-action-bar')).getByRole('button', { name: /^Sprint/ }));
    expect(screen.queryByRole('menuitem', { name: /Old sprint/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: /Sprint 1/ }));
    await waitFor(() => expect(onBulkUpdate).toHaveBeenCalledWith(['a'], { sprint: 's1' }));

    await user.click(within(screen.getByTestId('bulk-action-bar')).getByRole('button', { name: /^Sprint/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Backlog/ }));
    await waitFor(() => expect(onBulkUpdate).toHaveBeenLastCalledWith(['a'], { sprint: null }));
  });

  it('adds labels from the labels dialog', async () => {
    const user = userEvent.setup();
    const onBulkUpdate = jest.fn().mockResolvedValue(undefined);
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={onBulkUpdate} />);

    await user.click(box('Alpha'));
    await user.click(box('Beta'));
    await user.click(within(screen.getByTestId('bulk-action-bar')).getByRole('button', { name: /^Labels/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'urgent{Enter}');
    await user.click(within(dialog).getByRole('button', { name: /^Add 1 label/ }));

    await waitFor(() => expect(onBulkUpdate).toHaveBeenCalledWith(['a', 'b'], { labels: { add: ['urgent'] } }));
  });

  it('confirms before deleting, then deletes and clears the selection', async () => {
    const user = userEvent.setup();
    const onBulkDelete = jest.fn().mockResolvedValue(undefined);
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkUpdate={jest.fn()} onBulkDelete={onBulkDelete} />);

    await user.click(box('Beta'));
    await user.click(box('Gamma'));
    await user.click(within(screen.getByTestId('bulk-action-bar')).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete 2 tasks?')).toBeInTheDocument();
    expect(onBulkDelete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2 tasks' }));

    await waitFor(() => expect(onBulkDelete).toHaveBeenCalledWith(['b', 'c']));
    await waitFor(() => expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument());
  });

  it('keeps the selection when the delete fails', async () => {
    const user = userEvent.setup();
    const onBulkDelete = jest.fn().mockRejectedValue(new Error('nope'));
    render(<ListView tasks={tasks()} totalCount={4} {...baseProps()} onBulkDelete={onBulkDelete} />);

    await user.click(box('Beta'));
    await user.click(within(screen.getByTestId('bulk-action-bar')).getByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete 1 task' }));

    await waitFor(() => expect(onBulkDelete).toHaveBeenCalled());
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });

  it('hides Delete without tasks:delete and the edit controls without tasks:write', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ListView tasks={tasks()} totalCount={4} {...baseProps()} canDelete={false} onBulkUpdate={jest.fn()} onBulkDelete={jest.fn()} />,
    );
    await user.click(box('Alpha'));
    let bar = within(screen.getByTestId('bulk-action-bar'));
    expect(bar.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(bar.getByRole('button', { name: /^Status/ })).toBeInTheDocument();

    rerender(
      <ListView tasks={tasks()} totalCount={4} {...baseProps()} canWrite={false} onBulkUpdate={jest.fn()} onBulkDelete={jest.fn()} />,
    );
    bar = within(screen.getByTestId('bulk-action-bar'));
    expect(bar.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(bar.queryByRole('button', { name: /^Status/ })).not.toBeInTheDocument();
  });
});
