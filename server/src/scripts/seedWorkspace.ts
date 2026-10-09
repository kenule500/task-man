// Adds a demo project (scheduled tasks with labels, dependencies and comments)
// to an EXISTING workspace, owned and assigned to that workspace's owner.
//
// Local:  MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm seed:workspace -- --slug my-team
// Shared database (explicit opt-in): pnpm seed:workspace -- --slug my-team --force
// Re-running replaces the demo tasks it created before (matched by the "Demo" project names).
import 'dotenv/config';
import mongoose from 'mongoose';
import Workspace from '../models/workspaceModel.js';
import Task from '../models/taskModel.js';

const DEMO_PROJECTS = ['Product Launch (demo)', 'Marketing Site (demo)'];

const argValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const slug = argValue('--slug');
const uri = process.env.MONGO_URI ?? '';
const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(uri);

if (!slug) {
  console.error('Usage: pnpm seed:workspace -- --slug <workspace-slug> [--force]');
  process.exit(1);
}
if (!isLocal && !process.argv.includes('--force')) {
  console.error('Refusing to write to a non-local database. Point MONGO_URI to localhost or pass --force.');
  process.exit(1);
}

const day = (offset: number) => {
  const date = new Date();
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + offset));
};

const seedWorkspace = async () => {
  await mongoose.connect(uri);

  const workspace = await Workspace.findOne({ slug });
  if (!workspace) throw new Error(`Workspace "${slug}" not found`);
  const owner = workspace.owner;

  // Replace previous demo data only (real tasks are never touched)
  await Task.deleteMany({ workspace: workspace._id, project: { $in: DEMO_PROJECTS } });

  const base = { owner, workspace: workspace._id, assignees: [owner] };
  const create = (fields: Record<string, unknown>) => Task.create({ ...base, ...fields });
  const [launch, site] = DEMO_PROJECTS;

  const brief = await create({
    title: 'Write the product brief', project: launch, status: 'completed', priority: 'high',
    startDate: day(-10), deadline: day(-6), position: 1000, labels: ['planning'],
    description: 'Goals, audience, scope and success metrics for the launch.',
    comments: [{ author: owner, text: 'Brief approved — moving to research.' }],
  });
  const research = await create({
    title: 'Customer interviews', project: launch, status: 'completed', priority: 'medium',
    startDate: day(-6), deadline: day(-2), position: 2000, labels: ['research'], dependencies: [brief._id],
  });
  const roadmap = await create({
    title: 'Define the roadmap and milestones', project: launch, status: 'in-progress', priority: 'high',
    startDate: day(-1), deadline: day(4), position: 1000, labels: ['planning'], dependencies: [research._id],
    comments: [{ author: owner, text: 'Draft milestones shared with the team for feedback.' }],
  });
  const build = await create({
    title: 'Build the MVP', project: launch, status: 'pending', priority: 'high',
    startDate: day(5), deadline: day(16), position: 1000, labels: ['engineering'], dependencies: [roadmap._id],
  });
  const qa = await create({
    title: 'QA and user acceptance testing', project: launch, status: 'pending', priority: 'medium',
    startDate: day(17), deadline: day(20), position: 2000, labels: ['qa'], dependencies: [build._id],
  });
  await create({
    title: 'Launch day', project: launch, status: 'pending', priority: 'high',
    startDate: day(21), deadline: day(21), position: 3000, labels: ['release'], dependencies: [qa._id],
  });

  const wireframes = await create({
    title: 'Homepage wireframes', project: site, status: 'in-progress', priority: 'medium',
    startDate: day(-3), deadline: day(2), position: 2000, labels: ['design'],
  });
  await create({
    title: 'Write landing page copy', project: site, status: 'pending', priority: 'low',
    startDate: day(1), deadline: day(6), position: 3000, labels: ['content'],
  });
  await create({
    title: 'Implement responsive homepage', project: site, status: 'pending', priority: 'medium',
    startDate: day(3), deadline: day(10), position: 4000, labels: ['engineering', 'design'], dependencies: [wireframes._id],
  });
  await create({
    title: 'Weekly team sync notes', project: site, status: 'pending', priority: 'low',
    deadline: day(-1), position: 500, labels: ['meeting'],
  });

  const total = await Task.countDocuments({ workspace: workspace._id, project: { $in: DEMO_PROJECTS } });
  console.log(`Added ${total} demo tasks to workspace "${slug}".`);
  await mongoose.disconnect();
};

seedWorkspace().catch(async error => {
  console.error('Seed failed:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
