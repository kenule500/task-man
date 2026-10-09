import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MoveTaskSheet from '../components/MoveTaskSheet';
import { makeTask } from './fixtures';

jest.setTimeout(30000);

const counts = { pending: 4, 'in-progress': 2, completed: 7 };

describe('MoveTaskSheet', () => {
  it('lists the three states with counts and marks the current one', async () => {
    const task = makeTask({ title: 'Sheet task', status: 'in-progress' });
    render(<MoveTaskSheet open onOpenChange={jest.fn()} task={task} counts={counts} onMove={jest.fn()} />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Sheet task')).toBeInTheDocument();
    const pending = screen.getByRole('button', { name: /^Pending/ });
    expect(pending).toHaveTextContent('4');
    expect(pending.className).toContain('min-h-14');
    expect(screen.getByRole('button', { name: /^In Progress/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /^In Progress/ })).toHaveTextContent('(current)');
    expect(screen.getByRole('button', { name: /^Completed/ })).not.toHaveAttribute('aria-current');
  });

  it('moves the task and closes on selection', async () => {
    const onMove = jest.fn();
    const onOpenChange = jest.fn();
    const task = makeTask({ status: 'pending' });
    render(<MoveTaskSheet open onOpenChange={onOpenChange} task={task} counts={counts} onMove={onMove} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Completed/ }));
    expect(onMove).toHaveBeenCalledWith(task, 'completed');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('just closes when the current state is chosen', async () => {
    const onMove = jest.fn();
    const onOpenChange = jest.fn();
    const task = makeTask({ status: 'pending' });
    render(<MoveTaskSheet open onOpenChange={onOpenChange} task={task} counts={counts} onMove={onMove} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Pending/ }));
    expect(onMove).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
