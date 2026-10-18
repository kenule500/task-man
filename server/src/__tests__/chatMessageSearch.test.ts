import { Request, Response } from 'express';
import { Types } from 'mongoose';
import ChatMessage from '../models/chatMessageModel.js';
import { loadChannelForCaller } from '../controllers/chatChannelController.js';
import { searchMessages } from '../controllers/chatMessageController.js';

jest.mock('../models/chatMessageModel.js', () => ({
  __esModule: true,
  MAX_MESSAGE_BODY: 4000,
  default: { find: jest.fn() },
}));

jest.mock('../controllers/chatChannelController.js', () => ({
  __esModule: true,
  loadChannelForCaller: jest.fn(),
  permissionsOf: jest.fn(() => ['chat:read']),
  workspaceIdOf: jest.fn(() => new Types.ObjectId()),
}));

const ChatMessageMock = ChatMessage as unknown as Record<string, jest.Mock>;
const loadChannelMock = loadChannelForCaller as unknown as jest.Mock;

type TestResponse = Response & { statusCode?: number; body?: any };

const createResponse = (): TestResponse => {
  const res = {} as unknown as TestResponse;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response['status'];
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response['json'];
  return res;
};

const workspaceId = new Types.ObjectId();
const channelId = new Types.ObjectId();

const row = (index: number) => ({
  _id: new Types.ObjectId(),
  channel: channelId,
  author: { _id: new Types.ObjectId(), name: 'Ada' },
  body: `deploy ${index}`,
  createdAt: new Date(1_700_000_000_000 + index),
});

const createRequest = (queryValues: Record<string, unknown>): Request => ({
  params: { slug: 'acme', channelId: channelId.toString() },
  query: queryValues,
  workspace: { _id: workspaceId },
  permissions: ['chat:read'],
  user: { _id: new Types.ObjectId() },
}) as unknown as Request;

// `find(...).sort(...).limit(...).select(...).populate(...).lean()` is the query shape used here
const queryChain = (rows: unknown[]) => ({
  sort: () => ({
    limit: () => ({
      select: () => ({
        populate: () => ({ lean: async () => rows }),
      }),
    }),
  }),
});

beforeEach(() => {
  ChatMessageMock.find.mockReset();
  loadChannelMock.mockReset();
  loadChannelMock.mockResolvedValue({ ok: true, channel: { _id: channelId, workspace: workspaceId } });
});

describe('searchMessages', () => {
  it('AC-024: scopes the query to this channel and workspace, and skips tombstones and thread replies', async () => {
    ChatMessageMock.find.mockReturnValue(queryChain([row(1)]));

    const res = createResponse();
    await searchMessages(createRequest({ q: 'deploy' }), res);

    expect(res.statusCode).toBe(200);
    const filter = ChatMessageMock.find.mock.calls[0][0];
    expect(String(filter.channel)).toBe(channelId.toString());
    expect(String(filter.workspace)).toBe(workspaceId.toString());
    expect(filter.deletedAt).toBeNull();
    // A reply lives in its thread panel, so it is not a jumpable find result (spec §17.6)
    expect(filter.parent).toBeNull();
    expect(filter.body.$regex).toBe('deploy');
  });

  it('AC-010: returns a page and a cursor when more matches exist', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => row(index));
    ChatMessageMock.find.mockReturnValue(queryChain(rows));

    const res = createResponse();
    await searchMessages(createRequest({ q: 'deploy' }), res);

    expect(res.body.results).toHaveLength(20);
    expect(res.body.nextCursor).toBe(`${rows[19].createdAt.getTime()}_${String(rows[19]._id)}`);
  });

  it('AC-010: rejects a malformed cursor instead of querying with it', async () => {
    const res = createResponse();
    await searchMessages(createRequest({ q: 'deploy', before: 'not-a-cursor' }), res);

    expect(res.statusCode).toBe(400);
    expect(ChatMessageMock.find).not.toHaveBeenCalled();
  });

  it('AC-024: a caller who cannot read the channel gets no rows', async () => {
    loadChannelMock.mockResolvedValue({ ok: false, failure: { status: 404, message: 'Channel not found' } });

    const res = createResponse();
    await searchMessages(createRequest({ q: 'deploy' }), res);

    expect(res.statusCode).toBe(404);
    expect(ChatMessageMock.find).not.toHaveBeenCalled();
  });
});
