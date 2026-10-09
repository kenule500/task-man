// Seeds a demo workspace with one account per system role and a scheduled
// project, so every view and permission can be tried right away.
//
// Local:  MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm seed
// Shared demo database (explicit opt-in): pnpm seed -- --force
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/userModel.js';
import Workspace from '../models/workspaceModel.js';
import Task from '../models/taskModel.js';
import Role from '../models/roleModel.js';
import { seedSystemRoles } from '../utils/seedRoles.js';

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

const day = (offset: number) => {
  const date = new Date();
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + offset));
};

const seed = async () => {
  await mongoose.connect(uri);
  await seedSystemRoles();

  // Start from a clean demo: remove previous demo users, their workspace and tasks
  const previous = await User.find({ email: { $in: DEMO_ACCOUNTS.map(account => account.email) } }).select('_id');
  const previousIds = previous.map(user => user._id);
  const previousWorkspaces = await Workspace.find({ $or: [{ slug: DEMO_SLUG }, { owner: { $in: previousIds } }] }).select('_id');
  await Task.deleteMany({ workspace: { $in: previousWorkspaces.map(workspace => workspace._id) } });
  await Workspace.deleteMany({ _id: { $in: previousWorkspaces.map(workspace => workspace._id) } });
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

  const base = { owner: owner._id, workspace: workspace._id };
  const create = (fields: Record<string, unknown>) => Task.create({ ...base, ...fields });

  const research = await create({
    title: 'User research interviews', project: 'Website v1', status: 'completed', priority: 'medium',
    startDate: day(-8), deadline: day(-3), position: 1000, labels: ['research'], assignees: [member._id],
    comments: [{ author: member._id, text: 'Interview notes are in the shared drive.' }],
  });
  const design = await create({
    title: 'Design task views', project: 'Website v1', description: 'List, board, calendar and timeline mockups',
    status: 'in-progress', priority: 'high', startDate: day(-2), deadline: day(3), dependencies: [research._id],
    position: 1000, labels: ['design', 'ux'], assignees: [member._id, scrum._id],
    comments: [
      { author: scrum._id, text: 'Can we review the board view on Thursday?' },
      { author: member._id, text: 'Yes — I will share the prototype before that.' },
    ],
  });
  const api = await create({
    title: 'Build tasks API', project: 'Website v1', status: 'pending', priority: 'high',
    startDate: day(4), deadline: day(10), dependencies: [design._id], position: 1000, labels: ['backend'], assignees: [dev._id],
  });
  const ui = await create({
    title: 'Build task views UI', project: 'Website v1', description: 'Starts before the design is due on purpose (conflict demo)',
    status: 'pending', priority: 'medium', startDate: day(2), deadline: day(11), dependencies: [design._id],
    position: 2000, labels: ['frontend'], assignees: [dev._id],
  });
  const qa = await create({
    title: 'QA and bug bash', project: 'Website v1', status: 'pending', priority: 'medium',
    startDate: day(12), deadline: day(15), dependencies: [api._id, ui._id], position: 3000, labels: ['qa'], assignees: [scrum._id, dev._id],
  });
  await create({
    title: 'Launch v1', project: 'Website v1', status: 'pending', priority: 'high',
    startDate: day(16), deadline: day(17), dependencies: [qa._id], position: 4000, labels: ['release'], assignees: [owner._id],
  });
  await create({
    title: 'Write onboarding docs', project: 'Documentation', status: 'in-progress', priority: 'low',
    deadline: day(7), position: 2000, labels: ['docs'], assignees: [member._id],
  });
  await create({ title: 'Sprint retro notes', status: 'pending', priority: 'low', deadline: day(-1), position: 500, assignees: [scrum._id] });

  console.log(`Seeded "${DEMO_SLUG}" with ${DEMO_ACCOUNTS.length} demo accounts (one per role) and 8 tasks.`);
  await mongoose.disconnect();
};

seed().catch(async error => {
  console.error('Seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
