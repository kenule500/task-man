import { Types } from 'mongoose';
import Project from '../models/projectModel.js';
import {
  addAssigneesToProjectMembers, removeMemberFromAllProjects,
} from '../utils/projectMembers.js';

jest.mock('../models/projectModel.js', () => ({
  __esModule: true,
  default: { updateMany: jest.fn(), updateOne: jest.fn() },
}));

const ProjectMock = Project as unknown as Record<string, jest.Mock>;
const workspaceId = new Types.ObjectId();
const first = new Types.ObjectId();
const second = new Types.ObjectId();

beforeEach(() => {
  ProjectMock.updateOne.mockReset();
  ProjectMock.updateMany.mockReset();
  ProjectMock.updateOne.mockResolvedValue({ acknowledged: true });
  ProjectMock.updateMany.mockResolvedValue({ acknowledged: true });
});

describe('project membership', () => {
  it('AC-040: assigning a task adds the assignees to the project without removing anyone', async () => {
    await addAssigneesToProjectMembers(workspaceId, 'Alpha', [first, second]);

    expect(ProjectMock.updateOne).toHaveBeenCalledWith(
      { workspace: workspaceId, nameKey: 'alpha' },
      { $addToSet: { members: { $each: [first, second] } } },
    );
    // Idempotent on purpose: $addToSet never duplicates, and no document is loaded or saved
    expect(ProjectMock.updateOne.mock.calls[0][1]).not.toHaveProperty('$push');
  });

  it('AC-040: leaving the workspace removes the member from every project', async () => {
    await removeMemberFromAllProjects(workspaceId, first);

    expect(ProjectMock.updateMany).toHaveBeenCalledWith(
      { workspace: workspaceId, members: first },
      { $pull: { members: first } },
    );
  });

  it('AC-040: a blank project or no assignees is a no-op', async () => {
    await addAssigneesToProjectMembers(workspaceId, '  ', [first]);
    await addAssigneesToProjectMembers(workspaceId, 'Alpha', []);

    expect(ProjectMock.updateOne).not.toHaveBeenCalled();
  });
});
