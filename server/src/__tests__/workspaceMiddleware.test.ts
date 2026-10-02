import { Request, Response } from 'express';
import Workspace from '../models/workspaceModel.js';
import { requireWorkspaceMember } from '../middleware/workspaceMiddleware.js';

jest.mock('../models/workspaceModel.js', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

const findOne = Workspace.findOne as jest.Mock;

const createResponse = () => {
  const res = { locals: {} } as unknown as Response & { statusCode?: number; body?: unknown };
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

const createRequest = (userId?: string) =>
  ({ params: { slug: 'acme' }, user: userId ? { _id: userId } : undefined }) as unknown as Request;

describe('requireWorkspaceMember', () => {
  it('rejects anonymous requests', async () => {
    const res = createResponse();
    const next = jest.fn();
    await requireWorkspaceMember(createRequest(), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown workspace', async () => {
    findOne.mockResolvedValue(null);
    const res = createResponse();
    await requireWorkspaceMember(createRequest('u1'), res, jest.fn());
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when the user is not a member', async () => {
    findOne.mockResolvedValue({ members: [{ user: 'someone-else' }] });
    const res = createResponse();
    await requireWorkspaceMember(createRequest('u1'), res, jest.fn());
    expect(res.statusCode).toBe(403);
  });

  it('exposes the workspace and continues for members', async () => {
    const workspace = { _id: 'ws1', members: [{ user: 'u1' }] };
    findOne.mockResolvedValue(workspace);
    const res = createResponse();
    const next = jest.fn();
    await requireWorkspaceMember(createRequest('u1'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.workspace).toBe(workspace);
  });
});
