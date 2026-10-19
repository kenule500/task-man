import { Request, Response } from 'express';
import { Types } from 'mongoose';
import ChatChannel from '../models/chatChannelModel.js';
import ChatMessage from '../models/chatMessageModel.js';
import ChatRead from '../models/chatReadModel.js';
import Project from '../models/projectModel.js';
import User from '../models/userModel.js';
import Workspace from '../models/workspaceModel.js';
import {
  DEFAULT_CHANNELS, displayNameOf, listChannels, listTeamChannels,
} from '../controllers/chatChannelController.js';

jest.mock('../models/chatChannelModel.js', () => ({
  __esModule: true,
  CHANNEL_KINDS: ['team', 'general', 'project', 'direct'],
  MAX_CHANNEL_NAME: 60,
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
jest.mock('../realtime/bus.js', () => ({ __esModule: true, emitToChannel: jest.fn() }));
jest.mock('../utils/gridfs.js', () => ({
  __esModule: true,
  deleteFiles: jest.fn(),
  openFileStream: jest.fn(),
  saveFile: jest.fn(),
}));

const ChatChannelMock = ChatChannel as unknown as Record<string, jest.Mock>;
const ChatMessageMock = ChatMessage as unknown as Record<string, jest.Mock>;
const ChatReadMock = ChatRead as unknown as Record<string, jest.Mock>;
const ProjectMock = Project as unknown as Record<string, jest.Mock>;
const UserMock = User as unknown as Record<string, jest.Mock>;
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
const projectId = new Types.ObjectId();
const memberId = new Types.ObjectId();
const otherId = new Types.ObjectId();
const teamChannelId = new Types.ObjectId();
const generalChannelId = new Types.ObjectId();
const projectChannelId = new Types.ObjectId();
const directChannelId = new Types.ObjectId();

const teamAt = new Date('2026-10-18T10:00:00.000Z');
const readAt = new Date('2026-10-18T11:00:00.000Z');
const projectAt = new Date('2026-10-18T12:00:00.000Z');

const rows = [
  {
    _id: teamChannelId,
    kind: 'team',
    name: 'Team Chat',
    description: 'Day-to-day team coordination',
    archived: false,
    participants: [],
    lastMessageAt: teamAt,
  },
  {
    _id: generalChannelId,
    kind: 'general',
    name: 'General',
    description: 'Workspace-wide announcements',
    archived: false,
    participants: [],
    lastMessageAt: null,
  },
  {
    _id: projectChannelId,
    kind: 'project',
    name: 'Alpha',
    description: '',
    project: projectId,
    nameOverride: 'Alpha Team',
    avatarFileId: 'avatar-1',
    archived: false,
    participants: [],
    lastMessageAt: projectAt,
  },
  {
    _id: directChannelId,
    kind: 'direct',
    name: 'Direct message',
    description: '',
    archived: false,
    participants: [memberId, otherId],
    lastMessageAt: null,
  },
];

const createRequest = (): Request => ({
  params: { slug: 'acme' },
  query: {},
  workspace: { _id: workspaceId },
  permissions: ['chat:read'],
  user: { _id: memberId },
}) as unknown as Request;

const leanChain = (value: unknown) => ({ select: () => ({ lean: async () => value }) });

const primeListing = () => {
  ChatChannelMock.bulkWrite.mockResolvedValue({});
  ChatMessageMock.aggregate.mockResolvedValue([]);
  ProjectMock.bulkWrite.mockResolvedValue({});
  ChatChannelMock.find.mockReturnValue({
    select: () => ({ sort: () => ({ lean: async () => rows }) }),
  });
  WorkspaceMock.findById.mockReturnValue(leanChain({ members: [memberId, otherId, new Types.ObjectId(), new Types.ObjectId()] }));
  ChatReadMock.find.mockReturnValue(leanChain([{ channel: teamChannelId, lastReadAt: readAt }]));
  UserMock.find.mockReturnValue(leanChain([{ _id: otherId, name: 'Grace', avatarUrl: '' }]));

  let projectCall = 0;
  ProjectMock.find.mockImplementation(() => {
    projectCall += 1;
    // 1: backfill (needs creator and members), 2: caller's projects, 3: member counts for the list
    if (projectCall === 1) {
      return leanChain([{ _id: projectId, name: 'Alpha', createdBy: memberId, members: [memberId] }]);
    }
    if (projectCall === 2) return leanChain([{ _id: projectId }]);
    return leanChain([{ _id: projectId, members: [memberId, otherId, new Types.ObjectId()] }]);
  });
};

beforeEach(() => {
  Object.values(ChatChannelMock).forEach(fn => fn.mockReset?.());
  Object.values(ChatMessageMock).forEach(fn => fn.mockReset?.());
  Object.values(ChatReadMock).forEach(fn => fn.mockReset?.());
  Object.values(ProjectMock).forEach(fn => fn.mockReset?.());
  Object.values(UserMock).forEach(fn => fn.mockReset?.());
  Object.values(WorkspaceMock).forEach(fn => fn.mockReset?.());
});

describe('listChannels', () => {
  it('AC-006: a channel list request backfills projects that predate the feature', async () => {
    primeListing();

    const res = createResponse();
    await listChannels(createRequest(), res);

    // One bulkWrite seeds the two defaults, the other gives existing projects their channel
    expect(ChatChannelMock.bulkWrite).toHaveBeenCalledTimes(2);
    const [projectOps] = ChatChannelMock.bulkWrite.mock.calls[1];
    expect(projectOps).toHaveLength(1);
    expect(projectOps[0].updateOne.update.$setOnInsert).toMatchObject({ kind: 'project', project: projectId });
    expect(projectOps[0].updateOne.upsert).toBe(true);
  });

  it('AC-034: both default channels carry a distinct purpose for the client to show', async () => {
    primeListing();

    const res = createResponse();
    await listChannels(createRequest(), res);

    const team = res.body.find((row: any) => row.kind === 'team');
    const general = res.body.find((row: any) => row.kind === 'general');
    expect(team.description).toMatch(/team/i);
    expect(general.description).toMatch(/workspace/i);
    expect(team.description).not.toBe(general.description);
    // The constant is what is seeded, so its two purposes must stay distinct too
    expect(DEFAULT_CHANNELS[0].description).not.toBe(DEFAULT_CHANNELS[1].description);
  });

  it('AC-051: the member count matches what each channel kind actually admits', async () => {
    primeListing();

    const res = createResponse();
    await listChannels(createRequest(), res);

    const byId = new Map<string, any>(res.body.map((row: any) => [String(row._id), row] as [string, any]));
    // Workspace members for the two defaults
    expect(byId.get(String(teamChannelId)).memberCount).toBe(4);
    expect(byId.get(String(generalChannelId)).memberCount).toBe(4);
    // The owning project's members for a team channel
    expect(byId.get(String(projectChannelId)).memberCount).toBe(3);
    // A direct conversation is exactly its two participants
    expect(byId.get(String(directChannelId)).memberCount).toBe(2);
  });

  it('AC-055: unread state is derived from the server read pointer', async () => {
    primeListing();

    const res = createResponse();
    await listChannels(createRequest(), res);

    const byId = new Map<string, any>(res.body.map((row: any) => [String(row._id), row] as [string, any]));
    // The team channel was read after its last message
    expect(byId.get(String(teamChannelId)).unread).toBe(false);
    // The project channel has a newer message than any read pointer
    expect(byId.get(String(projectChannelId)).unread).toBe(true);
    // A channel with no messages is never unread
    expect(byId.get(String(generalChannelId)).unread).toBe(false);
  });
});

describe('listTeamChannels', () => {
  it('AC-043: only the caller\'s projects are queried, so unreadable channels are absent', async () => {
    primeListing();
    ProjectMock.find.mockReset();
    ProjectMock.find.mockImplementation(() => leanChain([{
      _id: projectId, name: 'Alpha', createdBy: memberId, members: [memberId],
    }]));

    const res = createResponse();
    await listTeamChannels(createRequest(), res);

    const [filter] = ChatChannelMock.find.mock.calls[0];
    expect(filter.kind).toBe('project');
    expect(filter.project.$in.map(String)).toEqual([String(projectId)]);
    const projectQuery = ProjectMock.find.mock.calls.find(([query]: any[]) => query.members)?.[0];
    expect(String(projectQuery.workspace)).toBe(String(workspaceId));
    expect(String(projectQuery.members)).toBe(String(memberId));
  });
});

describe('displayNameOf', () => {
  it('AC-046: a rename override wins over the project name, and falls back when unset', () => {
    expect(displayNameOf({ name: 'Alpha', nameOverride: 'Alpha Team' }, 'Alpha')).toBe('Alpha Team');
    expect(displayNameOf({ name: 'Alpha', nameOverride: null }, 'Alpha')).toBe('Alpha');
    expect(displayNameOf({ name: 'Team Chat' })).toBe('Team Chat');
  });
});
