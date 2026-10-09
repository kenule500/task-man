import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Workspace from '../models/workspaceModel.js';
import Role from '../models/roleModel.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

jest.mock('../models/workspaceModel.js', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../models/roleModel.js', () => ({ __esModule: true, default: { findById: jest.fn() } }));

const findWorkspace = Workspace.findOne as jest.Mock;
const findRole = Role.findById as jest.Mock;

const userId = new Types.ObjectId().toString();
const roleId = new Types.ObjectId();

type TestResponse = Response & { statusCode?: number; body?: any };

const createResponse = (): TestResponse => {
  const res = {} as TestResponse;
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

const createRequest = (overrides: Partial<Record<'user' | 'params' | 'query', unknown>> = {}) =>
  ({ user: { _id: userId }, params: { slug: 'acme' }, query: {}, ...overrides }) as unknown as Request;

const workspaceWithMember = () => ({ _id: new Types.ObjectId(), slug: 'acme', members: [{ user: userId, roleId }] });

describe('requirePermission', () => {
  it('rejects anonymous requests', async () => {
    const res = createResponse();
    const next = jest.fn();
    await requirePermission('tasks:read')(createRequest({ user: undefined }), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('requires a workspace slug', async () => {
    const res = createResponse();
    await requirePermission('tasks:read')(createRequest({ params: {} }), res, jest.fn());
    expect(res.statusCode).toBe(400);
  });

  it('rejects users who are not members', async () => {
    findWorkspace.mockResolvedValue(null);
    const res = createResponse();
    await requirePermission('tasks:read')(createRequest(), res, jest.fn());
    expect(res.statusCode).toBe(403);
  });

  it('rejects members whose role lacks the permission', async () => {
    findWorkspace.mockResolvedValue(workspaceWithMember());
    findRole.mockResolvedValue({ name: 'Viewer', permissions: ['tasks:read'] });
    const res = createResponse();
    const next = jest.fn();
    await requirePermission('tasks:delete')(createRequest(), res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the workspace, role and permissions for allowed members', async () => {
    const workspace = workspaceWithMember();
    const role = { name: 'Developer', permissions: ['tasks:read', 'tasks:write'] };
    findWorkspace.mockResolvedValue(workspace);
    findRole.mockResolvedValue(role);
    const req = createRequest();
    const next = jest.fn();
    await requirePermission('tasks:write')(req, createResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.workspace).toBe(workspace);
    expect(req.permissions).toEqual(role.permissions);
  });
});
