import { act, render, screen } from '@testing-library/react';
import OfflineBanner from '../OfflineBanner';

const MESSAGE = /you're offline/i;

describe('OfflineBanner', () => {
  it('is hidden while online', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows on the offline event and hides again on online', () => {
    render(<OfflineBanner />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent(MESSAGE);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
