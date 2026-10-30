// Adds the Scrum demo (projects, sprints, story points, subtasks, backlog) to an EXISTING workspace,
// owned by and assigned to that workspace's members.
//
// Local:  MONGO_URI=mongodb://127.0.0.1:27017/task-man pnpm seed:workspace -- --slug my-team
// Shared database (explicit opt-in): pnpm seed:workspace -- --slug my-team --force
// Re-running replaces the demo it created before (projects named "… (demo)"); real work is never touched.
import 'dotenv/config';
import mongoose from 'mongoose';
import Workspace from '../models/workspaceModel.js';
import Task from '../models/taskModel.js';
import { removeScrumDemo, seedScrumDemo } from './scrumDemo.js';

const SUFFIX = ' (demo)';
// Names used by the first version of this script
const LEGACY_DEMO_PROJECTS = ['Product Launch (demo)', 'Marketing Site (demo)'];

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

const seedWorkspace = async () => {
  await mongoose.connect(uri);

  const workspace = await Workspace.findOne({ slug });
  if (!workspace) throw new Error(`Workspace "${slug}" not found`);
  const workspaceId = workspace._id as mongoose.Types.ObjectId;

  await Task.deleteMany({ workspace: workspaceId, project: { $in: LEGACY_DEMO_PROJECTS } });
  await removeScrumDemo(workspaceId, SUFFIX);

  // Owner first, then up to three other members to spread the work
  const owner = workspace.owner as mongoose.Types.ObjectId;
  const others = workspace.members.map(member => member.user as mongoose.Types.ObjectId).filter(id => !id.equals(owner));
  const total = await seedScrumDemo({ workspace: workspaceId, owner, people: [owner, ...others.slice(0, 3)], suffix: SUFFIX });

  console.log(`Added 3 demo projects, 4 sprints and ${total} tasks to workspace "${slug}".`);
  await mongoose.disconnect();
};

seedWorkspace().catch(async error => {
  console.error('Seed failed:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
