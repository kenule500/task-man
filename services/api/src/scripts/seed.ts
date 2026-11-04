// Seeds a demo workspace with one account per system role and a Scrum demo (projects, sprints,
// story points, subtasks), so every view and permission can be tried right away.
//
// Local:  MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm seed
// Shared demo database (explicit opt-in): pnpm seed -- --force
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/userModel.js';
import Workspace from '../models/workspaceModel.js';
import Task from '../models/taskModel.js';
import Role from '../models/roleModel.js';
import Project from '../models/projectModel.js';
import Sprint from '../models/sprintModel.js';
import { seedSystemRoles } from '../utils/seedRoles.js';
import { day, seedScrumDemo } from './scrumDemo.js';

// Test-only credentials shared by the demo accounts (never use real data here)
const DEMO_PASSWORD = 'demo1234';
const DEMO_SLUG = 'demo-workspace';
const DEMO_ACCOUNTS = [
  { email: 'demo@taskman.test', name: 'Demo Owner', role: 'Product Owner', jobTitle: 'Product Owner' },
  { email: 'scrum@taskman.test', name: 'Sam Scrum', role: 'Scrum Master', jobTitle: 'Scrum Master' },
  { email: 'dev@taskman.test', name: 'Dana Dev', role: 'Developer', jobTitle: 'Full-stack developer' },
  { email: 'member@taskman.test', name: 'Max Member', role: 'Team Member', jobTitle: 'Designer' },
  { email: 'viewer@taskman.test', name: 'Vic Viewer', role: 'Viewer', jobTitle: 'Stakeholder' },
] as const;

const uri = process.env.MONGO_URI ?? '';
const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(uri);

if (!isLocal && !process.argv.includes('--force')) {
  console.error('Refusing to seed a non-local database. Point MONGO_URI to localhost or pass --force.');
  process.exit(1);
}

const seed = async () => {
  await mongoose.connect(uri);
  await seedSystemRoles();

  // Start from a clean demo: remove previous demo users, their workspace and tasks
  const previous = await User.find({ email: { $in: DEMO_ACCOUNTS.map(account => account.email) } }).select('_id');
  const previousIds = previous.map(user => user._id);
  const previousWorkspaces = await Workspace.find({ $or: [{ slug: DEMO_SLUG }, { owner: { $in: previousIds } }] }).select('_id');
  const previousWorkspaceIds = previousWorkspaces.map(workspace => workspace._id);
  await Task.deleteMany({ workspace: { $in: previousWorkspaceIds } });
  await Sprint.deleteMany({ workspace: { $in: previousWorkspaceIds } });
  await Project.deleteMany({ workspace: { $in: previousWorkspaceIds } });
  await Workspace.deleteMany({ _id: { $in: previousWorkspaceIds } });
  await User.deleteMany({ _id: { $in: previousIds } });

  const users = await Promise.all(DEMO_ACCOUNTS.map(account => User.create({
    name: account.name,
    email: account.email,
    password: DEMO_PASSWORD,
    jobTitle: account.jobTitle,
    isVerified: true,
    onboarding: { role: account.jobTitle, useCase: 'Project management', teamSize: '2-10', completedAt: new Date() },
  })));
  const [owner, scrum, dev, member] = users;

  const roles = await Role.find({ isSystem: true, name: { $in: DEMO_ACCOUNTS.map(account => account.role) } });
  const roleId = (name: string) => roles.find(role => role.name === name)!._id;

  const workspace = await Workspace.create({
    name: 'Demo Workspace',
    slug: DEMO_SLUG,
    owner: owner._id,
    members: DEMO_ACCOUNTS.map((account, index) => ({ user: users[index]._id, roleId: roleId(account.role) })),
    inviteCode: 'DE0DE0DE0DE0',
  });

  await User.updateMany(
    { _id: { $in: users.map(user => user._id) } },
    { $set: { workspaces: [workspace._id], activeWorkspace: workspace._id } },
  );

  const total = await seedScrumDemo({
    workspace: workspace._id as mongoose.Types.ObjectId,
    owner: owner._id as mongoose.Types.ObjectId,
    people: [owner, scrum, dev, member].map(user => user._id as mongoose.Types.ObjectId),
  });
  await Task.create({
    title: 'Sprint retro notes', status: 'pending', priority: 'low', deadline: day(-1), position: 500,
    owner: owner._id, workspace: workspace._id, assignees: [scrum._id],
  });

  console.log(`Seeded "${DEMO_SLUG}" with ${DEMO_ACCOUNTS.length} demo accounts (one per role), 3 projects, 4 sprints and ${total + 1} tasks.`);
  await mongoose.disconnect();
};

seed().catch(async error => {
  console.error('Seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
