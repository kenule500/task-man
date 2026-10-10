import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Task from '../models/taskModel.js';
import { deleteFiles } from '../utils/gridfs.js';
import {
  createTask,
  getTasks,
  deleteTask,
  updateTask,
  validateCreateTask,
  validateUpdateTask,
} from '../controllers/taskController.js';

jest.mock('../utils/notify.js', () => ({ notifyTaskEvents: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/gridfs.js', () => ({ deleteFiles: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/taskNumbers.js', () => ({
  reserveTaskNumbers: jest.fn().mockResolvedValue(1),
  ensureTaskNumbers: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/activity.js', () => ({
  ...jest.requireActual('../utils/activity.js'),
  recordActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../models/taskModel.js', () => ({
  __esModule: true,
  TASK_STATUSES: ['pending', 'in-progress', 'completed'],
  TASK_PRIORITIES: ['low', 'medium', 'high'],
  MAX_LABELS: 10,
  MAX_LABEL_LENGTH: 40,
  MAX_STORY_POINTS: 100,
  TASK_TYPES: ['story', 'task', 'bug', 'spike', 'epic'],
  default: {
    populate: jest.fn(async (docs: unknown) => docs),
    aggregate: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    exists: jest.fn(),
  },
}));

const TaskMock = Task as unknown as Record<string, jest.Mock>;
const workspaceId = new Types.ObjectId();
const memberId = new Types.ObjectId().toString();
const outsiderId = new Types.ObjectId().toString();
const workspace = { _id: workspaceId, members: [{ user: new Types.ObjectId(memberId) }] };
const taskId = new Types.ObjectId().toString();

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

const createRequest = (body: Record<string, unknown>, params: Record<string, string> = {}) =>
  ({ body, params, query: {}, user: { _id: 'user-1' }, workspace }) as unknown as Request;

const runValidators = async (validators: { run: (req: Request) => Promise<unknown> }[], req: Request) => {
  for (const validator of validators) await validator.run(req);
};

/** A minimal stand-in for a Mongoose document. */
const createTaskDocument = (fields: Record<string, unknown>) => {
  const doc: Record<string, any> = { ...fields };
  doc.set = jest.fn((key: string, value: unknown) => { doc[key] = value; });
  doc.save = jest.fn().mockResolvedValue(doc);
  doc.toObject = jest.fn(() => ({ ...doc }));
  return doc;
};

describe('createTask', () => {
  it('rejects a task without title or deadline', async () => {
    const req = createRequest({ title: '  ' });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);

    expect(res.statusCode).toBe(400);
    const fields = res.body.errors.map((e: { path: string }) => e.path);
    expect(fields).toEqual(expect.arrayContaining(['title', 'deadline']));
    expect(TaskMock.create).not.toHaveBeenCalled();
  });

  it('rejects a start date after the deadline', async () => {
    const req = createRequest({ title: 'Ship', startDate: '2026-10-10', deadline: '2026-10-01' });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/start date/i);
  });

  it('creates the task in the current workspace for the current user', async () => {
    TaskMock.create.mockImplementation(async (data: unknown) => data);
    const req = createRequest({ title: 'Ship', deadline: '2026-10-01', dependencies: [] });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ title: 'Ship', owner: 'user-1', workspace: workspaceId });
  });

  it('saves the project label', async () => {
    TaskMock.create.mockImplementation(async (data: unknown) => data);
    const req = createRequest({ title: 'Ship', deadline: '2026-10-01', project: 'Website' });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ project: 'Website' });
  });

  it('rejects a project name longer than 60 characters', async () => {
    const req = createRequest({ title: 'Ship', deadline: '2026-10-01', project: 'p'.repeat(61) });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);

    expect(res.statusCode).toBe(400);
  });
});

describe('updateTask', () => {
  it('returns 404 when the task is not in the workspace', async () => {
    TaskMock.findOne.mockResolvedValue(null);
    const req = createRequest({ status: 'completed' }, { id: taskId });
    const res = createResponse();
    await runValidators(validateUpdateTask, req);
    await updateTask(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('updates only the provided fields', async () => {
    const doc = createTaskDocument({ title: 'Old', status: 'pending', deadline: new Date('2026-10-05') });
    TaskMock.findOne.mockResolvedValue(doc);
    const req = createRequest({ status: 'in-progress' }, { id: taskId });
    const res = createResponse();
    await runValidators(validateUpdateTask, req);
    await updateTask(req, res);

    expect(res.statusCode).toBe(200);
    // The status plus the stage that goes with it
    expect(doc.set).toHaveBeenCalledTimes(2);
    expect(doc.status).toBe('in-progress');
    expect(doc.stage).toBe('in-progress');
    expect(doc.title).toBe('Old');
  });

  it('refuses a dependency that would create a cycle', async () => {
    const otherId = new Types.ObjectId().toString();
    TaskMock.findOne.mockResolvedValue(createTaskDocument({ deadline: new Date('2026-10-05') }));
    TaskMock.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          { _id: taskId, dependencies: [] },
          { _id: otherId, dependencies: [taskId] },
        ],
      }),
    });
    const req = createRequest({ dependencies: [otherId] }, { id: taskId });
    const res = createResponse();
    await runValidators(validateUpdateTask, req);
    await updateTask(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cycle/i);
  });
});

