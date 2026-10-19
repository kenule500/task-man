import { EventEmitter } from 'node:events';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import ChatChannel from '../models/chatChannelModel.js';
import ChatMessage from '../models/chatMessageModel.js';
import ChatReaction from '../models/chatReactionModel.js';
import Notification from '../models/notificationModel.js';
import Workspace from '../models/workspaceModel.js';
import { loadChannelForCaller } from '../controllers/chatChannelController.js';
import {
  createMessageInChannel, deleteMessage, downloadAttachment, toggleReaction, uploadAttachment,
} from '../controllers/chatMessageController.js';
import { emitToChannel, emitToUser } from '../realtime/bus.js';
import { recordActivity } from '../utils/activity.js';
import {
  deleteFiles, fileInfoOf, openFileStream, saveFile,
} from '../utils/gridfs.js';

jest.mock('../models/chatChannelModel.js', () => ({
  __esModule: true,
  CHANNEL_KINDS: ['team', 'general', 'project', 'direct'],
  MAX_CHANNEL_NAME: 60,
  MAX_DIRECT_PARTICIPANTS: 2,
  directKeyOf: (a: string, b: string) => [String(a), String(b)].sort().join(':'),
  default: { findOne: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('../models/chatMessageModel.js', () => ({
  __esModule: true,
  MAX_MESSAGE_BODY: 4000,
  default: {
    aggregate: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock('../models/chatReactionModel.js', () => ({
  __esModule: true,
  MAX_EMOJI_LENGTH: 8,
  default: {
    aggregate: jest.fn(), create: jest.fn(), deleteOne: jest.fn(), findOne: jest.fn(),
  },
}));
jest.mock('../models/chatReadModel.js', () => ({ __esModule: true, default: { updateOne: jest.fn() } }));
jest.mock('../models/notificationModel.js', () => ({
  __esModule: true,
  NOTIFICATION_TYPES: ['chat.mention'],
  default: { insertMany: jest.fn() },
}));
jest.mock('../models/workspaceModel.js', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock('../realtime/bus.js', () => ({
  __esModule: true,
  emitToChannel: jest.fn(),
  emitToChannelExcept: jest.fn(),
  emitToUser: jest.fn(),
}));
jest.mock('../utils/activity.js', () => ({
  __esModule: true,
  recordActivity: jest.fn(async () => undefined),
}));
jest.mock('../utils/gridfs.js', () => ({
  __esModule: true,
  deleteFiles: jest.fn(async () => undefined),
  fileInfoOf: jest.fn(),
  openFileStream: jest.fn(),
  saveFile: jest.fn(),
}));
jest.mock('../controllers/chatChannelController.js', () => ({
  __esModule: true,
  loadChannelForCaller: jest.fn(),
  permissionsOf: (req: Request) => (req as unknown as { permissions?: string[] }).permissions ?? [],
  workspaceIdOf: (req: Request) => (req as unknown as { workspace: { _id: unknown } }).workspace._id,
}));

const ChatChannelMock = ChatChannel as unknown as Record<string, jest.Mock>;
const ChatMessageMock = ChatMessage as unknown as Record<string, jest.Mock>;
const ChatReactionMock = ChatReaction as unknown as Record<string, jest.Mock>;
const NotificationMock = Notification as unknown as Record<string, jest.Mock>;
const WorkspaceMock = Workspace as unknown as Record<string, jest.Mock>;
const loadChannelMock = loadChannelForCaller as unknown as jest.Mock;

type TestResponse = Response & { statusCode?: number; body?: any; headers?: Record<string, string> };

const createResponse = (): TestResponse => {
  const res = {} as unknown as TestResponse;
  res.statusCode = 200;
  res.headers = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response['status'];
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response['json'];
  res.setHeader = jest.fn((name: string, value: string) => {
    res.headers![name] = value;
    return res;
  }) as unknown as Response['setHeader'];
  return res;
};

const workspaceId = new Types.ObjectId();
const channelId = new Types.ObjectId();
const messageId = new Types.ObjectId();
const parentId = new Types.ObjectId();
const me = new Types.ObjectId();
const other = new Types.ObjectId();
const fileId = new Types.ObjectId();

const channel = {
  _id: channelId,
  workspace: workspaceId,
  kind: 'team',
  name: 'Team Chat',
  archived: false,
};

const createdAt = new Date('2026-10-18T10:00:00.000Z');

const createdMessage = (input: Record<string, unknown>, body = 'hello') => {
  const fields = {
    workspace: workspaceId,
    channel: channelId,
    author: me,
    body,
    parent: null,
    mentions: [],
    attachments: [],
    deletedAt: null,
    ...input,
  };
  const doc: any = {
    ...fields,
    _id: messageId,
    createdAt,
    populate: jest.fn(async () => undefined),
    toObject: () => ({ ...fields, _id: messageId, createdAt }),
  };
  return doc;
};

const createRequest = (overrides: Record<string, unknown> = {}): Request => ({
  body: {},
  params: { channelId: channelId.toString(), messageId: messageId.toString() },
  workspace: { _id: workspaceId },
  permissions: ['chat:read', 'chat:write'],
  user: { _id: me, name: 'Ada' },
  ...overrides,
}) as unknown as Request;

beforeEach(() => {
  Object.values(ChatChannelMock).forEach(fn => fn.mockReset?.());
  Object.values(ChatMessageMock).forEach(fn => fn.mockReset?.());
  Object.values(ChatReactionMock).forEach(fn => fn.mockReset?.());
  Object.values(NotificationMock).forEach(fn => fn.mockReset?.());
  Object.values(WorkspaceMock).forEach(fn => fn.mockReset?.());
  loadChannelMock.mockReset();
  loadChannelMock.mockResolvedValue({ ok: true, channel });
  ChatChannelMock.updateOne.mockResolvedValue({ acknowledged: true });
  ChatMessageMock.updateOne.mockResolvedValue({ acknowledged: true });
  NotificationMock.insertMany.mockResolvedValue([]);
});

describe('createMessageInChannel', () => {
  it('AC-009: stores the workspace, channel, author and parent, and updates the channel pointer', async () => {
    ChatMessageMock.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: parentId }) });
    const doc = createdMessage({ parent: parentId, body: 'a reply' });
    ChatMessageMock.create.mockResolvedValue(doc);

    await createMessageInChannel({
      workspaceId,
      channel: channel as never,
      authorId: me,
      input: { body: 'a reply', parentId: parentId.toString(), attachmentIds: [], mentionIds: [] },
    });

    expect(ChatMessageMock.create).toHaveBeenCalledWith(expect.objectContaining({
      workspace: workspaceId,
      channel: channelId,
      author: me,
      parent: parentId,
      body: 'a reply',
    }));
    // The ordering pointer is written on the channel, so the list never scans messages
    expect(ChatChannelMock.updateOne).toHaveBeenCalledWith(
      { _id: channelId },
      { $set: { lastMessageAt: createdAt, lastMessageAuthor: me } },
    );
    expect(ChatMessageMock.updateOne).toHaveBeenCalledWith(
      { _id: parentId },
      { $inc: { replyCount: 1 }, $set: { lastReplyAuthor: me } },
    );
    expect(emitToChannel).toHaveBeenCalledWith(String(channelId), 'chat:message', expect.any(Object));
  });

  it('AC-015: a mention notifies the member through the existing notification store', async () => {
    WorkspaceMock.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: async () => ({ members: [{ user: other }] }) }),
    });
    const doc = createdMessage({ body: 'ping @Grace', mentions: [other] });
    ChatMessageMock.create.mockResolvedValue(doc);
    NotificationMock.insertMany.mockResolvedValue([{ _id: new Types.ObjectId(), user: other }]);

    await createMessageInChannel({
      workspaceId,
      channel: channel as never,
      authorId: me,
      input: { body: 'ping @Grace', parentId: null, attachmentIds: [], mentionIds: [other.toString()] },
    });

    const [rows] = NotificationMock.insertMany.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user: other,
      workspace: workspaceId,
      actor: me,
      type: 'chat.mention',
      channel: channelId,
      message: messageId,
    });
    expect(emitToUser).toHaveBeenCalledWith(
      String(other),
      'chat:notified',
      { channelId: String(channelId) },
    );
  });
});

