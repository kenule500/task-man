import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { recordActivity } from '../utils/activity.js';
import {
  getBoardSettings,
  updateBoardSettings,
  validateBoardSettings,
  wipLimitsOf,
} from '../controllers/boardSettingsController.js';

jest.mock('../utils/activity.js', () => ({
  ...jest.requireActual('../utils/activity.js'),
  recordActivity: jest.fn().mockResolvedValue(undefined),
}));

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

const createWorkspace = (wipLimits?: Record<string, number | null>) => {
  const workspace: Record<string, any> = {
    _id: new Types.ObjectId(), name: 'Acme', boardSettings: wipLimits ? { wipLimits } : undefined,
  };
  workspace.set = jest.fn((key: string, value: unknown) => { workspace[key] = value; });
  workspace.save = jest.fn().mockResolvedValue(undefined);
  return workspace;
};

const createRequest = (workspace: unknown, body: Record<string, unknown> = {}) =>
  ({ body, params: {}, query: {}, user: { _id: 'user-1' }, workspace }) as unknown as Request;

const put = async (workspace: unknown, body: Record<string, unknown>) => {
  const req = createRequest(workspace, body);
  const res = createResponse();
  for (const validator of validateBoardSettings) await validator.run(req);
  await updateBoardSettings(req, res);
  return { req, res };
};

beforeEach(() => jest.clearAllMocks());

describe('wipLimitsOf', () => {
  it('defaults every column to no limit, also for workspaces created before the setting existed', () => {
    expect(wipLimitsOf(createWorkspace() as never)).toEqual({ pending: null, 'in-progress': null, completed: null });
  });
});

describe('getBoardSettings', () => {
  it('returns the stored limits', async () => {
    const res = createResponse();
    await getBoardSettings(createRequest(createWorkspace({ 'in-progress': 3 })), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ wipLimits: { pending: null, 'in-progress': 3, completed: null } });
  });
});

describe('updateBoardSettings', () => {
  it('saves valid limits, keeps columns left out and audits the change', async () => {
    const workspace = createWorkspace({ pending: 5 });
    const { req, res } = await put(workspace, { wipLimits: { 'in-progress': 4, completed: null } });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ wipLimits: { pending: 5, 'in-progress': 4, completed: null } });
    expect(workspace.save).toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledWith(req, {
      action: 'workspace.updated', summary: 'Acme',
      changes: [{ field: 'wip:in-progress', from: undefined, to: '4' }],
    });
  });

  it('clears a limit with null', async () => {
    const workspace = createWorkspace({ pending: 5 });
    const { res } = await put(workspace, { wipLimits: { pending: null } });
    expect(res.body.wipLimits.pending).toBeNull();
  });

  it('does not audit when nothing changed', async () => {
    await put(createWorkspace({ pending: 5 }), { wipLimits: { pending: 5 } });
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', { pending: 0 }],
    ['a negative number', { pending: -1 }],
    ['more than 999', { pending: 1000 }],
    ['a fraction', { pending: 2.5 }],
    ['a numeric string', { pending: '3' }],
    ['an unknown column', { blocked: 3 }],
  ])('rejects %s', async (_name, wipLimits) => {
    const workspace = createWorkspace();
    const { res } = await put(workspace, { wipLimits });
    expect(res.statusCode).toBe(400);
    expect(workspace.save).not.toHaveBeenCalled();
  });

  it('rejects a body without wipLimits', async () => {
    const { res } = await put(createWorkspace(), {});
    expect(res.statusCode).toBe(400);
  });
});
