import webpush from 'web-push';
import PushSubscription from '../models/pushSubscriptionModel.js';
import { getPublicKey, isPushConfigured, pushSentence, sendPushToUser } from '../utils/webPush.js';

jest.mock('web-push', () => ({ __esModule: true, default: { sendNotification: jest.fn() } }));
jest.mock('../models/pushSubscriptionModel.js', () => ({
  __esModule: true,
  default: { find: jest.fn(), deleteMany: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
}));

const ENV_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
const send = webpush.sendNotification as jest.Mock;
const find = PushSubscription.find as unknown as jest.Mock;

const configure = () => {
  process.env.VAPID_PUBLIC_KEY = 'public-key-value';
  process.env.VAPID_PRIVATE_KEY = 'private-key-value';
  process.env.VAPID_SUBJECT = 'mailto:ops@example.com';
};
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
const payload = { title: 'TaskMan', body: 'Ada assigned you "Fix"', url: '/team/tasks?task=1', tag: 'n1' };

beforeEach(() => {
  ENV_KEYS.forEach(key => { saved[key] = process.env[key]; delete process.env[key]; });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  ENV_KEYS.forEach(key => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });
  jest.restoreAllMocks();
});

describe('configuration', () => {
  it('is disabled until all three variables are set', () => {
    expect(isPushConfigured()).toBe(false);
    expect(getPublicKey()).toBeNull();
    process.env.VAPID_PUBLIC_KEY = 'x';
    process.env.VAPID_PRIVATE_KEY = 'y';
    expect(isPushConfigured()).toBe(false);
  });

  it('rejects a subject that is neither mailto: nor https', () => {
    configure();
    process.env.VAPID_SUBJECT = 'ops@example.com';
    expect(isPushConfigured()).toBe(false);
    process.env.VAPID_SUBJECT = 'https://taskman.example.com';
    expect(isPushConfigured()).toBe(true);
  });

  it('exposes only the public key', () => {
    configure();
    expect(getPublicKey()).toBe('public-key-value');
  });
});

describe('pushSentence', () => {
  it('words each type like the bell and trims very long text', () => {
    expect(pushSentence('task.assigned', 'Ada', 'Fix login')).toBe('Ada assigned you "Fix login"');
    expect(pushSentence('comment.mention', 'Bo', 'Docs')).toBe('Bo mentioned you in a comment on "Docs"');
    expect(pushSentence('task.completed', 'Cy', 'Ship')).toBe('Cy completed "Ship"');
    expect(pushSentence('comment.reply_on_my_task', 'Di', 'Ship')).toBe('Di commented on "Ship"');
    expect(pushSentence('task.assigned', 'Ada', 'x'.repeat(500))).toHaveLength(200);
  });
});

describe('sendPushToUser', () => {
  it('does nothing without VAPID keys', async () => {
    await sendPushToUser('u1', payload);
    expect(find).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the payload to every device with a one day TTL and normal urgency', async () => {
    configure();
    find.mockResolvedValue([sub('https://push.example/1'), sub('https://push.example/2')]);
    send.mockResolvedValue({});
    await sendPushToUser('u1', payload);

    expect(send).toHaveBeenCalledTimes(2);
    const [target, body, options] = send.mock.calls[0];
    expect(target).toEqual({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } });
    expect(JSON.parse(body)).toEqual(payload);
    expect(options).toMatchObject({ TTL: 86400, urgency: 'normal', vapidDetails: { subject: 'mailto:ops@example.com' } });
    expect(PushSubscription.deleteMany).not.toHaveBeenCalled();
    expect(PushSubscription.updateMany).toHaveBeenCalledTimes(1);
  });

  it('deletes subscriptions the push service reports as gone (404 and 410) and keeps the others', async () => {
    configure();
    find.mockResolvedValue([sub('https://push.example/gone'), sub('https://push.example/missing'), sub('https://push.example/ok')]);
    send.mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint.endsWith('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      if (target.endpoint.endsWith('missing')) throw Object.assign(new Error('Not found'), { statusCode: 404 });
      return {};
    });
    await sendPushToUser('u1', payload);
    expect(PushSubscription.deleteMany).toHaveBeenCalledWith({
      user: 'u1', endpoint: { $in: ['https://push.example/gone', 'https://push.example/missing'] },
    });
  });

  it('keeps the subscription on other failures and never throws', async () => {
    configure();
    find.mockResolvedValue([sub('https://push.example/1')]);
    send.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
    await expect(sendPushToUser('u1', payload)).resolves.toBeUndefined();
    expect(PushSubscription.deleteMany).not.toHaveBeenCalled();

    find.mockRejectedValue(new Error('db down'));
    await expect(sendPushToUser('u1', payload)).resolves.toBeUndefined();
  });

  it('never logs the keys', async () => {
    configure();
    find.mockResolvedValue([sub('https://push.example/1')]);
    send.mockRejectedValue(new Error('Vapid failure'));
    await sendPushToUser('u1', payload);
    const logged = JSON.stringify((console.error as jest.Mock).mock.calls);
    expect(logged).not.toContain('private-key-value');
  });
});
