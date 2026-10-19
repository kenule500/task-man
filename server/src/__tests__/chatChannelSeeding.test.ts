import { Types } from 'mongoose';
import ChatChannel from '../models/chatChannelModel.js';
import ChatMessage from '../models/chatMessageModel.js';
import {
  archiveProjectChannel, createProjectChannel, ensureDefaultChannels,
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
  default: { deleteMany: jest.fn(), find: jest.fn(), aggregate: jest.fn() },
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
const workspaceId = new Types.ObjectId();
const projectId = new Types.ObjectId();

beforeEach(() => {
  Object.values(ChatChannelMock).forEach(fn => fn.mockReset?.());
  Object.values(ChatMessageMock).forEach(fn => fn.mockReset?.());
});

describe('project channels', () => {
  it('AC-037: creates exactly one channel per project, keyed by the project', async () => {
    ChatChannelMock.updateOne.mockResolvedValue({ upsertedCount: 1 });

    await createProjectChannel(workspaceId, { _id: projectId, name: 'Alpha' });
    // A second call for the same project must hit the same upsert, never a second insert
    await createProjectChannel(workspaceId, { _id: projectId, name: 'Alpha' });

    expect(ChatChannelMock.create).not.toHaveBeenCalled();
    expect(ChatChannelMock.updateOne).toHaveBeenCalledTimes(2);
    for (const [filter, update, options] of ChatChannelMock.updateOne.mock.calls) {
      expect(filter).toEqual({ workspace: workspaceId, project: projectId });
      expect(update.$setOnInsert).toMatchObject({
        workspace: workspaceId,
        kind: 'project',
        project: projectId,
        name: 'Alpha',
      });
      expect(options).toEqual({ upsert: true });
    }
  });

  it('AC-037: a concurrent duplicate insert is tolerated rather than thrown', async () => {
    ChatChannelMock.updateOne.mockRejectedValueOnce({ code: 11000 });
    await expect(createProjectChannel(workspaceId, { _id: projectId, name: 'Alpha' })).resolves.toBeUndefined();
  });

  it('AC-005: archiving a project channel makes it read-only and keeps its messages', async () => {
    ChatChannelMock.updateOne.mockResolvedValue({ acknowledged: true });

    await archiveProjectChannel(workspaceId, projectId);

    expect(ChatChannelMock.updateOne).toHaveBeenCalledWith(
      { workspace: workspaceId, project: projectId },
      { $set: { archived: true } },
    );
    expect(ChatMessageMock.deleteMany).not.toHaveBeenCalled();
  });
});

describe('default channels', () => {
  it('AC-003/AC-034: seeds both fixed channels and refreshes their distinct purposes', async () => {
    ChatChannelMock.bulkWrite.mockResolvedValue({});

    await ensureDefaultChannels(workspaceId);

    const [operations] = ChatChannelMock.bulkWrite.mock.calls[0];
    expect(operations).toHaveLength(2);
    const descriptions = operations.map((op: any) => op.updateOne.update.$set.description);
    expect(descriptions.every(Boolean)).toBe(true);
    expect(new Set(descriptions).size).toBe(2);
  });
});
