import { Request, Response } from 'express';
import { Types } from 'mongoose';
import User from '../models/userModel.js';
import {
  getWorkspaceMembers,
  regenerateInviteCode,
  updateWorkspace,
  validateUpdateWorkspace,
} from '../controllers/workspaceController.js';

jest.mock('../models/workspaceModel.js', () => ({
  __esModule: true,
  default: { exists: jest.fn(), find: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));

jest.mock('../models/userModel.js', () => ({
  __esModule: true,
  default: { find: jest.fn(), findByIdAndUpdate: jest.fn() },
}));

const UserMock = User as unknown as Record<string, jest.Mock>;

const ownerId = new Types.ObjectId();
const adminId = new Types.ObjectId();
const memberAId = new Types.ObjectId();
const memberBId = new Types.ObjectId();

type TestResponse = Response & { statusCode?: number; body?: any };

const createWorkspace = () => ({
  name: 'Acme',
  slug: 'acme',
  inviteCode: 'OLDCODE',
  members: [
    { user: memberBId, role: 'member', joinedAt: new Date('2026-03-01') },
    { user: adminId, role: 'admin', joinedAt: new Date('2026-02-01') },
    { user: memberAId, role: 'member', joinedAt: new Date('2026-04-01') },
    { user: ownerId, role: 'owner', joinedAt: new Date('2026-01-01') },
  ],
  save: jest.fn().mockResolvedValue(undefined),
});

const createResponse = (workspace = createWorkspace()): TestResponse => {
  const res = { locals: { workspace } } as unknown as TestResponse;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response['status'];
  res.json = jest.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response['json'];
  return res;
};

const createRequest = (userId: Types.ObjectId, body: Record<string, unknown> = {}) =>
  ({ body, params: { slug: 'acme' }, user: { _id: userId } }) as unknown as Request;

const runValidators = async (validators: { run: (req: Request) => Promise<unknown> }[], req: Request) => {
  for (const validator of validators) await validator.run(req);
};

beforeEach(() => jest.clearAllMocks());

describe('getWorkspaceMembers', () => {
  const users = [
    { _id: ownerId, name: 'Zed Owner', email: 'o@x.com', avatarUrl: '', jobTitle: 'CEO' },
    { _id: adminId, name: 'Ann Admin', email: 'a@x.com', avatarUrl: '', jobTitle: '' },
    { _id: memberAId, name: 'Bob', email: 'b@x.com', avatarUrl: '', jobTitle: 'Dev' },
    { _id: memberBId, name: 'Amy', email: 'm@x.com', avatarUrl: '', jobTitle: '' },
  ];

  it('lists owner first, then admins, then members by name, without sensitive fields', async () => {
    const select = jest.fn().mockResolvedValue(users);
    UserMock.find.mockReturnValue({ select });
    const res = createResponse();
    await getWorkspaceMembers(createRequest(ownerId), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.map((m: { name: string }) => m.name)).toEqual(['Zed Owner', 'Ann Admin', 'Amy', 'Bob']);
    expect(res.body.map((m: { role: string }) => m.role)).toEqual(['owner', 'admin', 'member', 'member']);
    expect(res.body[0]).toEqual(expect.objectContaining({ email: 'o@x.com', jobTitle: 'CEO', joinedAt: expect.any(Date) }));
    expect(select).toHaveBeenCalledWith('name email avatarUrl jobTitle');
    expect(JSON.stringify(res.body)).not.toMatch(/password|token/i);
  });
});

describe('updateWorkspace', () => {
  it('forbids regular members', async () => {
    const req = createRequest(memberAId, { name: 'New name' });
    const res = createResponse();
    await runValidators(validateUpdateWorkspace, req);
    await updateWorkspace(req, res);

    expect(res.statusCode).toBe(403);
    expect((res.locals.workspace as { save: jest.Mock }).save).not.toHaveBeenCalled();
  });

  it('rejects an empty or too long name', async () => {
    for (const name of ['   ', 'x'.repeat(61)]) {
      const req = createRequest(ownerId, { name });
      const res = createResponse();
      await runValidators(validateUpdateWorkspace, req);
      await updateWorkspace(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.errors[0].path).toBe('name');
    }
  });

  it('renames with a trimmed name and keeps the slug', async () => {
    const req = createRequest(adminId, { name: '  New name  ' });
    const res = createResponse();
    await runValidators(validateUpdateWorkspace, req);
    await updateWorkspace(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ name: 'New name', slug: 'acme' });
    expect((res.locals.workspace as { save: jest.Mock }).save).toHaveBeenCalled();
  });
});

describe('regenerateInviteCode', () => {
  it('forbids regular members', async () => {
    const res = createResponse();
    await regenerateInviteCode(createRequest(memberBId), res);

    expect(res.statusCode).toBe(403);
    expect(res.locals.workspace.inviteCode).toBe('OLDCODE');
  });

  it('generates a new code for admins', async () => {
    const res = createResponse();
    await regenerateInviteCode(createRequest(adminId), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.inviteCode).toMatch(/^[0-9A-F]{12}$/);
    expect(res.body.inviteCode).not.toBe('OLDCODE');
    expect(res.locals.workspace.save).toHaveBeenCalled();
  });
});
