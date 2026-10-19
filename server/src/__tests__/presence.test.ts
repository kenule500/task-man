import { Types } from 'mongoose';
import ChatPresence, { CHAT_PRESENCE_TTL_SECONDS } from '../models/chatPresenceModel.js';
import { registerPresence } from '../realtime/socket.js';

const workspaceId = new Types.ObjectId();
const userId = new Types.ObjectId();

const ctx = {
  userId: String(userId),
  workspaceId: String(workspaceId),
  slug: 'acme',
  permissions: ['chat:read'],
};

interface TestSocket {
  on: jest.Mock;
  disconnect: () => Promise<void>;
}

const connect = () => {
  const emit = jest.fn();
  const io = { to: jest.fn(() => ({ emit })) } as never;
  let onDisconnect: (() => Promise<void>) | undefined;
  const socket = {
    on: jest.fn((event: string, handler: () => Promise<void>) => {
      if (event === 'disconnect') onDisconnect = handler;
    }),
  };
  registerPresence(io, socket as never, ctx);
  return {
    emit,
    io: io as unknown as { to: jest.Mock },
    socket: socket as unknown as TestSocket,
    disconnect: async () => { await onDisconnect?.(); },
  };
};

const flush = async () => { await Promise.resolve(); };

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(ChatPresence, 'updateOne').mockResolvedValue({ acknowledged: true } as never);
  jest.spyOn(ChatPresence, 'findOneAndUpdate').mockResolvedValue(null as never);
  jest.spyOn(ChatPresence, 'deleteOne').mockResolvedValue({ acknowledged: true } as never);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('presence', () => {
  it('AC-030: one presence per user, offline only after the last tab disconnects', async () => {
    const first = connect();
    const second = connect();
    await flush();

    const updateOne = ChatPresence.updateOne as unknown as jest.Mock;
    expect(updateOne).toHaveBeenCalledTimes(2);
    for (const [key, update, options] of updateOne.mock.calls) {
      expect(String(key.workspace)).toBe(String(workspaceId));
      expect(String(key.user)).toBe(String(userId));
      expect(update.$inc).toEqual({ connections: 1 });
      expect(options).toEqual({ upsert: true });
    }
    // Both tabs announce the same single person as online
    expect(first.emit).toHaveBeenCalledWith('chat:presence', { userId: String(userId), online: true });
    expect(second.emit).toHaveBeenCalledWith('chat:presence', { userId: String(userId), online: true });

    const findOneAndUpdate = ChatPresence.findOneAndUpdate as unknown as jest.Mock;
    const deleteOne = ChatPresence.deleteOne as unknown as jest.Mock;
    findOneAndUpdate
      .mockResolvedValueOnce({ connections: 1 } as never)
      .mockResolvedValueOnce({ connections: 0 } as never);

    await first.disconnect();
    // One tab closing leaves the person online: the row still has a connection
    expect(deleteOne).not.toHaveBeenCalled();
    expect(first.emit).not.toHaveBeenCalledWith('chat:presence', { userId: String(userId), online: false });

    await second.disconnect();
    // The last connection removes the presence and broadcasts the offline state
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(second.emit).toHaveBeenCalledWith('chat:presence', { userId: String(userId), online: false });
  });

  it('AC-031: refreshes seenAt periodically and ages stale presence out through the TTL index', async () => {
    connect();
    await flush();

    const updateOne = ChatPresence.updateOne as unknown as jest.Mock;
    expect(updateOne).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(30_000);

    expect(updateOne).toHaveBeenCalledTimes(2);
    const [key, update] = updateOne.mock.calls[1];
    expect(String(key.user)).toBe(String(userId));
    // The refresh only moves the timestamp; the connection count is untouched
    expect(update.$set.seenAt).toBeInstanceOf(Date);
    expect(update.$inc).toBeUndefined();

    // If the process dies without a disconnect, MongoDB removes the row once seenAt is 90s old
    const ttl = ChatPresence.schema.indexes().find(([fields]) => (fields as Record<string, number>).seenAt === 1);
    expect(ttl?.[1]?.expireAfterSeconds).toBe(CHAT_PRESENCE_TTL_SECONDS);
  });
});
