import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { notificationsApi } from '../api';
import NotificationBell from '../components/NotificationBell';
import { POLL_INTERVAL_MS, useNotificationFeed } from '../hooks/useNotificationFeed';
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
    </MemoryRouter>,
  );

const unread = makeNotification({ _id: 'n1' });
const mention = makeNotification({
  _id: 'n2', type: 'comment.mention', readAt: null, actor: { _id: 'u-bo', name: 'Bo' },
  task: { _id: 't2', title: 'Write docs', number: 3, key: 'WEB-3' },
});
const read = makeNotification({
  _id: 'n3', type: 'task.completed', readAt: new Date().toISOString(), actor: { _id: 'u-cy', name: 'Cy' },
  task: { _id: 't3', title: 'Ship it', number: 4, key: 'WEB-4' },
});

beforeEach(() => {
  mockedApi.list.mockResolvedValue(makePage([unread, mention, read]));
  mockedApi.markRead.mockResolvedValue({ unreadCount: 1 });
  mockedApi.markAllRead.mockResolvedValue({ unreadCount: 0 });
});

describe('NotificationBell', () => {
  it('shows the unread count in its accessible name', async () => {
    renderBell();
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    expect(bell).toHaveTextContent('2');
  });

  it('is just "Notifications" when everything is read', async () => {
    mockedApi.list.mockResolvedValue(makePage([read]));
    renderBell();
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('lists the latest notifications as sentences with relative time and unread markers', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications, 2 unread/ }));

    const list = await screen.findByRole('list', { name: 'Latest notifications' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Ada assigned you WEB-12 Fix login')).toBeInTheDocument();
    expect(within(rows[0]).getByText('5 minutes ago')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Unread')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Bo mentioned you in WEB-3 Write docs')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Cy completed WEB-4 Ship it')).toBeInTheDocument();
    expect(within(rows[2]).queryByText('Unread')).not.toBeInTheDocument();
  });

  it('marks a notification read and opens its task when clicked', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications, 2 unread/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Ada assigned you WEB-12 Fix login/ }));

    expect(mockedApi.markRead).toHaveBeenCalledWith('n1');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/demo/tasks?task=t1'));
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
  });

  it('marks everything as read', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications, 2 unread/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    expect(mockedApi.markAllRead).toHaveBeenCalled();
    // The page behind the open panel is inert, so it is hidden from the accessibility tree
    expect(await screen.findByRole('button', { name: 'Notifications', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });

  it('links to the inbox', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }));
    expect(await screen.findByRole('link', { name: 'View all' })).toHaveAttribute('href', '/demo/inbox');
  });

  it('says so when there is nothing yet, and offers a retry on failure', async () => {
    mockedApi.list.mockResolvedValueOnce(makePage([]));
    const { unmount } = renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('You are all caught up')).toBeInTheDocument();
    unmount();

    mockedApi.list.mockRejectedValueOnce(new Error('offline'));
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your notifications.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('useNotificationFeed polling', () => {
  const setHidden = (hidden: boolean) =>
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    setHidden(false);
    jest.useRealTimers();
  });

  it('refetches every minute while visible, skips while hidden and refetches on focus', async () => {
    renderHook(() => useNotificationFeed());
    await act(async () => { await Promise.resolve(); });
    expect(mockedApi.list).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(POLL_INTERVAL_MS); });
    expect(mockedApi.list).toHaveBeenCalledTimes(2);

    setHidden(true);
    await act(async () => { jest.advanceTimersByTime(POLL_INTERVAL_MS * 3); });
    expect(mockedApi.list).toHaveBeenCalledTimes(2);

    setHidden(false);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mockedApi.list).toHaveBeenCalledTimes(3);
  });

  it('stops polling when unmounted', async () => {
    const { unmount } = renderHook(() => useNotificationFeed());
    await act(async () => { await Promise.resolve(); });
    unmount();
    await act(async () => { jest.advanceTimersByTime(POLL_INTERVAL_MS * 2); });
    expect(mockedApi.list).toHaveBeenCalledTimes(1);
  });
});
