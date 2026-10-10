import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Task from '../models/taskModel.js';
import { recordActivity } from '../utils/activity.js';
import { deleteFiles } from '../utils/gridfs.js';
import {
  bulkDeleteTasks,
  bulkUpdateTasks,
  validateBulkDelete,
  validateBulkUpdate,
} from '../controllers/bulkTaskController.js';

jest.mock('../utils/gridfs.js', () => ({ deleteFiles: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/activity.js', () => ({
  ...jest.requireActual('../utils/activity.js'),
  recordActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../models/taskModel.js', () => ({
  __esModule: true,
  TASK_STATUSES: ['pending', 'in-progress', 'completed'],
  TASK_PRIORITIES: ['low', 'medium', 'high'],
  MAX_LABELS: 3,
  MAX_LABEL_LENGTH: 10,
  MAX_STORY_POINTS: 100,
  TASK_TYPES: ['story', 'task', 'bug', 'spike'],
  default: {
    populate: jest.fn(async (docs: unknown) => docs),
    find: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const TaskMock = Task as unknown as Record<string, jest.Mock>;
const workspaceId = new Types.ObjectId();
const memberId = new Types.ObjectId().toString();
const outsiderId = new Types.ObjectId().toString();
const workspace = { _id: workspaceId, members: [{ user: new Types.ObjectId(memberId) }] };

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

const createRequest = (body: Record<string, unknown>) =>
  ({ body, params: {}, query: {}, user: { _id: 'user-1' }, workspace }) as unknown as Request;

const run = async (validators: { run: (req: Request) => Promise<unknown> }[], req: Request) => {
  for (const validator of validators) await validator.run(req);
};

/** A minimal stand-in for a Mongoose document that tracks whether it was modified. */
const createTask = (fields: Record<string, unknown> = {}) => {
  const doc: Record<string, any> = {
    _id: new Types.ObjectId(), title: 'Task', status: 'pending', priority: 'medium', type: 'task',
    labels: [], assignees: [], project: '', sprint: null, attachments: [], ...fields,
  };
  let modified = false;
  doc.set = jest.fn((key: string, value: unknown) => {
    if (JSON.stringify(doc[key]) !== JSON.stringify(value)) modified = true;
    doc[key] = value;
  });
  doc.isModified = jest.fn(() => modified);
  doc.save = jest.fn().mockResolvedValue(doc);
  doc.toObject = jest.fn(() => ({ ...doc }));
  return doc;
};

const ids = (count: number) => Array.from({ length: count }, () => new Types.ObjectId().toString());

beforeEach(() => jest.clearAllMocks());

describe('bulkUpdateTasks validation', () => {
  const validate = async (body: Record<string, unknown>) => {
    const req = createRequest(body);
    const res = createResponse();
    await run(validateBulkUpdate, req);
    await bulkUpdateTasks(req, res);
    return res;
  };

  it.each([
    ['no ids', { ids: [], patch: { status: 'completed' } }],
    ['more than 100 ids', { ids: ids(101), patch: { status: 'completed' } }],
    ['an invalid id', { ids: ['nope'], patch: { status: 'completed' } }],
    ['a missing patch', { ids: ids(1) }],
    ['an invalid status', { ids: ids(1), patch: { status: 'done' } }],
    ['an invalid priority', { ids: ids(1), patch: { priority: 'urgent' } }],
    ['an invalid type', { ids: ids(1), patch: { type: 'epic' } }],
    ['an invalid sprint id', { ids: ids(1), patch: { sprint: 'x' } }],
    ['an invalid assignee id', { ids: ids(1), patch: { assignees: { add: ['x'] } } }],
    ['labels that are not text', { ids: ids(1), patch: { labels: { add: [3] } } }],
    ['a label that is too long', { ids: ids(1), patch: { labels: { add: ['x'.repeat(11)] } } }],
    ['assignees that are not an object', { ids: ids(1), patch: { assignees: ['a'] } }],
  ])('rejects %s', async (_name, body) => {
    const res = await validate(body);
    expect(res.statusCode).toBe(400);
    expect(TaskMock.find).not.toHaveBeenCalled();
  });

  it('rejects a patch without any known field', async () => {
    const res = await validate({ ids: ids(1), patch: { title: 'nope' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/nothing to change/i);
  });

  it('rejects assignees that are not workspace members', async () => {
    const res = await validate({ ids: ids(1), patch: { assignees: { add: [outsiderId] } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/members/i);
  });

  it('returns 404 when none of the tasks belong to the workspace', async () => {
    TaskMock.find.mockResolvedValue([]);
    const res = await validate({ ids: ids(2), patch: { status: 'completed' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('bulkUpdateTasks', () => {
  it('changes status and priority on every task and records one audit entry per changed task', async () => {
    const tasks = [createTask({ title: 'A' }), createTask({ title: 'B', status: 'completed' })];
    TaskMock.find.mockResolvedValue(tasks);
    const req = createRequest({ ids: tasks.map(t => String(t._id)), patch: { status: 'completed', priority: 'high' } });
    const res = createResponse();
    await run(validateBulkUpdate, req);
    await bulkUpdateTasks(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ status: 'completed', priority: 'high' });
    expect(TaskMock.find).toHaveBeenCalledWith({ _id: { $in: expect.any(Array) }, workspace: workspaceId });
    expect(tasks[0].save).toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledTimes(2);
    expect(recordActivity).toHaveBeenCalledWith(req, expect.objectContaining({
      action: 'task.updated', summary: 'A',
      changes: expect.arrayContaining([{ field: 'status', from: 'pending', to: 'completed' }]),
    }));
  });

  it('does not save or audit tasks that already have the values', async () => {
    const task = createTask({ status: 'completed' });
    TaskMock.find.mockResolvedValue([task]);
    const req = createRequest({ ids: [String(task._id)], patch: { status: 'completed' } });
    const res = createResponse();
    await run(validateBulkUpdate, req);
    await bulkUpdateTasks(req, res);

    expect(res.statusCode).toBe(200);
    expect(task.save).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it('adds and removes assignees and labels without duplicates (labels compared ignoring case)', async () => {
    const other = new Types.ObjectId().toString();
    const task = createTask({ assignees: [new Types.ObjectId(other)], labels: ['UI', 'old'] });
    TaskMock.find.mockResolvedValue([task]);
    const req = createRequest({
      ids: [String(task._id)],
      patch: {
        assignees: { add: [memberId, memberId], remove: [other] },
        labels: { add: ['ui', 'new'], remove: ['OLD'] },
      },
    });
    const res = createResponse();
    await run(validateBulkUpdate, req);
    await bulkUpdateTasks(req, res);

    expect(res.statusCode).toBe(200);
    expect(task.assignees).toEqual([memberId]);
    expect(task.labels).toEqual(['UI', 'new']);
  });

  it('saves nothing when one task would exceed the label limit', async () => {
    const full = createTask({ title: 'Full', labels: ['a', 'b', 'c'] });
    const room = createTask({ title: 'Room' });
    TaskMock.find.mockResolvedValue([room, full]);
    const req = createRequest({ ids: [String(room._id), String(full._id)], patch: { labels: { add: ['d'] } } });
    const res = createResponse();
    await run(validateBulkUpdate, req);
    await bulkUpdateTasks(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Full/);
    expect(room.save).not.toHaveBeenCalled();
    expect(full.save).not.toHaveBeenCalled();
  });

  it('removes the sprint without touching the project and moves subtasks along', async () => {
    const task = createTask({ project: 'Web', sprint: new Types.ObjectId() });
    TaskMock.find.mockResolvedValue([task]);
    const req = createRequest({ ids: [String(task._id)], patch: { sprint: null } });
    const res = createResponse();
    await run(validateBulkUpdate, req);
    await bulkUpdateTasks(req, res);

    expect(res.statusCode).toBe(200);
    expect(task).toMatchObject({ project: 'Web', sprint: null });
    expect(TaskMock.updateMany).toHaveBeenCalledWith(
      { workspace: workspaceId, parent: task._id },
      { $set: { project: 'Web', sprint: null } },
    );
  });
});

describe('bulkDeleteTasks', () => {
  it('validates the ids', async () => {
    const req = createRequest({ ids: [] });
    const res = createResponse();
    await run(validateBulkDelete, req);
    await bulkDeleteTasks(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when no task belongs to the workspace', async () => {
    TaskMock.find.mockResolvedValueOnce([]);
    const req = createRequest({ ids: ids(1) });
    const res = createResponse();
    await run(validateBulkDelete, req);
    await bulkDeleteTasks(req, res);
    expect(res.statusCode).toBe(404);
    expect(TaskMock.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes tasks with their subtasks, detaches dependencies, removes files and audits each task', async () => {
    const fileId = new Types.ObjectId();
    const a = createTask({ title: 'A', attachments: [{ fileId }] });
    const b = createTask({ title: 'B' });
    const sub = { _id: new Types.ObjectId(), parent: a._id, attachments: [] };
    TaskMock.find.mockResolvedValueOnce([a, b]);
    TaskMock.find.mockReturnValueOnce({ select: () => ({ lean: async () => [sub] }) });
    const req = createRequest({ ids: [String(a._id), String(b._id)] });
    const res = createResponse();
    await run(validateBulkDelete, req);
    await bulkDeleteTasks(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: [String(a._id), String(b._id)], subtasks: [String(sub._id)] });
    expect(TaskMock.deleteMany).toHaveBeenCalledWith({ _id: { $in: [a._id, b._id, sub._id] }, workspace: workspaceId });
    expect(TaskMock.updateMany).toHaveBeenCalledWith(
      { workspace: workspaceId, dependencies: { $in: [a._id, b._id, sub._id] } },
      { $pull: { dependencies: { $in: [a._id, b._id, sub._id] } } },
    );
    expect(deleteFiles).toHaveBeenCalledWith([fileId]);
    expect(recordActivity).toHaveBeenCalledTimes(2);
    expect(recordActivity).toHaveBeenCalledWith(req, expect.objectContaining({
      action: 'task.deleted', summary: 'A', changes: [{ field: 'subtasks', from: '1' }],
    }));
  });

  it('does not list a selected subtask twice', async () => {
    const parent = createTask({ title: 'Parent' });
    const child = createTask({ title: 'Child', parent: parent._id });
    TaskMock.find.mockResolvedValueOnce([parent, child]);
    TaskMock.find.mockReturnValueOnce({ select: () => ({ lean: async () => [{ _id: child._id, parent: parent._id }] }) });
    const req = createRequest({ ids: [String(parent._id), String(child._id)] });
    const res = createResponse();
    await run(validateBulkDelete, req);
    await bulkDeleteTasks(req, res);

    expect(res.body.deleted).toHaveLength(2);
    expect(res.body.subtasks).toEqual([]);
  });
});
