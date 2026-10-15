import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster, toast } from '@/components/ds';
import { notificationsApi } from '../api';
import NotificationBell from '../components/NotificationBell';
import { announceNotificationsChanged } from '../hooks/useNotificationFeed';
import { makeNotification, makePage } from './fixtures';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  notificationsApi: { list: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() },
}));

const mockedApi = notificationsApi as jest.Mocked<typeof notificationsApi>;

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
};

const renderBell = () =>
  render(
    <MemoryRouter initialEntries={['/demo/dashboard']}>
      <Where />
      <Routes>
        <Route path="*" element={<NotificationBell slug="demo" />} />
      </Routes>
      <Toaster />
    </MemoryRouter>,
  );

const setHidden = (hidden: boolean) =>
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const existing = makeNotification({ _id: 'old', createdAt: minutesAgo(30) });
const fresh = (id: string, actor: string, minutes = 0) => makeNotification({
  _id: id,
  createdAt: minutesAgo(minutes),
  actor: { _id: `u-${actor}`, name: actor },
  task: { _id: `t-${id}`, title: `Task ${id}`, number: 1, key: 'WEB-1' },
});

/** The window regaining focus refetches, like the next poll. */
const poll = async () => {
  await act(async () => { window.dispatchEvent(new Event('focus')); });
};

beforeEach(() => {
  toast.clear();
  mockedApi.list.mockResolvedValue(makePage([existing]));
  mockedApi.markRead.mockResolvedValue({ unreadCount: 0 });
});
afterEach(() => setHidden(false));

describe('NotificationBell toasts', () => {
  it('stays quiet on the first load and when nothing new arrived', async () => {
    renderBell();
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await poll();
    await poll();
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('toasts a notification that arrives later, and Open marks it read and goes to the task', async () => {
    renderBell();
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });

    const arrived = fresh('n-new', 'Dana');
    mockedApi.list.mockResolvedValue(makePage([arrived, existing]));
    await poll();

    const toasts = await screen.findAllByTestId('toast');
    expect(toasts).toHaveLength(1);
    expect(within(toasts[0]).getByText('Dana assigned you WEB-1 Task n-new')).toBeInTheDocument();

    await userEvent.click(within(toasts[0]).getByRole('button', { name: 'Open' }));
    expect(mockedApi.markRead).toHaveBeenCalledWith('n-new');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/demo/tasks?task=t-n-new'));
  });

  it('does not toast the same notification twice', async () => {
    renderBell();
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    mockedApi.list.mockResolvedValue(makePage([fresh('n-new', 'Dana'), existing]));
    await poll();
    expect(await screen.findAllByTestId('toast')).toHaveLength(1);
    act(() => toast.clear());
    await poll();
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('shows at most three toasts and folds the rest into "+N more"', async () => {
    renderBell();
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });

    const arrived = ['a', 'b', 'c', 'd', 'e'].map((id, index) => fresh(`n-${id}`, id.toUpperCase(), 5 - index));
    mockedApi.list.mockResolvedValue(makePage([...arrived].reverse().concat(existing)));
    await poll();

    const toasts = await screen.findAllByTestId('toast');
    expect(toasts).toHaveLength(4);
    expect(toasts[3]).toHaveTextContent('+2 more notifications');
    await userEvent.click(within(toasts[3]).getByRole('button', { name: 'View all' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/demo/inbox'));
  });

  it('skips toasts while the tab is hidden (push covers it) and never shows them later', async () => {
    renderBell();
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });

    mockedApi.list.mockResolvedValue(makePage([fresh('n-new', 'Dana'), existing]));
    setHidden(true);
    await act(async () => { announceNotificationsChanged('elsewhere'); });
    await waitFor(() => expect(mockedApi.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();

    setHidden(false);
    await poll();
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('does not toast notifications that are already read or that only slide into the window', async () => {
    renderBell();
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });

    const readOne = { ...fresh('n-read', 'Eli'), readAt: new Date().toISOString() };
    const older = fresh('n-older', 'Fay', 120);
    mockedApi.list.mockResolvedValue(makePage([readOne, existing, older]));
    await poll();
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });
});
