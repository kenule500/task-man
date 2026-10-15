import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster, toast } from '../index';

jest.setTimeout(30000);

describe('Toaster', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => toast.clear());
    jest.useRealTimers();
  });

  it('renders toasts in a polite live region and dismisses them automatically', () => {
    render(<Toaster />);
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveAttribute('aria-live', 'polite');

    act(() => { toast.success('Task created'); });
    expect(screen.getByRole('status')).toHaveTextContent('Task created');

    act(() => { jest.advanceTimersByTime(4900); });
    expect(screen.getByText('Task created')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(200); });
    expect(screen.queryByText('Task created')).not.toBeInTheDocument();
  });

  it('announces errors as alerts and keeps them longer', () => {
    render(<Toaster />);
    act(() => { toast.error('Upload failed'); });
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');

    act(() => { jest.advanceTimersByTime(6000); });
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(2100); });
    expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
  });

  it('runs the action once and closes the toast', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onUndo = jest.fn();
    render(<Toaster />);
    act(() => { toast({ title: 'Task deleted', action: { label: 'Undo', onClick: onUndo } }); });

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Task deleted')).not.toBeInTheDocument();
  });

  it('pauses the countdown while hovered and resumes afterwards', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Toaster />);
    act(() => { toast({ title: 'Hover me', duration: 1000 }); });

    await user.hover(screen.getByText('Hover me'));
    act(() => { jest.advanceTimersByTime(5000); });
    expect(screen.getByText('Hover me')).toBeInTheDocument();

    await user.unhover(screen.getByText('Hover me'));
    act(() => { jest.advanceTimersByTime(1100); });
    expect(screen.queryByText('Hover me')).not.toBeInTheDocument();
  });

  it('can be dismissed manually, stays when duration is 0 and keeps at most four', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Toaster />);
    act(() => { toast({ title: 'Sticky', duration: 0 }); });
    act(() => { jest.advanceTimersByTime(60000); });
    expect(screen.getByText('Sticky')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Sticky')).not.toBeInTheDocument();

    act(() => { ['a', 'b', 'c', 'd', 'e'].forEach(title => toast({ title, duration: 0 })); });
    expect(screen.getAllByTestId('toast')).toHaveLength(4);
    expect(screen.queryByText('a')).not.toBeInTheDocument();
  });
});
