import { Request } from 'express';
import { Types } from 'mongoose';
import Notification from '../models/notificationModel.js';
import Task from '../models/taskModel.js';
import User from '../models/userModel.js';
import { notificationTemplate } from '../utils/emailTemplates.js';
import {
  addedAssignees,
  notifyComment,
  notifyTaskEvents,
  planCommentNotifications,
  planTaskNotifications,
  resolveMentions,
  wantsEmail,
  wantsPush,
} from '../utils/notify.js';
import { sendEmail } from '../utils/sendEmail.js';
import { isPushConfigured, sendPushToUser } from '../utils/webPush.js';

jest.mock('../models/notificationModel.js', () => ({
  __esModule: true,
  MAX_NOTIFICATION_SUMMARY: 140,
  default: { insertMany: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../models/taskModel.js', () => ({
  __esModule: true,
  default: {
    updateOne: jest.fn().mockResolvedValue({}),
    findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ watchers: [] }) }) })),
  },
}));
jest.mock('../models/userModel.js', () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock('../utils/sendEmail.js', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/webPush.js', () => ({
  __esModule: true,
  isPushConfigured: jest.fn(() => false),
  pushSentence: jest.requireActual('../utils/webPush.js').pushSentence,
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

const id = () => new Types.ObjectId().toString();
const [actor, ada, bob, cy, owner] = [id(), id(), id(), id(), id()];

const members = [
  { id: ada, name: 'Ada Lovelace' },
  { id: bob, name: 'Bob Stone' },
  { id: cy, name: 'Cy Young' },
];

describe('addedAssignees', () => {
  it('returns only ids that were not assigned before', () => {
    expect(addedAssignees([ada], [ada, bob])).toEqual([bob]);
    expect(addedAssignees(undefined, [ada, ada, bob])).toEqual([ada, bob]);
    expect(addedAssignees([ada, bob], [ada])).toEqual([]);
    expect(addedAssignees(null, null)).toEqual([]);
  });
});

describe('planTaskNotifications', () => {
  const task = { _id: id(), title: 'Fix login', owner, assignees: [ada, actor], status: 'pending' };

  it('notifies new assignees except the actor on create', () => {
    expect(planTaskNotifications(actor, task)).toEqual([{ type: 'task.assigned', userIds: [ada] }]);
  });

  it('notifies only the assignees added by an update', () => {
    const plans = planTaskNotifications(actor, { ...task, assignees: [ada, bob] }, { assignees: [ada], status: 'pending' });
    expect(plans).toEqual([{ type: 'task.assigned', userIds: [bob] }]);
  });

  it('notifies the owner and assignees, not the actor, when the status becomes completed', () => {
    const plans = planTaskNotifications(actor, { ...task, status: 'completed' }, { assignees: [ada, actor], status: 'in-progress' });
    expect(plans).toEqual([{ type: 'task.completed', userIds: [owner, ada] }]);
  });

  it('also tells watchers (once, never the actor) when the status becomes completed', () => {
    const plans = planTaskNotifications(actor, { ...task, status: 'completed', watchers: [bob, ada, actor] }, { assignees: [ada, actor], status: 'pending' });
    expect(plans).toEqual([{ type: 'task.completed', userIds: [owner, ada, bob] }]);
  });

  it('stays quiet when the task was already completed or is created completed', () => {
    expect(planTaskNotifications(actor, { ...task, assignees: [], status: 'completed' }, { assignees: [], status: 'completed' })).toEqual([]);
    expect(planTaskNotifications(actor, { ...task, assignees: [], status: 'completed' })).toEqual([]);
  });

  it('does nothing when the actor only assigns themselves', () => {
    expect(planTaskNotifications(actor, { ...task, assignees: [actor] })).toEqual([]);
  });
});

describe('planCommentNotifications', () => {
  const task = { _id: id(), title: 'Fix login', owner, assignees: [ada, bob] };

  it('tells mentioned members first, then the other owner and assignees once each', () => {
    expect(planCommentNotifications(actor, task, [ada])).toEqual([
      { type: 'comment.mention', userIds: [ada] },
      { type: 'comment.reply_on_my_task', userIds: [owner, bob] },
    ]);
  });

  it('includes watchers once, after the owner and assignees', () => {
    expect(planCommentNotifications(actor, { ...task, watchers: [cy, ada, actor] }, [])).toEqual([
      { type: 'comment.reply_on_my_task', userIds: [owner, ada, bob, cy] },
    ]);
  });

  it('never notifies the author', () => {
    expect(planCommentNotifications(owner, task, [owner, cy])).toEqual([
      { type: 'comment.mention', userIds: [cy] },
      { type: 'comment.reply_on_my_task', userIds: [ada, bob] },
    ]);
  });
});

describe('resolveMentions', () => {
  it('matches full names and unique first names, ignoring case', () => {
    expect(resolveMentions('thanks @Ada Lovelace and @bob!', members).sort()).toEqual([ada, bob].sort());
  });

  it('needs a word boundary after the name', () => {
    expect(resolveMentions('cc @Adam', members)).toEqual([]);
    expect(resolveMentions('mail ada@Ada.com', members)).toEqual([]);
  });

  it('does not tag a member whose first name is shared unless the full name is used', () => {
    const shared = [{ id: ada, name: 'Sam Lee' }, { id: bob, name: 'Sam Park' }];
    expect(resolveMentions('@Sam please look', shared)).toEqual([]);
    expect(resolveMentions('@Sam Park please look', shared)).toEqual([bob]);
  });

  it('prefers the longer name so a full name does not also tag a shorter one', () => {
    const nested = [{ id: ada, name: 'Ann' }, { id: bob, name: 'Ann Lee' }];
    expect(resolveMentions('@Ann Lee', nested)).toEqual([bob]);
    expect(resolveMentions('@Ann', nested)).toEqual([ada]);
  });

  it('handles several mentions, punctuation and unicode names', () => {
    const unicode = [{ id: ada, name: 'Zoë Ng' }, { id: bob, name: 'Bob Stone' }];
    expect(resolveMentions('(@Zoë Ng), @Bob Stone.', unicode).sort()).toEqual([ada, bob].sort());
    expect(resolveMentions('no mentions here', members)).toEqual([]);
    expect(resolveMentions('@', members)).toEqual([]);
  });
});

describe('wantsEmail', () => {
  it('needs the master switch and the matching flag', () => {
    const prefs = { email: true, taskAssigned: true, taskCompleted: false };
    expect(wantsEmail(prefs, 'task.assigned')).toBe(true);
    expect(wantsEmail(prefs, 'comment.mention')).toBe(true);
    expect(wantsEmail(prefs, 'comment.reply_on_my_task')).toBe(true);
    expect(wantsEmail(prefs, 'task.completed')).toBe(false);
    expect(wantsEmail({ ...prefs, email: false }, 'task.assigned')).toBe(false);
    expect(wantsEmail(undefined, 'task.assigned')).toBe(false);
  });
});

describe('notificationTemplate', () => {
  it('escapes user-controlled text in the HTML but not in the plain text', () => {
    const mail = notificationTemplate('comment.mention', '<b>Eve</b>', 'A & B', 'Team "X"', 'http://x/t?task=1&a=2', '<script>alert(1)</script>');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>Eve</b>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('A &amp; B');
    expect(mail.text).toContain('A & B');
    expect(mail.text).toContain('http://x/t?task=1&a=2');
  });
});

describe('delivery', () => {
  beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => { jest.restoreAllMocks(); });
  const workspaceId = new Types.ObjectId();
  const taskId = new Types.ObjectId().toString();
  const req = (userId = actor) => ({
    user: { _id: userId, name: 'Eve Actor' },
    workspace: {
      _id: workspaceId,
      slug: 'team-x',
      name: 'Team X',
      members: [actor, ada, bob, owner].map(user => ({ user })),
    },
  }) as unknown as Request;
  const prefs = (overrides: Record<string, boolean> = {}) => ({ email: true, taskAssigned: true, taskCompleted: false, ...overrides });
  const recipients = (map: Record<string, Record<string, boolean>>) =>
    (User.find as jest.Mock).mockReturnValue({
      select: async () => Object.entries(map).map(([key, value]) => ({ _id: key, email: `${key}@example.com`, notifications: prefs(value) })),
    });

  it('stores in-app notifications and emails only recipients whose flags allow it', async () => {
    recipients({ [ada]: {}, [bob]: { taskAssigned: false } });
    await notifyTaskEvents(req(), { _id: taskId, title: 'Fix login', owner: actor, assignees: [ada, bob] });

    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ user: ada, type: 'task.assigned', summary: 'Fix login', actor }),
      expect.objectContaining({ user: bob, type: 'task.assigned' }),
    ]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: `${ada}@example.com`,
      text: expect.stringContaining(`http://localhost:5173/team-x/tasks?task=${taskId}`),
    }));
  });

  it('skips people who left the workspace', async () => {
    recipients({});
    await notifyTaskEvents(req(), { _id: taskId, title: 'Fix login', owner: actor, assignees: [cy] });
    expect(Notification.insertMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('keeps the in-app notification and does not throw when sending fails', async () => {
    recipients({ [ada]: {} });
    (sendEmail as jest.Mock).mockRejectedValueOnce(new Error('No email provider configured'));
    await expect(notifyTaskEvents(req(), { _id: taskId, title: 'Fix login', owner: actor, assignees: [ada] })).resolves.toBeUndefined();
    expect(Notification.insertMany).toHaveBeenCalledTimes(1);
  });

  it('never throws when the database fails', async () => {
    (Notification.insertMany as jest.Mock).mockRejectedValueOnce(new Error('down'));
    (User.find as jest.Mock).mockImplementation(() => { throw new Error('down'); });
    await expect(notifyTaskEvents(req(), { _id: taskId, title: 'T', owner: actor, assignees: [ada] })).resolves.toBeUndefined();
  });

  it('notifies a mention and the task owner about a comment, with an excerpt in the email', async () => {
    recipients({ [bob]: {}, [owner]: {} });
    await notifyComment(req(), { _id: taskId, title: 'Fix login', owner, assignees: [bob] }, { text: 'see @Bob Stone', mentions: [bob] });
    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ user: bob, type: 'comment.mention' }),
      expect.objectContaining({ user: owner, type: 'comment.reply_on_my_task' }),
    ]);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect((sendEmail as jest.Mock).mock.calls[0][0].text).toContain('see @Bob Stone');
  });

  it('tells watchers read from the task about a comment and subscribes the commenter', async () => {
    recipients({ [bob]: {} });
    (Task.findById as jest.Mock).mockReturnValueOnce({ select: () => ({ lean: async () => ({ watchers: [bob] }) }) });
    await notifyComment(req(), { _id: taskId, title: 'Fix login', owner: actor, assignees: [] }, { text: 'hello', mentions: [] });
    expect(Notification.insertMany).toHaveBeenCalledWith([expect.objectContaining({ user: bob, type: 'comment.reply_on_my_task' })]);
    expect(Task.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { $addToSet: { watchers: expect.anything() } },
    );
  });

  describe('web push', () => {
    const pushRecipients = (map: Record<string, Record<string, boolean>>) =>
      (User.find as jest.Mock).mockReturnValue({
        select: async () => Object.entries(map).map(([key, value]) => ({
          _id: key, email: `${key}@example.com`, notifications: { email: false, ...value },
        })),
      });

    it('pushes the bell sentence and task link to recipients who have not switched push off', async () => {
      (isPushConfigured as jest.Mock).mockReturnValue(true);
      const created = [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }];
      (Notification.insertMany as jest.Mock).mockResolvedValueOnce(created);
      pushRecipients({ [ada]: {}, [bob]: { push: false } });
      await notifyTaskEvents(req(), { _id: taskId, title: 'Fix login', owner: actor, assignees: [ada, bob] });

      expect(sendPushToUser).toHaveBeenCalledTimes(1);
      expect(sendPushToUser).toHaveBeenCalledWith(ada, {
        title: 'TaskMan',
        body: 'Eve Actor assigned you "Fix login"',
        url: `/team-x/tasks?task=${taskId}`,
        tag: String(created[0]._id),
      });
    });

    it('sends no push when it is not configured or the notification was not stored', async () => {
      (isPushConfigured as jest.Mock).mockReturnValue(false);
      pushRecipients({ [ada]: {} });
      await notifyTaskEvents(req(), { _id: taskId, title: 'Fix login', owner: actor, assignees: [ada] });
      expect(sendPushToUser).not.toHaveBeenCalled();

      (isPushConfigured as jest.Mock).mockReturnValue(true);
      (Notification.insertMany as jest.Mock).mockRejectedValueOnce(new Error('down'));
      await notifyTaskEvents(req(), { _id: taskId, title: 'Fix login', owner: actor, assignees: [ada] });
      expect(sendPushToUser).not.toHaveBeenCalled();
    });

    it('treats a missing push preference as on', () => {
      expect(wantsPush(undefined)).toBe(true);
      expect(wantsPush({})).toBe(true);
      expect(wantsPush({ push: true })).toBe(true);
      expect(wantsPush({ push: false })).toBe(false);
    });
  });
});
