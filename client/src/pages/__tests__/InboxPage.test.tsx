import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { notificationsApi } from '@/features/notifications/api';
import { makeNotification, makePage } from '@/features/notifications/__tests__/fixtures';
import InboxPage from '../InboxPage';

jest.setTimeout(30000);

jest.mock('@/features/notifications/api', () => ({
  notificationsApi: { list: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() },
}));

const mockedApi = notificationsApi as jest.Mocked<typeof notificationsApi>;

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
};

const renderPage = (url = '/demo/inbox') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/:workspaceSlug/inbox" element={<InboxPage />} />
        <Route path="/:workspaceSlug/tasks" element={<p>Tasks page</p>} />
      </Routes>
    </MemoryRouter>,
  );

const first = makeNotification({ _id: 'n1' });
const second = makeNotification({
  _id: 'n2', type: 'comment.reply_on_my_task', readAt: new Date().toISOString(), actor: { _id: 'u-bo', name: 'Bo' },
  task: { _id: 't2', title: 'Write docs', number: 3, key: 'WEB-3' },
});

beforeEach(() => {
  mockedApi.list.mockResolvedValue(makePage([first, second]));
  mockedApi.markRead.mockResolvedValue({ unreadCount: 0 });
  mockedApi.markAllRead.mockResolvedValue({ unreadCount: 0 });
});

describe('InboxPage', () => {
  it('lists notifications under an Inbox heading', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Notifications' });
    expect(within(list).getByText('Ada assigned you WEB-12 Fix login')).toBeInTheDocument();
    expect(within(list).getByText('Bo commented on WEB-3 Write docs')).toBeInTheDocument();
  });

  it('filters to unread and keeps the filter in the URL', async () => {
    renderPage();
    await screen.findByRole('list', { name: 'Notifications' });

    mockedApi.list.mockResolvedValue(makePage([first]));
    await userEvent.click(screen.getByRole('radio', { name: /^Unread/ }));

    await waitFor(() => expect(mockedApi.list).toHaveBeenLastCalledWith({ unread: true, limit: 20 }));
    expect(screen.getByTestId('where')).toHaveTextContent('/demo/inbox?filter=unread');
    await waitFor(() => expect(screen.queryByText('Bo commented on WEB-3 Write docs')).not.toBeInTheDocument());
  });

  it('starts on the unread filter from the URL and explains an empty list', async () => {
    mockedApi.list.mockResolvedValue(makePage([]));
    renderPage('/demo/inbox?filter=unread');
    expect(await screen.findByText('Nothing unread')).toBeInTheDocument();
    expect(mockedApi.list).toHaveBeenCalledWith({ unread: true, limit: 20 });
  });

  it('loads older notifications with the cursor and hides the button on the last page', async () => {
    mockedApi.list.mockResolvedValueOnce(makePage([first], { nextBefore: 'cursor-1', unreadCount: 1 }));
    mockedApi.list.mockResolvedValueOnce(makePage([second], { nextBefore: null, unreadCount: 1 }));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Load older' }));

    expect(mockedApi.list).toHaveBeenLastCalledWith({ unread: false, limit: 20, before: 'cursor-1' });
    expect(await screen.findByText('Bo commented on WEB-3 Write docs')).toBeInTheDocument();
    expect(screen.getByText('Ada assigned you WEB-12 Fix login')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument();
  });

  it('opens the task of a notification and marks it read', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Ada assigned you/ }));
    expect(mockedApi.markRead).toHaveBeenCalledWith('n1');
    await waitFor(() => expect(screen.getByText('Tasks page')).toBeInTheDocument());
    expect(screen.getByTestId('where')).toHaveTextContent('/demo/tasks?task=t1');
  });

  it('marks all as read', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    expect(mockedApi.markAllRead).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled());
    expect(within(screen.getByRole('list', { name: 'Notifications' })).queryByText('Unread')).not.toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    mockedApi.list.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    expect(await screen.findByText('We could not load your notifications')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ada assigned you WEB-12 Fix login')).toBeInTheDocument();
  });
});
