import { Types } from 'mongoose';
import { onActivity } from '../utils/activity.js';
import { emitToRoom } from '../realtime/bus.js';
import { registerActivityRealtime } from '../realtime/activityEvents.js';

jest.mock('../utils/activity.js', () => ({ __esModule: true, onActivity: jest.fn() }));
jest.mock('../realtime/bus.js', () => ({
  __esModule: true,
  emitToRoom: jest.fn(),
  workspaceRoom: (workspaceId: string) => `workspace:${workspaceId}`,
  projectRoom: (workspaceId: string) => `workspace:${workspaceId}:projects`,
  auditRoom: (workspaceId: string) => `workspace:${workspaceId}:audit`,
}));

const onActivityMock = onActivity as unknown as jest.Mock;

const workspaceId = new Types.ObjectId();
const entryId = new Types.ObjectId();
const actorId = new Types.ObjectId();
const createdAt = new Date('2026-10-18T10:00:00.000Z');

describe('activity realtime', () => {
  it('AC-032: pushes recorded activity over the socket with a resume cursor', async () => {
    registerActivityRealtime();
    const listener = onActivityMock.mock.calls[0][0];

    await listener(
      { user: { _id: actorId, name: 'Ada' } },
      {
        _id: entryId,
        action: 'task.updated',
        workspace: workspaceId,
        actor: actorId,
        summary: 'Fix login',
        createdAt,
        changes: [{ field: 'title', from: 'Old', to: 'New' }],
      },
    );

    expect(emitToRoom).toHaveBeenCalledWith(
      `workspace:${String(workspaceId)}`,
      'activity:changed',
      {
        change: expect.objectContaining({
          id: String(entryId),
          action: 'task.updated',
          actor: { _id: String(actorId), name: 'Ada' },
          summary: 'Fix login',
          fields: [{ field: 'title', from: 'Old', to: 'New' }],
        }),
        cursor: `${createdAt.getTime()}_${String(entryId)}`,
      },
    );

    // Project-scoped entries go only to members who may read projects
    await listener(
      { user: { _id: actorId, name: 'Ada' } },
      {
        _id: new Types.ObjectId(),
        action: 'project.updated',
        workspace: workspaceId,
        summary: 'Alpha',
        createdAt,
      },
    );
    expect(emitToRoom).toHaveBeenLastCalledWith(
      `workspace:${String(workspaceId)}:projects`,
      'activity:changed',
      expect.any(Object),
    );
  });
});
