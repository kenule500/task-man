import { getConfig } from '../config/env.js';
import ChatMessage from '../models/chatMessageModel.js';

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Removes messages older than the configured retention window.
 *
 * This is a sweep rather than a TTL index so the model never reads configuration: CON-206 keeps
 * env access inside config/env.ts, and a model that calls getConfig() would exit the process when
 * imported by a unit test that does not set MONGO_URI.
 */
export const purgeExpiredMessages = async (): Promise<number> => {
  const { chatRetentionDays } = getConfig();
  if (!Number.isFinite(chatRetentionDays) || chatRetentionDays <= 0) return 0;

  const cutoff = new Date(Date.now() - chatRetentionDays * 24 * 60 * 60 * 1000);
  const result = await ChatMessage.deleteMany({ createdAt: { $lt: cutoff } });
  return result.deletedCount ?? 0;
};

/** Runs one sweep at startup, then periodically; never throws, because a failed sweep must not stop the server. */
export const startRetentionSweep = (): NodeJS.Timeout => {
  const sweep = (context: string) => {
    void purgeExpiredMessages()
      .then(count => {
        if (count > 0) console.log(`🧹 Purged ${count} chat message(s) past retention (${context})`);
      })
      .catch(error => console.error(`chat retention sweep error (${context}):`, (error as Error).message));
  };

  sweep('startup');
  const timer = setInterval(() => sweep('scheduled'), SWEEP_INTERVAL_MS);
  timer.unref?.();
  return timer;
};