describe('deleteTask', () => {
  it('returns 404 for an invalid id', async () => {
    const res = createResponse();
    await deleteTask(createRequest({}, { id: 'nope' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('deletes the task and detaches it from dependants', async () => {
    const deletedId = new Types.ObjectId(taskId);
    TaskMock.findOneAndDelete.mockResolvedValue({ _id: deletedId });
    TaskMock.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    TaskMock.updateMany.mockResolvedValue({});
    const res = createResponse();
    await deleteTask(createRequest({}, { id: taskId }), res);

    expect(res.statusCode).toBe(200);
    expect(TaskMock.deleteMany).not.toHaveBeenCalled();
    expect(TaskMock.updateMany).toHaveBeenCalledWith(
      { workspace: workspaceId, dependencies: { $in: [deletedId] } },
      { $pull: { dependencies: { $in: [deletedId] } } },
    );
  });

  it('deletes the subtasks of a deleted parent and detaches them too', async () => {
    const deletedId = new Types.ObjectId(taskId);
    const subtaskId = new Types.ObjectId();
    TaskMock.findOneAndDelete.mockResolvedValue({ _id: deletedId });
    TaskMock.find.mockReturnValue({ select: () => ({ lean: async () => [{ _id: subtaskId, attachments: [] }] }) });
    TaskMock.deleteMany.mockResolvedValue({});
    TaskMock.updateMany.mockResolvedValue({});
    const res = createResponse();
    await deleteTask(createRequest({}, { id: taskId }), res);

    expect(res.statusCode).toBe(200);
    expect(TaskMock.deleteMany).toHaveBeenCalledWith({ _id: { $in: [subtaskId] } });
    expect(res.body).toMatchObject({ id: taskId, subtasks: [String(subtaskId)] });
  });
});

describe('labels and assignees', () => {
  beforeEach(() => {
    TaskMock.create.mockImplementation(async (data: unknown) => data);
    TaskMock.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  });

  it('normalizes labels: trims, drops blanks and duplicates', async () => {
    const req = createRequest({
      title: 'Ship', deadline: '2026-10-01', labels: ['  Bug ', 'bug', '', 'Ui   polish'],
    });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.labels).toEqual(['Bug', 'Ui polish']);
  });

  it('rejects labels over 40 characters or more than 10 labels', async () => {
    const long = createRequest({ title: 'Ship', deadline: '2026-10-01', labels: ['x'.repeat(41)] });
    const resLong = createResponse();
    await runValidators(validateCreateTask, long);
    await createTask(long, resLong);
    expect(resLong.statusCode).toBe(400);

    const many = createRequest({
      title: 'Ship', deadline: '2026-10-01', labels: Array.from({ length: 11 }, (_, i) => `l${i}`),
    });
    const resMany = createResponse();
    await runValidators(validateCreateTask, many);
    await createTask(many, resMany);
    expect(resMany.statusCode).toBe(400);
    expect(TaskMock.create).not.toHaveBeenCalled();
  });

  it('accepts assignees that are workspace members', async () => {
    const req = createRequest({ title: 'Ship', deadline: '2026-10-01', assignees: [memberId, memberId] });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.assignees).toEqual([memberId]);
  });

  it('rejects assignees outside the workspace on create and update', async () => {
    const req = createRequest({ title: 'Ship', deadline: '2026-10-01', assignees: [outsiderId] });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/members/i);

    TaskMock.findOne.mockResolvedValue(createTaskDocument({ deadline: new Date('2026-10-05') }));
    const updateReq = createRequest({ assignees: [outsiderId] }, { id: taskId });
    const updateRes = createResponse();
    await runValidators(validateUpdateTask, updateReq);
    await updateTask(updateReq, updateRes);
    expect(updateRes.statusCode).toBe(400);
  });

  it('rejects malformed assignee ids', async () => {
    const req = createRequest({ title: 'Ship', deadline: '2026-10-01', assignees: ['nope'] });
    const res = createResponse();
    await runValidators(validateCreateTask, req);
    await createTask(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('updates labels and assignees', async () => {
    const doc = createTaskDocument({ deadline: new Date('2026-10-05') });
    TaskMock.findOne.mockResolvedValue(doc);
    const req = createRequest({ labels: [' a ', 'A'], assignees: [memberId] }, { id: taskId });
    const res = createResponse();
    await runValidators(validateUpdateTask, req);
    await updateTask(req, res);

    expect(res.statusCode).toBe(200);
    expect(doc.labels).toEqual(['a']);
    expect(doc.assignees).toEqual([memberId]);
  });
});

describe('getTasks', () => {
  it('filters by the current user for assignee=me and populates public fields only', async () => {
    const userId = new Types.ObjectId();
    TaskMock.aggregate.mockResolvedValue([{ title: 'A' }]);
    const req = { ...createRequest({}), query: { assignee: 'me', label: 'bug' }, user: { _id: userId } } as unknown as Request;
    const res = createResponse();
    await getTasks(req, res);

    const [pipeline] = TaskMock.aggregate.mock.calls[0];
    expect(pipeline[0].$match).toMatchObject({ workspace: workspaceId, labels: 'bug' });
    expect(String(pipeline[0].$match.assignees)).toBe(userId.toString());
    expect(TaskMock.populate).toHaveBeenCalledWith(
      [{ title: 'A' }],
      [
        { path: 'assignees', select: 'name avatarUrl' },
        { path: 'comments.author', select: 'name avatarUrl' },
      ],
    );
    expect(res.statusCode).toBe(200);
  });
});

describe('deleteTask attachments', () => {
  it('deletes the GridFS files of a deleted task', async () => {
    const fileId = new Types.ObjectId();
    TaskMock.findOneAndDelete.mockResolvedValue({ _id: new Types.ObjectId(taskId), attachments: [{ fileId }] });
    TaskMock.updateMany.mockResolvedValue({});
    const res = createResponse();
    await deleteTask(createRequest({}, { id: taskId }), res);

    expect(res.statusCode).toBe(200);
    expect(deleteFiles).toHaveBeenCalledWith([fileId]);
  });
});
