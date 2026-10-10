import { bellLabel, formatUnreadCount, notificationHref, notificationSentence } from '../lib/format';
import { makeNotification } from './fixtures';

describe('notificationSentence', () => {
  it('reads like a sentence for every type', () => {
    expect(notificationSentence(makeNotification())).toBe('Ada assigned you WEB-12 Fix login');
    expect(notificationSentence(makeNotification({ type: 'task.completed' }))).toBe('Ada completed WEB-12 Fix login');
    expect(notificationSentence(makeNotification({ type: 'comment.mention' }))).toBe('Ada mentioned you in WEB-12 Fix login');
    expect(notificationSentence(makeNotification({ type: 'comment.reply_on_my_task' }))).toBe('Ada commented on WEB-12 Fix login');
  });

  it('copes with a deleted task, a missing key and a missing actor', () => {
    expect(notificationSentence(makeNotification({ task: null, actor: null }))).toBe('Someone assigned you Fix login');
    expect(notificationSentence(makeNotification({ task: { _id: 't1', title: 'Old', number: null, key: '' } })))
      .toBe('Ada assigned you Old');
  });
});

describe('notificationHref', () => {
  it('opens the task in its own workspace', () => {
    expect(notificationHref(makeNotification())).toBe('/demo/tasks?task=t1');
  });

  it('is null when the task or workspace is gone', () => {
    expect(notificationHref(makeNotification({ task: null }))).toBeNull();
    expect(notificationHref(makeNotification({ workspace: null }))).toBeNull();
  });
});

describe('bell text', () => {
  it('labels the unread count for screen readers', () => {
    expect(bellLabel(3)).toBe('Notifications, 3 unread');
    expect(bellLabel(0)).toBe('Notifications');
  });

  it('caps the badge', () => {
    expect(formatUnreadCount(7)).toBe('7');
    expect(formatUnreadCount(100)).toBe('99+');
  });
});