describe('reactions', () => {
  const messageDoc = () => ({
    _id: messageId,
    channel: channelId,
    workspace: workspaceId,
    author: other,
    toObject: () => ({ _id: messageId, channel: channelId, body: 'hi', deletedAt: null }),
  });

  it('AC-016: toggling a reaction I already gave removes it and broadcasts the new state', async () => {
    ChatMessageMock.findOne.mockResolvedValue(messageDoc());
    const deleteOne = jest.fn().mockResolvedValue({});
    ChatReactionMock.findOne.mockResolvedValue({ deleteOne });
    ChatReactionMock.aggregate.mockResolvedValue([{ _id: '👍', count: 0, users: [] }]);

    const res = createResponse();
    await toggleReaction(createRequest({ body: { emoji: '👍' } }), res);

    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(ChatReactionMock.create).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      channelId: String(channelId),
      messageId: String(messageId),
      reactions: [{ emoji: '👍', count: 0, users: [] }],
    });
    expect(emitToChannel).toHaveBeenCalledWith(String(channelId), 'chat:reaction', res.body);
  });

  it('AC-017: reactions are aggregated per emoji with a count and the reactor list', async () => {
    ChatMessageMock.findOne.mockResolvedValue(messageDoc());
    ChatReactionMock.findOne.mockResolvedValue(null);
    ChatReactionMock.create.mockResolvedValue({});
    ChatReactionMock.aggregate.mockResolvedValue([
      { _id: '👍', count: 2, users: [other, me] },
      { _id: '🎉', count: 1, users: [me] },
    ]);

    const res = createResponse();
    await toggleReaction(createRequest({ body: { emoji: '👍' } }), res);

    expect(ChatReactionMock.create).toHaveBeenCalledWith(expect.objectContaining({
      message: messageId,
      user: me,
      emoji: '👍',
    }));
    expect(res.body.reactions).toEqual([
      { emoji: '👍', count: 2, users: [String(other), String(me)] },
      { emoji: '🎉', count: 1, users: [String(me)] },
    ]);
  });
});

