import { Types } from 'mongoose';
import { validationResult } from 'express-validator';
import Task from '../models/taskModel.js';
import {
  assertEpicTypeChange,
  findValidEpic,
  resolveEpicLink,
  TaskRuleError,
  validateCreateTask,
} from '../controllers/taskController.js';

jest.mock('../models/taskModel.js', () => ({
  __esModule: true,
  TASK_STATUSES: ['pending', 'in-progress', 'completed'],
  TASK_PRIORITIES: ['low', 'medium', 'high'],
  MAX_LABELS: 10,
  MAX_LABEL_LENGTH: 40,
  MAX_STORY_POINTS: 100,
  TASK_TYPES: ['story', 'task', 'bug', 'spike', 'epic'],
  default: { findOne: jest.fn(), exists: jest.fn() },
}));

const TaskMock = Task as unknown as Record<string, jest.Mock>;
const workspaceId = new Types.ObjectId();
const epicId = new Types.ObjectId().toString();

/** Task.findOne(...).select(...).lean() resolving to `doc`. */
const foundEpic = (doc: Record<string, unknown> | null) =>
  TaskMock.findOne.mockReturnValue({ select: () => ({ lean: async () => doc }) });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findValidEpic', () => {
  it('returns the epic id and project', async () => {
    foundEpic({ _id: new Types.ObjectId(epicId), type: 'epic', project: 'Web' });
    await expect(findValidEpic(workspaceId, epicId, null)).resolves.toMatchObject({ project: 'Web' });
    // the query always carries the workspace and a cast ObjectId
    const filter = TaskMock.findOne.mock.calls[0][0];
    expect(filter.workspace).toBe(workspaceId);
    expect(filter._id).toBeInstanceOf(Types.ObjectId);
  });

  it('rejects operator objects, malformed ids and itself before querying', async () => {
    await expect(findValidEpic(workspaceId, { $ne: '' }, null)).rejects.toThrow('Invalid epic');
    await expect(findValidEpic(workspaceId, 'nope', null)).rejects.toThrow('Invalid epic');
    await expect(findValidEpic(workspaceId, epicId, epicId)).rejects.toThrow('its own epic');
    expect(TaskMock.findOne).not.toHaveBeenCalled();
  });

  it('rejects missing tasks and tasks that are not epics', async () => {
    foundEpic(null);
    await expect(findValidEpic(workspaceId, epicId, null)).rejects.toThrow('Epic not found');
    foundEpic({ _id: new Types.ObjectId(), type: 'story', project: '' });
    await expect(findValidEpic(workspaceId, epicId, null)).rejects.toBeInstanceOf(TaskRuleError);
  });
});

describe('resolveEpicLink', () => {
  const item = { type: 'story', project: '', sprint: null, parent: null };

  it('keeps an item without epic untouched and never queries', async () => {
    await expect(resolveEpicLink(workspaceId, { ...item, project: 'Web' }, { epicGiven: false }))
      .resolves.toEqual({ epic: null, project: 'Web' });
    expect(TaskMock.findOne).not.toHaveBeenCalled();
  });

  it('links an item and takes the epic project when the item has none', async () => {
    foundEpic({ _id: new Types.ObjectId(epicId), type: 'epic', project: 'Web' });
    await expect(resolveEpicLink(workspaceId, { ...item, epic: epicId }, { epicGiven: true }))
      .resolves.toEqual({ epic: epicId, project: 'Web' });
  });

  it('rejects an epic from another project', async () => {
    foundEpic({ _id: new Types.ObjectId(epicId), type: 'epic', project: 'Web' });
    await expect(resolveEpicLink(workspaceId, { ...item, project: 'Api', epic: epicId }, { epicGiven: true }))
      .rejects.toThrow('another project');
  });

  it('keeps epics as containers: no epic, no parent, no sprint', async () => {
    const epic = { type: 'epic', project: 'Web', sprint: null, parent: null };
    await expect(resolveEpicLink(workspaceId, { ...epic, epic: epicId }, { epicGiven: true })).rejects.toThrow('another epic');
    await expect(resolveEpicLink(workspaceId, { ...epic, parent: epicId }, { epicGiven: false })).rejects.toThrow('subtask');
    await expect(resolveEpicLink(workspaceId, { ...epic, sprint: epicId }, { epicGiven: false })).rejects.toThrow('sprint');
    // a stale epic on a task that just became an epic is dropped instead of rejected
    await expect(resolveEpicLink(workspaceId, { ...epic, epic: epicId }, { epicGiven: false }))
      .resolves.toEqual({ epic: null, project: 'Web' });
  });

  it('makes subtasks inherit the epic of their parent', async () => {
    const sub = { ...item, project: 'Web', parent: new Types.ObjectId().toString() };
    await expect(resolveEpicLink(workspaceId, sub, { epicGiven: false, parentEpic: epicId }))
      .resolves.toEqual({ epic: epicId, project: 'Web' });
    await expect(resolveEpicLink(workspaceId, { ...sub, epic: epicId }, { epicGiven: true, parentEpic: epicId }))
      .resolves.toMatchObject({ epic: epicId });
    await expect(resolveEpicLink(workspaceId, { ...sub, epic: new Types.ObjectId() }, { epicGiven: true, parentEpic: epicId }))
      .rejects.toThrow('inherit');
  });
});

describe('assertEpicTypeChange', () => {
  const taskId = new Types.ObjectId();

  it('does nothing when no epic is involved', async () => {
    await assertEpicTypeChange(workspaceId, taskId, 'story', 'bug');
    await assertEpicTypeChange(workspaceId, taskId, 'epic', 'epic');
    expect(TaskMock.exists).not.toHaveBeenCalled();
  });

  it('refuses to turn an epic with items back into a normal task', async () => {
    TaskMock.exists.mockResolvedValue({ _id: new Types.ObjectId() });
    await expect(assertEpicTypeChange(workspaceId, taskId, 'epic', 'story')).rejects.toThrow('Move its items first');
    TaskMock.exists.mockResolvedValue(null);
    await expect(assertEpicTypeChange(workspaceId, taskId, 'epic', 'story')).resolves.toBeUndefined();
  });

  it('refuses to turn a task with subtasks into an epic', async () => {
    TaskMock.exists.mockResolvedValue({ _id: new Types.ObjectId() });
    await expect(assertEpicTypeChange(workspaceId, taskId, 'story', 'epic')).rejects.toThrow('subtasks');
  });
});

describe('validation', () => {
  const invalidFields = async (body: Record<string, unknown>) => {
    const req = { body: { title: 'x', deadline: '2026-10-01', ...body } } as never;
    for (const validator of validateCreateTask) await validator.run(req);
    return validationResult(req).array().map(error => (error as { path: string }).path);
  };

  it('accepts the epic type and a null or valid epic id, rejects anything else', async () => {
    expect(await invalidFields({ type: 'epic', epic: null })).toEqual([]);
    expect(await invalidFields({ epic: epicId })).toEqual([]);
    expect(await invalidFields({ epic: 'nope' })).toEqual(['epic']);
    expect(await invalidFields({ epic: { $ne: '' } })).toEqual(['epic']);
  });
});
