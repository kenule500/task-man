import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Task from '../models/taskModel.js';
import {
  createTask,
  deleteTask,
  updateTask,
  validateCreateTask,
  validateUpdateTask,
} from '../controllers/taskController.js';

jest.mock('../models/taskModel.js', () => ({
  __esModule: true,
  TASK_STATUSES: ['pending', 'in-progress', 'completed'],
  TASK_PRIORITIES: ['low', 'medium', 'high'],
  default: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    updateMany: jest.fn(),
  },
}));

const TaskMock = Task as unknown as Record<string, jest.Mock>;
const workspaceId = new Types.ObjectId();
const taskId = new Types.ObjectId().toString();

type TestResponse = Response & { statusCode?: number; body?: any };

const createResponse = (): TestResponse => {
  const res = { locals: { workspace: { _id: workspaceId } } } as unknown as TestResponse;
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
  ({ body, params, user: { _id: 'user-1' } }) as unknown as Request;

const runValidators = async (validators: { run: (req: Request) => Promise<unknown> }[], req: Request) => {
  for (const validator of validators) await validator.run(req);
};

/** A minimal stand-in for a Mongoose document. */
const createTaskDocument = (fields: Record<string, unknown>) => {
  const doc: Record<string, any> = { ...fields };
  doc.set = jest.fn((key: string, value: unknown) => { doc[key] = value; });
  doc.save = jest.fn().mockResolvedValue(doc);
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
    expect(doc.set).toHaveBeenCalledTimes(1);
    expect(doc.status).toBe('in-progress');
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
    TaskMock.updateMany.mockResolvedValue({});
    const res = createResponse();
    await deleteTask(createRequest({}, { id: taskId }), res);

    expect(res.statusCode).toBe(200);
    expect(TaskMock.updateMany).toHaveBeenCalledWith(
      { workspace: workspaceId, dependencies: deletedId },
      { $pull: { dependencies: deletedId } },
    );
  });
});
