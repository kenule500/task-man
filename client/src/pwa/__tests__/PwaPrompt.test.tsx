import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PwaPrompt from '../PwaPrompt';
import { pwaState, updateServiceWorker } from '../../../test/pwa-register-react.stub';

describe('PwaPrompt', () => {
  afterEach(() => {
    pwaState.needRefresh = false;
    pwaState.offlineReady = false;
    jest.useRealTimers();
  });

  it('renders nothing when there is no update and no offline notice', () => {
    render(<PwaPrompt />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers a reload when a new version is available', async () => {
    pwaState.needRefresh = true;
    render(<PwaPrompt />);

    expect(screen.getByRole('status')).toHaveTextContent('New version available');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('dismisses the update notice with Later', async () => {
    pwaState.needRefresh = true;
    render(<PwaPrompt />);

    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('announces offline readiness and hides it after 4 seconds', () => {
    jest.useFakeTimers();
    pwaState.offlineReady = true;
    render(<PwaPrompt />);

    expect(screen.getByRole('status')).toHaveTextContent('Ready to work offline');
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
