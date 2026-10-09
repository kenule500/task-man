import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Role from '../models/roleModel.js';
import Workspace from '../models/workspaceModel.js';
import User from '../models/userModel.js';
import { canGrantRole, findAssignableRole } from '../utils/roleAccess.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { changeMemberRole } from '../controllers/memberController.js';
import { joinWorkspace } from '../controllers/workspaceController.js';
import { SYSTEM_ROLES } from '../config/permissions.js';

jest.mock('../models/roleModel.js', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/workspaceModel.js', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn(), exists: jest.fn() },
}));
jest.mock('../models/userModel.js', () => ({
  __esModule: true,
  default: { findById: jest.fn(), findByIdAndUpdate: jest.fn() },
}));

const RoleMock = Role as unknown as Record<string, jest.Mock>;
const WorkspaceMock = Workspace as unknown as Record<string, jest.Mock>;
const UserMock = User as unknown as Record<string, jest.Mock>;

const systemRole = (name: string) => {
  const definition = SYSTEM_ROLES.find(role => role.name === name)!;
  return { _id: new Types.ObjectId(), name, isSystem: true, permissions: [...definition.permissions] };
};
const OWNER = systemRole('Product Owner');
const SCRUM_MASTER = systemRole('Scrum Master');
const DEVELOPER = systemRole('Developer');
const VIEWER = systemRole('Viewer');

type TestResponse = Response & { statusCode?: number; body?: any };
const createResponse = (): TestResponse => {
  const res = {} as TestResponse;
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; }) as unknown as Response['status'];
  res.json = jest.fn((body: unknown) => { res.body = body; return res; }) as unknown as Response['json'];
  return res;
};

describe('canGrantRole', () => {
  it('lets the owner grant anything', () => {
    expect(canGrantRole([], OWNER, true)).toBe(true);
  });

  it('never lets a non-owner grant Product Owner', () => {
    expect(canGrantRole(OWNER.permissions, OWNER, false)).toBe(false);
  });

  it('only allows roles within the actor\'s own permissions', () => {
    expect(canGrantRole(SCRUM_MASTER.permissions, DEVELOPER, false)).toBe(true);
    expect(canGrantRole(DEVELOPER.permissions, SCRUM_MASTER, false)).toBe(false);
  });
});

describe('findAssignableRole', () => {
  it.each([[{ $ne: null }], [123], ['not-an-id'], [undefined]])('rejects %p without querying', async roleId => {
    await expect(findAssignableRole(new Types.ObjectId(), roleId)).resolves.toBeNull();
    expect(RoleMock.findOne).not.toHaveBeenCalled();
  });

  it('only matches system roles or roles of the same workspace', async () => {
    const workspaceId = new Types.ObjectId();
    const roleId = new Types.ObjectId().toString();
    RoleMock.findOne.mockResolvedValue(DEVELOPER);
    await findAssignableRole(workspaceId, roleId);
    expect(RoleMock.findOne).toHaveBeenCalledWith({ _id: roleId, $or: [{ isSystem: true }, { workspaceId }] });
  });
});

describe('requireUserId', () => {
  it('returns a string so identity comparisons work with ObjectIds', () => {
    const id = new Types.ObjectId();
    const value = requireUserId({ user: { _id: id } } as unknown as Request, createResponse());
    expect(value).toBe(id.toString());
  });
});

describe('joinWorkspace', () => {
  it('ignores a role sent by the client and assigns Viewer', async () => {
    const userId = new Types.ObjectId();
    const workspace = { _id: new Types.ObjectId(), members: [] as unknown[], save: jest.fn() };
    WorkspaceMock.findOne.mockResolvedValue(workspace);
    RoleMock.findOne.mockResolvedValue(VIEWER);
    UserMock.findByIdAndUpdate.mockResolvedValue({});

    const req = { user: { _id: userId }, body: { inviteCode: 'abcdef123456', roleId: OWNER._id.toString() } } as unknown as Request;
    const res = createResponse();
    await joinWorkspace(req, res);

    expect(res.statusCode).toBe(200);
    expect(RoleMock.findById).not.toHaveBeenCalled();
    expect(workspace.members).toEqual([expect.objectContaining({ roleId: VIEWER._id })]);
  });

  it.each([[{ $gt: '' }], ['short'], [undefined]])('rejects an invalid invite code %p', async inviteCode => {
    const res = createResponse();
    await joinWorkspace({ user: { _id: new Types.ObjectId() }, body: { inviteCode } } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(WorkspaceMock.findOne).not.toHaveBeenCalled();
  });
});

describe('changeMemberRole', () => {
  const ownerId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const targetId = new Types.ObjectId();

  const setup = (actorPermissions: string[], targetRole = DEVELOPER) => {
    const target = { user: targetId, roleId: targetRole._id };
    const workspace = { _id: new Types.ObjectId(), owner: ownerId, members: [{ user: adminId, roleId: SCRUM_MASTER._id }, target], save: jest.fn() };
    RoleMock.findById.mockResolvedValue(targetRole);
    return { workspace, target, permissions: actorPermissions };
  };

  const call = async (actorId: Types.ObjectId, targetUserId: string, roleId: string, ctx: ReturnType<typeof setup>) => {
    const req = {
      user: { _id: actorId }, params: { userId: targetUserId }, body: { roleId },
      workspace: ctx.workspace, permissions: ctx.permissions,
    } as unknown as Request;
    const res = createResponse();
    await changeMemberRole(req, res);
    return res;
  };

  it('blocks changing your own role (self-promotion)', async () => {
    const ctx = setup(SCRUM_MASTER.permissions);
    const res = await call(adminId, adminId.toString(), OWNER._id.toString(), ctx);
    expect(res.statusCode).toBe(400);
  });

  it('blocks granting a role above the actor\'s permissions', async () => {
    const ctx = setup(DEVELOPER.permissions);
    RoleMock.findOne.mockResolvedValue(SCRUM_MASTER);
    const res = await call(adminId, targetId.toString(), SCRUM_MASTER._id.toString(), ctx);
    expect(res.statusCode).toBe(403);
    expect(ctx.workspace.save).not.toHaveBeenCalled();
  });

  it('blocks non-owners from granting Product Owner', async () => {
    const ctx = setup(OWNER.permissions);
    RoleMock.findOne.mockResolvedValue(OWNER);
    const res = await call(adminId, targetId.toString(), OWNER._id.toString(), ctx);
    expect(res.statusCode).toBe(403);
  });

  it('rejects roles from another workspace', async () => {
    const ctx = setup(SCRUM_MASTER.permissions);
    RoleMock.findOne.mockResolvedValue(null);
    const res = await call(adminId, targetId.toString(), new Types.ObjectId().toString(), ctx);
    expect(res.statusCode).toBe(404);
  });

  it('lets the owner change roles', async () => {
    const ctx = setup([]);
    RoleMock.findOne.mockResolvedValue(SCRUM_MASTER);
    const res = await call(ownerId, targetId.toString(), SCRUM_MASTER._id.toString(), ctx);
    expect(res.statusCode).toBe(200);
    expect(ctx.target.roleId).toBe(SCRUM_MASTER._id);
  });
});