describe('attachments', () => {
  it('AC-020: an upload keeps its name, size and type and is stamped with the channel', async () => {
    const file = {
      buffer: Buffer.from('pdf'),
      originalname: 'spec.pdf',
      mimetype: 'application/pdf',
      size: 3,
    };
    (saveFile as unknown as jest.Mock).mockResolvedValue(fileId);

    const res = createResponse();
    await uploadAttachment(createRequest({ file }), res);

    expect(saveFile).toHaveBeenCalledWith(file.buffer, 'spec.pdf', 'application/pdf', {
      channel: String(channelId),
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.attachment).toEqual({
      id: String(fileId),
      name: 'spec.pdf',
      size: 3,
      type: 'application/pdf',
    });
  });

  it('AC-020: downloads are refused to callers who cannot read the channel', async () => {
    ChatMessageMock.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        channel: channelId,
        attachments: [{ id: String(fileId), name: 'a.pdf', type: 'application/pdf' }],
      }),
    });
    ChatChannelMock.findOne.mockResolvedValue({
      _id: channelId,
      workspace: workspaceId,
      kind: 'direct',
      participants: [other],
      archived: false,
    });

    const res = createResponse();
    await downloadAttachment(createRequest({ params: { attachmentId: String(fileId) } }), res);

    expect(res.statusCode).toBe(404);
    expect(openFileStream).not.toHaveBeenCalled();
  });

  it('AC-020: a reader gets the stored content type and filename', async () => {
    ChatMessageMock.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        channel: channelId,
        attachments: [{ id: String(fileId), name: 'a.pdf', type: 'application/pdf' }],
      }),
    });
    ChatChannelMock.findOne.mockResolvedValue({ ...channel, participants: [] });
    const stream = new EventEmitter() as EventEmitter & { pipe: jest.Mock };
    stream.pipe = jest.fn();
    (openFileStream as unknown as jest.Mock).mockReturnValue(stream);

    const res = createResponse();
    await downloadAttachment(createRequest({ params: { attachmentId: String(fileId) } }), res);

    expect(res.headers?.['Content-Type']).toBe('application/pdf');
    expect(res.headers?.['Content-Disposition']).toContain('a.pdf');
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });
});

describe('message attachments', () => {
  it('AC-054: several attachments are stored with metadata, and another channel\'s file is refused', async () => {
    (fileInfoOf as unknown as jest.Mock).mockImplementation(async (id: string) => {
      if (id === 'a') return { id: 'a', name: 'one.png', size: 10, type: 'image/png', channel: String(channelId) };
      if (id === 'b') return { id: 'b', name: 'two.png', size: 20, type: 'image/png', channel: String(channelId) };
      // Uploaded to a different channel: a message here must not expose it
      return { id: 'c', name: 'secret.png', size: 30, type: 'image/png', channel: 'another-channel' };
    });
    ChatMessageMock.create.mockResolvedValue(createdMessage({ body: 'files' }));

    await createMessageInChannel({
      workspaceId,
      channel: channel as never,
      authorId: me,
      input: { body: 'files', parentId: null, attachmentIds: ['a', 'b', 'c'], mentionIds: [] },
    });

    const [input] = ChatMessageMock.create.mock.calls[0];
    expect(input.attachments).toEqual([
      { id: 'a', name: 'one.png', size: 10, type: 'image/png' },
      { id: 'b', name: 'two.png', size: 20, type: 'image/png' },
    ]);
  });
});

describe('moderation', () => {
  it('AC-028: a moderator can delete anyone\'s message and the action is recorded', async () => {
    const message: any = {
      _id: messageId,
      workspace: workspaceId,
      channel: channelId,
      author: other,
      body: 'secret',
      attachments: [{ id: 'f1', name: 'a.png', size: 1, type: 'image/png' }],
      mentions: [other],
      deletedAt: null,
      save: jest.fn(async () => message),
    };
    message.toObject = () => ({ ...message });
    ChatMessageMock.findOne.mockResolvedValue(message);

    const res = createResponse();
    await deleteMessage(
      createRequest({ permissions: ['chat:read', 'chat:moderate'], body: { reason: 'spam' } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(message.body).toBe('');
    expect(message.attachments).toEqual([]);
    expect(message.mentions).toEqual([]);
    expect(deleteFiles).toHaveBeenCalledWith(['f1']);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'chat.message_deleted', summary: 'spam' }),
    );
    expect(emitToChannel).toHaveBeenCalledWith(String(channelId), 'chat:deleted', expect.any(Object));
  });
});
