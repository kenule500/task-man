import { fireEvent, render, screen } from '@testing-library/react';
import NewDirectMessage from '../components/NewDirectMessage';

const members = [
  { _id: 'me', name: 'Me' },
  { _id: 'ada', name: 'Ada Lovelace' },
  { _id: 'grace', name: 'Grace Hopper' },
];

describe('NewDirectMessage', () => {
  it('AC-065: is a full-height row, not a caption', () => {
    render(<NewDirectMessage members={members} currentUserId="me" canStartDirect onStartDirect={jest.fn()} />);

    const control = screen.getByRole('button', { name: 'New direct message' });
    expect(control).toHaveClass('min-h-11');
    expect(control).toHaveClass('text-sm');
  });

  it('AC-066: opens a labelled teammate list and marks its expanded state', async () => {
    const onStartDirect = jest.fn();
    render(<NewDirectMessage members={members} currentUserId="me" canStartDirect onStartDirect={onStartDirect} />);

    const control = screen.getByRole('button', { name: 'New direct message' });
    expect(control).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(control);
    expect(control).toHaveAttribute('aria-expanded', 'true');

    const list = screen.getByRole('list', { name: 'Teammates' });
    expect(list).toHaveTextContent('Ada Lovelace');
    expect(list).toHaveTextContent('Grace Hopper');
    // You never message yourself, so you are not offered
    expect(list).not.toHaveTextContent('Me');

    const option = screen.getByRole('button', { name: 'Ada Lovelace' });
    expect(option).toHaveClass('min-h-11');

    fireEvent.click(option);
    expect(onStartDirect).toHaveBeenCalledWith('ada');
    expect(control).toHaveAttribute('aria-expanded', 'false');
  });

  it('AC-066: renders nothing without permission or teammates', () => {
    const { unmount } = render(
      <NewDirectMessage members={members} currentUserId="me" canStartDirect={false} onStartDirect={jest.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'New direct message' })).not.toBeInTheDocument();
    unmount();

    render(<NewDirectMessage members={[{ _id: 'me', name: 'Me' }]} currentUserId="me" canStartDirect onStartDirect={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'New direct message' })).not.toBeInTheDocument();
  });
});
