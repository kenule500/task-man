import type { AppNotification, NotificationPage } from '../types';

export const makeNotification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  _id: 'n1',
  type: 'task.assigned',
  summary: 'Fix login',
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  actor: { _id: 'u-ada', name: 'Ada' },
  task: { _id: 't1', title: 'Fix login', number: 12, key: 'WEB-12' },
  workspace: { _id: 'w1', slug: 'demo', name: 'Demo' },
  ...overrides,
});

export const makePage = (items: AppNotification[], overrides: Partial<NotificationPage> = {}): NotificationPage => ({
  items,
  nextBefore: null,
  unreadCount: items.filter(item => !item.readAt).length,
  ...overrides,
});
