import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Project from '../models/projectModel.js';
import Page from '../models/pageModel.js';
import {
  archiveProjectChannel, createProjectChannel,
} from '../controllers/chatChannelController.js';
import { createProject, deleteProject } from '../controllers/projectController.js';

// Only the collaborators createProject/deleteProject touch are mocked; everything else in the
// controller is exercised through these two hooks.
jest.mock('../models/projectModel.js', () => ({
  __esModule: true,
  MAX_PROJECT_NAME: 80,
  MAX_PROJECT_DESCRIPTION: 500,
  PROJECT_COLORS: ['slate', 'blue'],
  PROJECT_ICONS: ['folder', 'rocket'],
  projectKeyFrom: (name: string) => name.slice(0, 3).toUpperCase(),
  default: { create: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../models/sprintModel.js', () => ({
  __esModule: true,
  MAX_SPRINT_NAME: 80,
  MAX_SPRINT_GOAL: 500,
  default: { deleteMany: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../models/taskModel.js', () => ({ __esModule: true, default: { updateMany: jest.fn() } }));
jest.mock('../models/pageModel.js', () => ({ __esModule: true, default: { find: jest.fn(), deleteMany: jest.fn() } }));
jest.mock('../models/pageVersionModel.js', () => ({ __esModule: true, default: { deleteMany: jest.fn() } }));
jest.mock('../models/customFieldModel.js', () => ({ __esModule: true, default: { updateMany: jest.fn() } }));
jest.mock('../utils/activity.js', () => ({
  __esModule: true,
  diffFields: jest.fn(() => []),
  recordActivity: jest.fn(async () => undefined),
}));
jest.mock('../controllers/chatChannelController.js', () => ({
  __esModule: true,
  createProjectChannel: jest.fn(async () => undefined),
  archiveProjectChannel: jest.fn(async () => undefined),
}));
jest.mock('../controllers/taskController.js', () => ({
  __esModule: true,
  TaskRuleError: class TaskRuleError extends Error {},
  handleError: jest.fn(),
  hasValidationErrors: jest.fn(() => false),
  workspaceOf: (req: Request) => (req as unknown as { workspace: unknown }).workspace,
}));

const ProjectMock = Project as unknown as Record<string, jest.Mock>;
const PageMock = Page as unknown as Record<string, jest.Mock>;

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
const me = new Types.ObjectId();

const createRequestBody = (): Request => ({
  body: { name: 'Alpha' },
  params: { slug: 'acme' },
  workspace: { _id: workspaceId },
  user: { _id: me, name: 'Ada' },
}) as unknown as Request;

const deleteRequestBody = (): Request => ({
  body: {},
  params: { slug: 'acme', id: projectId.toString() },
  workspace: { _id: workspaceId },
  user: { _id: me, name: 'Ada' },
}) as unknown as Request;

describe('project lifecycle hooks', () => {
  beforeEach(() => {
    Object.values(ProjectMock).forEach(fn => fn.mockReset?.());
    Object.values(PageMock).forEach(fn => fn.mockReset?.());
    PageMock.find.mockReturnValue({
      collation: () => ({ select: () => ({ lean: async () => [] }) }),
    });
  });

  it('AC-004: creating a project creates its channel in the same request', async () => {
    const project = {
      _id: projectId,
      name: 'Alpha',
      toObject: () => ({ _id: projectId, name: 'Alpha' }),
    };
    ProjectMock.create.mockResolvedValue(project);

    const res = createResponse();
    await createProject(createRequestBody(), res);

    expect(res.statusCode).toBe(201);
    expect(createProjectChannel).toHaveBeenCalledTimes(1);
    expect(createProjectChannel).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ _id: projectId, name: 'Alpha' }),
    );
  });

  it('AC-005: deleting a project archives its channel instead of deleting the conversation', async () => {
    const project = {
      _id: projectId,
      name: 'Alpha',
      workspace: workspaceId,
      deleteOne: jest.fn(async () => undefined),
    };
    ProjectMock.findOne.mockResolvedValue(project);

    const res = createResponse();
    await deleteProject(deleteRequestBody(), res);

    expect(res.statusCode).toBe(200);
    expect(archiveProjectChannel).toHaveBeenCalledWith(workspaceId, projectId);
    // History is never removed here: the message rows are not touched by this cascade
    expect(archiveProjectChannel).toHaveBeenCalledTimes(1);
  });
});
