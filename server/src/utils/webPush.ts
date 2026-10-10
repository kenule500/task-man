import 'dotenv/config';
import webpush from 'web-push';
import PushSubscription from '../models/pushSubscriptionModel.js';

// Web Push (VAPID). Disabled, without any error, until VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT are all set. The keys are never logged.

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const readVapid = (): VapidConfig | null => {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/i.test(subject)) return null;
  return { publicKey, privateKey, subject };
};

/** The VAPID public key (safe to share with browsers), or null when push is not configured. */
export const getPublicKey = (): string | null => readVapid()?.publicKey ?? null;

export const isPushConfigured = (): boolean => readVapid() !== null;

const TTL_SECONDS = 24 * 60 * 60;
const MAX_BODY = 200;

/** "Ada assigned you "Fix login"." style sentences, same wording as the bell and emails. */
const SENTENCES: Record<string, (actor: string, task: string) => string> = {
  'task.assigned': (actor, task) => `${actor} assigned you "${task}"`,
  'task.completed': (actor, task) => `${actor} completed "${task}"`,
  'comment.mention': (actor, task) => `${actor} mentioned you in a comment on "${task}"`,
  'comment.reply_on_my_task': (actor, task) => `${actor} commented on "${task}"`,
};

export const pushSentence = (type: string, actorName: string, taskTitle: string): string => {
  const text = (SENTENCES[type] ?? ((actor, task) => `${actor} updated "${task}"`))(actorName, taskTitle);
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;
};

/**
 * Sends `payload` to every device of the user. Subscriptions the push service reports as gone
 * (404/410) are deleted. Never throws.
 */
export const sendPushToUser = async (userId: string, payload: PushPayload): Promise<void> => {
  try {
    const vapidDetails = readVapid();
    if (!vapidDetails) return;
    const subscriptions = await PushSubscription.find({ user: userId });
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    const gone: string[] = [];
    const delivered: string[] = [];
    await Promise.allSettled(subscriptions.map(async subscription => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
          body,
          { vapidDetails, TTL: TTL_SECONDS, urgency: 'normal' },
        );
        delivered.push(subscription.endpoint);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(subscription.endpoint);
        else console.error('push send error:', status ?? (error as Error).message);
      }
    }));

    if (gone.length > 0) await PushSubscription.deleteMany({ user: userId, endpoint: { $in: gone } });
    if (delivered.length > 0) {
      await PushSubscription.updateMany({ user: userId, endpoint: { $in: delivered } }, { $set: { lastUsedAt: new Date() } });
    }
  } catch (error) {
    console.error('push error:', (error as Error).message);
  }
};
