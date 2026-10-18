import { Request, Response } from 'express';
import { Types } from 'mongoose';
import ChatChannel from '../models/chatChannelModel.js';
import Project from '../models/projectModel.js';
import Workspace from '../models/workspaceModel.js';
import {
  backfillProjectChannels, ensureDefaultChannels, startDirect,
} from '../controllers/chatChannelController.js';

jest.mock('../models/chatChannelModel.js', () => ({
  __esModule: true,
  CHANNEL_KINDS: ['team', 'general', 'project', 'direct'],
  MAX_CHANNEL_NAME: 60,
  MAX_CHANNEL_DESCRIPTION: 200,
  MAX_DIRECT_PARTICIPANTS: 2,
  directKeyOf: (a: string, b: string) => [String(a), String(b)].sort().join(':'),
  default: {
    bulkWrite: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock('../models/chatMessageModel.js', () => ({
  __esModule: true,
  MAX_MESSAGE_BODY: 4000,
  default: { aggregate: jest.fn(), find: jest.fn() },
}));

jest.mock('../models/chatReadModel.js', () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock('../models/projectModel.js', () => ({
  __esModule: true,
  default: { bulkWrite: jest.fn(), find: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../models/userModel.js', () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock('../models/workspaceModel.js', () => ({
  __esModule: true,
  default: { findById: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../realtime/bus.js', () => ({ emitToChannel: jest.fn() }));
jest.mock('../utils/gridfs.js', () => ({
  deleteFiles: jest.fn(),
  openFileStream: jest.fn(),
  saveFile: jest.fn(),
}));

const ChatChannelMock = ChatChannel as unknown as Record<string, jest.Mock>;
const ProjectMock = Project as unknown as Record<string, jest.Mock>;
const WorkspaceMock = Workspace as unknown as Record<string, jest.Mock>;

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
const me = new Types.ObjectId();
const other = new Types.ObjectId();

const createRequest = (options: {
  body?: Record<string, unknown>;
  permissions?: string[];
} = {}): Request => ({
  body: options.body ?? {},
  params: { slug: 'acme' },
  workspace: { _id: workspaceId },
  permissions: options.permissions ?? ['chat:read', 'chat:dm'],
  user: { _id: me },
}) as unknown as Request;

// `.select(...).lean()` is the shape every query in these handlers uses
const chain = (value: unknown) => ({ select: () => ({ lean: async () => value }) });

beforeEach(() => {
  Object.values(ChatChannelMock).forEach(fn => fn.mockReset?.());
  Object.values(ProjectMock).forEach(fn => fn.mockReset?.());
  Object.values(WorkspaceMock).forEach(fn => fn.mockReset?.());
  ChatChannelMock.bulkWrite.mockResolvedValue({});
  ProjectMock.bulkWrite.mockResolvedValue({});
});

describe('startDirect', () => {
  it('AC-026: creates one direct channel per pair and returns its two members', async () => {
    WorkspaceMock.findOne.mockReturnValue(chain({ _id: workspaceId }));
    ChatChannelMock.findOne.mockReturnValue(chain(null));
    ChatChannelMock.create.mockImplementation(async (input: Record<string, unknown>) => ({
      toObject: () => ({ _id: new Types.ObjectId(), archived: false, ...input }),
    }));

    const res = createResponse();
    await startDirect(createRequest({ body: { userId: other.toString() } }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.kind).toBe('direct');
    expect(res.body.participants.map(String)).toEqual([me.toString(), other.toString()]);
    expect(res.body.directKey).toBe([me.toString(), other.toString()].sort().join(':'));
    // The header can never fall back to the workspace count (AC-068)
    expect(res.body.memberCount).toBe(2);
  });

  it('AC-026: reuses the pair’s existing channel instead of creating a duplicate', async () => {
    const existingId = new Types.ObjectId();
    WorkspaceMock.findOne.mockReturnValue(chain({ _id: workspaceId }));
    ChatChannelMock.findOne.mockReturnValue(chain({
      _id: existingId, kind: 'direct', participants: [me, other],
    }));

    const res = createResponse();
    await startDirect(createRequest({ body: { userId: other.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(String(res.body._id)).toBe(existingId.toString());
    expect(res.body.memberCount).toBe(2);
    expect(ChatChannelMock.create).not.toHaveBeenCalled();
  });

  it('AC-068: refuses a conversation with yourself', async () => {
    const res = createResponse();
    await startDirect(createRequest({ body: { userId: me.toString() } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/yourself/i);
  });

  it('AC-008: refuses a caller without chat:dm', async () => {
    const res = createResponse();
    await startDirect(createRequest({ body: { userId: other.toString() }, permissions: ['chat:read'] }), res);

    expect(res.statusCode).toBe(403);
    expect(ChatChannelMock.create).not.toHaveBeenCalled();
  });

  it('AC-027: a user outside the workspace cannot be messaged', async () => {
    WorkspaceMock.findOne.mockReturnValue(chain(null));

    const res = createResponse();
    await startDirect(createRequest({ body: { userId: other.toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(ChatChannelMock.create).not.toHaveBeenCalled();
  });
});

describe('ensureDefaultChannels', () => {
  it('AC-003: seeds exactly one team and one general channel, with fixed names', async () => {
    await ensureDefaultChannels(workspaceId);

    const [operations] = ChatChannelMock.bulkWrite.mock.calls[0];
    expect(operations).toHaveLength(2);
    expect(operations.map((op: any) => op.updateOne.filter.kind)).toEqual(['team', 'general']);
    expect(operations.map((op: any) => op.updateOne.update.$setOnInsert.name)).toEqual(['Team Chat', 'General']);
    expect(operations.every((op: any) => op.updateOne.upsert === true)).toBe(true);
    // The stated purpose is refreshed on every pass, not only on insert
    expect(operations.every((op: any) => typeof op.updateOne.update.$set.description === 'string')).toBe(true);
  });
});

describe('backfillProjectChannels', () => {
  it('AC-067: adds a missing creator to the project members before creating its channel', async () => {
    const withCreator = new Types.ObjectId();
    const missingCreator = new Types.ObjectId();
    ProjectMock.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          { _id: withCreator, name: 'Alpha', createdBy: me, members: [me] },
          { _id: missingCreator, name: 'Beta', createdBy: other, members: [] },
        ],
      }),
    });

    await backfillProjectChannels(workspaceId);

    const [memberOps] = ProjectMock.bulkWrite.mock.calls[0];
    expect(memberOps).toHaveLength(1);
    expect(String(memberOps[0].updateOne.filter._id)).toBe(missingCreator.toString());
    expect(memberOps[0].updateOne.update.$addToSet.members).toEqual(other);

    const [channelOps] = ChatChannelMock.bulkWrite.mock.calls[0];
    expect(channelOps).toHaveLength(2);
    expect(channelOps.map((op: any) => op.updateOne.update.$setOnInsert.name)).toEqual(['Alpha', 'Beta']);
  });
});
