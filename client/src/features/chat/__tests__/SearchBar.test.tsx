import { fireEvent, render, screen } from '@testing-library/react';
import SearchBar from '../components/SearchBar';

const renderBar = (overrides: Partial<React.ComponentProps<typeof SearchBar>> = {}) => {
  const props = {
    term: 'deploy',
    counter: '2 of 7',
    hasResults: true,
    activeOptionId: 'chat-search-option-1',
    onChange: jest.fn(),
    onPrevious: jest.fn(),
    onNext: jest.fn(),
    onOpen: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  render(<SearchBar {...props} />);
  return props;
};

describe('SearchBar', () => {
  it('AC-070: is an inline bar with input, counter, arrows and close, not a popup', () => {
    renderBar();

    expect(screen.getByRole('combobox', { name: 'Search this channel' })).toHaveValue('deploy');
    expect(screen.getByText('2 of 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous match' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close search' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('AC-072: moves with the arrow keys and opens with Enter', () => {
    const props = renderBar();
    const input = screen.getByRole('combobox', { name: 'Search this channel' });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(props.onNext).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(props.onPrevious).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  it('AC-072: Shift+Enter steps back and Escape closes', () => {
    const props = renderBar();
    const input = screen.getByRole('combobox', { name: 'Search this channel' });

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(props.onPrevious).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('AC-075: exposes the active option and disables navigation without results', () => {
    const { unmount } = render(
      <SearchBar
        term=""
        counter="0 of 0"
        hasResults={false}
        onChange={jest.fn()}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        onOpen={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Search this channel' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Previous match' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    unmount();

    renderBar();
    expect(screen.getByRole('combobox', { name: 'Search this channel' }))
      .toHaveAttribute('aria-activedescendant', 'chat-search-option-1');
  });

  it('AC-070: reports typing to the caller', () => {
    const props = renderBar();
    fireEvent.change(screen.getByRole('combobox', { name: 'Search this channel' }), { target: { value: 'deployx' } });
    expect(props.onChange).toHaveBeenCalledWith('deployx');
  });
});
