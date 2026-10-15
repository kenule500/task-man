import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Workspace from '../models/workspaceModel.js';
import {
  getWorkspaceMembers,
  regenerateInviteCode,
  updateWorkspace,
  validateUpdateWorkspace,
} from '../controllers/workspaceController.js';

jest.mock('../models/workspaceModel.js', () => ({
  __esModule: true,
  default: { exists: jest.fn(), find: jest.fn(), findOne: jest.fn(), findById: jest.fn(), create: jest.fn() },
}));

jest.mock('../models/userModel.js', () => ({
  __esModule: true,
  default: { find: jest.fn(), findByIdAndUpdate: jest.fn() },
}));

jest.mock('../models/roleModel.js', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn(), findById: jest.fn() },
}));

const WorkspaceMock = Workspace as unknown as Record<string, jest.Mock>;

type TestResponse = Response & { statusCode?: number; body?: any };

const createResponse = (): TestResponse => {
  const res = { locals: {} } as unknown as TestResponse;
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

const createWorkspace = () => ({
  _id: new Types.ObjectId(),
  name: 'Acme',
  slug: 'acme',
  inviteCode: 'OLDCODE',
  members: [],
  save: jest.fn().mockResolvedValue(undefined),
});

// requirePermission (tested separately) attaches the workspace before these handlers run
const createRequest = (workspace: ReturnType<typeof createWorkspace>, body: Record<string, unknown> = {}) =>
  ({ body, params: { slug: workspace.slug }, workspace }) as unknown as Request;

const runValidators = async (validators: { run: (req: Request) => Promise<unknown> }[], req: Request) => {
  for (const validator of validators) await validator.run(req);
};

const role = (name: string, isSystem = true) => ({ _id: new Types.ObjectId(), name, description: '', isSystem });
const user = (name: string) => ({
  _id: new Types.ObjectId(), name, email: `${name.toLowerCase().replace(' ', '.')}@test.dev`, avatarUrl: '', jobTitle: '',
});

describe('getWorkspaceMembers', () => {
  it('lists members by role seniority, custom roles last, then by name', async () => {
    const workspace = createWorkspace();
    WorkspaceMock.findById.mockReturnValue({
      populate: () => ({
        populate: async () => ({
          members: [
            { user: user('Zoe Dev'), roleId: role('Developer'), joinedAt: new Date() },
            { user: user('Ana Custom'), roleId: role('QA Lead', false), joinedAt: new Date() },
            { user: user('Owner One'), roleId: role('Product Owner'), joinedAt: new Date() },
            { user: user('Adam Dev'), roleId: role('Developer'), joinedAt: new Date() },
            { user: null, roleId: role('Viewer'), joinedAt: new Date() },
          ],
        }),
      }),
    });
    const res = createResponse();
    await getWorkspaceMembers(createRequest(workspace), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.map((m: { name: string }) => m.name)).toEqual(['Owner One', 'Adam Dev', 'Zoe Dev', 'Ana Custom']);
    expect(Object.keys(res.body[0]).sort()).toEqual(['_id', 'avatarUrl', 'email', 'jobTitle', 'joinedAt', 'name', 'role']);
  });

  it('returns 404 when the workspace disappeared', async () => {
    WorkspaceMock.findById.mockReturnValue({ populate: () => ({ populate: async () => null }) });
    const res = createResponse();
    await getWorkspaceMembers(createRequest(createWorkspace()), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('updateWorkspace', () => {
  it('renames with a trimmed name and keeps the slug', async () => {
    const workspace = createWorkspace();
    const req = createRequest(workspace, { name: '  Acme Labs  ' });
    const res = createResponse();
    await runValidators(validateUpdateWorkspace, req);
    await updateWorkspace(req, res);

    expect(res.statusCode).toBe(200);
    expect(workspace.name).toBe('Acme Labs');
    expect(workspace.slug).toBe('acme');
    expect(workspace.save).toHaveBeenCalled();
  });

  it.each([[''], ['x'.repeat(61)], [{ $gt: '' }]])('rejects an invalid name %p', async name => {
    const workspace = createWorkspace();
    const req = createRequest(workspace, { name });
    const res = createResponse();
    await runValidators(validateUpdateWorkspace, req);
    await updateWorkspace(req, res);

    expect(res.statusCode).toBe(400);
    expect(workspace.save).not.toHaveBeenCalled();
  });
});

describe('regenerateInviteCode', () => {
  it('generates and returns a new code', async () => {
    const workspace = createWorkspace();
    const res = createResponse();
    await regenerateInviteCode(createRequest(workspace), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.inviteCode).toMatch(/^[A-F0-9]{12}$/);
    expect(res.body.inviteCode).not.toBe('OLDCODE');
    expect(workspace.save).toHaveBeenCalled();
  });
});
