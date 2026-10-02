// Seeds a demo account, workspace and scheduled tasks for local development.
// Usage: MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm seed
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/userModel.js';
import Workspace from '../models/workspaceModel.js';
import Task from '../models/taskModel.js';

// Test-only credentials for the local demo account
const DEMO_EMAIL = 'demo@taskman.test';
const DEMO_PASSWORD = 'demo1234';
const DEMO_SLUG = 'demo-workspace';

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

  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    await Task.deleteMany({ owner: existing._id });
    await Workspace.deleteMany({ owner: existing._id });
    await existing.deleteOne();
  }

  const user = await User.create({
    name: 'Demo User',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    isVerified: true,
    onboarding: { role: 'Product', useCase: 'Project management', teamSize: '2-10', completedAt: new Date() },
  });

  const workspace = await Workspace.create({
    name: 'Demo Workspace',
    slug: DEMO_SLUG,
    owner: user._id,
    members: [{ user: user._id, role: 'owner' }],
    inviteCode: 'DEMO00000000',
  });

  user.workspaces = [workspace._id as mongoose.Types.ObjectId];
  user.activeWorkspace = workspace._id as mongoose.Types.ObjectId;
  await user.save();

  const base = { owner: user._id, workspace: workspace._id };
  const create = (fields: Record<string, unknown>) => Task.create({ ...base, ...fields });

  const research = await create({ title: 'User research interviews', status: 'completed', priority: 'medium', startDate: day(-8), deadline: day(-3), position: 1000 });
  const design = await create({ title: 'Design task views', description: 'List, board, calendar and timeline mockups', status: 'in-progress', priority: 'high', startDate: day(-2), deadline: day(3), dependencies: [research._id], position: 1000 });
  const api = await create({ title: 'Build tasks API', status: 'pending', priority: 'high', startDate: day(4), deadline: day(10), dependencies: [design._id], position: 1000 });
  const ui = await create({ title: 'Build task views UI', description: 'Starts before the design is due on purpose (conflict demo)', status: 'pending', priority: 'medium', startDate: day(2), deadline: day(11), dependencies: [design._id], position: 2000 });
  const qa = await create({ title: 'QA and bug bash', status: 'pending', priority: 'medium', startDate: day(12), deadline: day(15), dependencies: [api._id, ui._id], position: 3000 });
  await create({ title: 'Launch v1', status: 'pending', priority: 'high', startDate: day(16), deadline: day(17), dependencies: [qa._id], position: 4000 });
  await create({ title: 'Write onboarding docs', status: 'in-progress', priority: 'low', deadline: day(7), position: 2000 });
  await create({ title: 'Sprint retro notes', status: 'pending', priority: 'low', deadline: day(-1), position: 500 });

  console.log(`Seeded workspace "${DEMO_SLUG}" with demo tasks for ${DEMO_EMAIL}.`);
  await mongoose.disconnect();
};

seed().catch(async error => {
  console.error('Seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
