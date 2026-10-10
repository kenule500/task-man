import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import NotificationsPage from '../NotificationsPage';

jest.setTimeout(30000);

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

const mockedApi = api as unknown as { get: jest.Mock; put: jest.Mock };

beforeEach(() => {
  mockedApi.get.mockResolvedValue({
    data: { notifications: { email: true, taskAssigned: true, taskCompleted: false, weeklyDigest: true, push: true } },
  });
  mockedApi.put.mockResolvedValue({ data: {} });
});

describe('NotificationsPage', () => {
  it('says in-app notifications are always on and describes what each email switch covers', async () => {
    render(<NotificationsPage />);
    expect(screen.getByRole('heading', { name: 'In the app' })).toBeInTheDocument();
    expect(screen.getByText(/Always on\./)).toBeInTheDocument();
    expect(screen.getByText(/mentions me in a comment/)).toBeInTheDocument();
    expect(screen.getByText(/Not sent yet/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Send me emails' })).toBeChecked());
  });

  it('keeps the switches working and saves them', async () => {
    render(<NotificationsPage />);
    const completed = screen.getByRole('switch', { name: 'Completed tasks' });
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(completed).not.toBeChecked();

    await userEvent.click(completed);
    expect(completed).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledWith('/profile/notifications', {
      email: true, taskAssigned: true, taskCompleted: true, weeklyDigest: true, push: true,
    }));
    expect(await screen.findByText('Notification preferences saved')).toBeInTheDocument();
  });

  it('warns that nothing is emailed once the main switch is off', async () => {
    render(<NotificationsPage />);
    const main = screen.getByRole('switch', { name: 'Send me emails' });
    await waitFor(() => expect(main).toBeChecked());
    await userEvent.click(main);
    expect(screen.getByText(/Email is off, so nothing below is sent/)).toBeInTheDocument();
  });

  it('has a push section with the device status and a saved preference switch', async () => {
    render(<NotificationsPage />);
    expect(screen.getByRole('heading', { name: 'Push' })).toBeInTheDocument();
    // jsdom has no PushManager, so this device is reported as unsupported (and nothing prompts)
    expect(await screen.findByText('Not available in this browser')).toBeInTheDocument();

    const push = screen.getByRole('switch', { name: 'Send me push notifications' });
    await waitFor(() => expect(push).toBeChecked());
    await userEvent.click(push);
    expect(push).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledWith('/profile/notifications', expect.objectContaining({ push: false })));
  });
});
