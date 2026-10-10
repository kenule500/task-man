// Builds a Scrum demo in a workspace: projects with sprints (completed, active, planned),
// typed and estimated work items, subtasks, dependencies and a backlog. Dates are relative to today
// so the active sprint, the burndown and the calendar always look current.
import mongoose from 'mongoose';
import Project from '../models/projectModel.js';
import Sprint from '../models/sprintModel.js';
import Task from '../models/taskModel.js';

type Id = mongoose.Types.ObjectId;

export interface ScrumDemoOptions {
  workspace: Id;
  owner: Id;
  /** People to assign work to (the owner is used when empty). Order: lead, scrum master, developer, designer. */
  people?: Id[];
  /** Appended to project names, e.g. " (demo)", so the demo can be found and replaced later. */
  suffix?: string;
}

export const day = (offset: number) => {
  const date = new Date();
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + offset));
};

export const scrumDemoProjectNames = (suffix = '') =>
  ['Website v1', 'Marketing Site', 'Documentation'].map(name => `${name}${suffix}`);

/** Removes the demo projects (and their sprints and tasks) created with the same suffix. */
export const removeScrumDemo = async (workspace: Id, suffix = '') => {
  const names = scrumDemoProjectNames(suffix);
  const projects = await Project.find({ workspace, name: { $in: names } }).select('_id');
  await Sprint.deleteMany({ workspace, project: { $in: projects.map(project => project._id) } });
  await Project.deleteMany({ _id: { $in: projects.map(project => project._id) } });
  await Task.deleteMany({ workspace, project: { $in: names } });
};

export const seedScrumDemo = async ({ workspace, owner, people = [], suffix = '' }: ScrumDemoOptions) => {
  const [lead = owner, scrum = lead, dev = lead, designer = lead] = people.length > 0 ? people : [owner];
  const [webName, marketingName, docsName] = scrumDemoProjectNames(suffix);

  const [web, marketing, docs] = await Promise.all([
    Project.create({
      workspace, name: webName, key: 'WEB', color: 'blue', icon: 'code', createdBy: owner,
      description: 'Public web app: task views, API and launch.',
    }),
    Project.create({
      workspace, name: marketingName, key: 'MKT', color: 'rose', icon: 'megaphone', createdBy: owner,
      description: 'Landing pages, copy and the launch campaign.',
    }),
    Project.create({
      workspace, name: docsName, key: 'DOC', color: 'amber', icon: 'book', createdBy: owner,
      description: 'Guides for new teammates and customers.',
    }),
  ]);

  const [webDone, webActive, webNext, mktActive] = await Promise.all([
    Sprint.create({
      workspace, project: web._id, name: 'Sprint 1', goal: 'Foundations: sign-in, workspaces and layout',
      startDate: day(-21), endDate: day(-8), status: 'completed', startedAt: day(-21), completedAt: day(-8),
    }),
    Sprint.create({
      workspace, project: web._id, name: 'Sprint 2', goal: 'Ship the four task views on top of the tasks API',
      startDate: day(-7), endDate: day(6), status: 'active', startedAt: day(-7),
    }),
    Sprint.create({
      workspace, project: web._id, name: 'Sprint 3', goal: 'QA, performance and launch',
      startDate: day(7), endDate: day(20), status: 'planned',
    }),
    Sprint.create({
      workspace, project: marketing._id, name: 'Campaign sprint', goal: 'Landing page live before launch day',
      startDate: day(-3), endDate: day(10), status: 'active', startedAt: day(-3),
    }),
  ]);

  let position = 1000;
  const create = (fields: Record<string, unknown>) => {
    position += 1000;
    return Task.create({ owner, workspace, position, ...fields });
  };
  /** completedAt drives the burndown: set it to the day the work was finished. */
  const finishedOn = (id: Id, offset: number) => Task.updateOne({ _id: id }, { $set: { completedAt: day(offset) } });

  // ---- Website v1 · Sprint 1 (completed) ----
  const done = await Promise.all([
    create({ title: 'Sign up, sign in and email verification', type: 'story', storyPoints: 8, sprint: webDone._id, project: webName,
      status: 'completed', priority: 'high', startDate: day(-21), deadline: day(-15), labels: ['auth'], assignees: [dev] }),
    create({ title: 'Workspace switcher and invitations', type: 'story', storyPoints: 5, sprint: webDone._id, project: webName,
      status: 'completed', priority: 'medium', startDate: day(-16), deadline: day(-10), labels: ['backend'], assignees: [dev, scrum] }),
    create({ title: 'App shell: sidebar, top bar, mobile layout', type: 'story', storyPoints: 5, sprint: webDone._id, project: webName,
      status: 'completed', priority: 'medium', startDate: day(-15), deadline: day(-9), labels: ['frontend'], assignees: [designer] }),
    create({ title: 'Login button misaligned on Safari', type: 'bug', storyPoints: 1, sprint: webDone._id, project: webName,
      status: 'completed', priority: 'low', deadline: day(-11), labels: ['frontend'], assignees: [dev] }),
  ]);
  await Promise.all([finishedOn(done[0]._id, -15), finishedOn(done[1]._id, -11), finishedOn(done[2]._id, -9), finishedOn(done[3]._id, -12)]);
  await Sprint.updateOne({ _id: webDone._id }, { $set: { completedPoints: 19 } });

  // ---- Website v1 · epics (containers across sprints; never in a sprint themselves) ----
  const viewsEpic = await create({
    title: 'Task views', type: 'epic', project: webName, status: 'in-progress', priority: 'high',
    startDate: day(-7), deadline: day(6), description: 'List, board, calendar and timeline on top of the tasks API.',
  });
  const launchEpic = await create({
    title: 'Launch readiness', type: 'epic', project: webName, status: 'pending', priority: 'medium',
    startDate: day(7), deadline: day(20), description: 'Quality, performance and the launch itself.',
  });

  // ---- Website v1 · Sprint 2 (active) ----
  const api = await create({
    title: 'Tasks API with filters and sorting', type: 'story', storyPoints: 5, sprint: webActive._id, epic: viewsEpic._id, project: webName,
    status: 'completed', priority: 'high', startDate: day(-7), deadline: day(-4), labels: ['backend'], assignees: [dev],
    description: 'CRUD endpoints, status/priority filters, search and sort by deadline or priority.',
    comments: [{ author: scrum, text: 'Merged and deployed to staging.' }],
  });
  const board = await create({
    title: 'Kanban board with drag and drop', type: 'story', storyPoints: 8, sprint: webActive._id, epic: viewsEpic._id, project: webName,
    status: 'in-progress', priority: 'high', startDate: day(-4), deadline: day(2), labels: ['frontend', 'ux'],
    assignees: [dev, designer], dependencies: [api._id],
    description: 'Pending → In Progress → Completed columns, keyboard alternative via "Move to…".',
    comments: [
      { author: designer, text: 'Card designs are in the shared file.' },
      { author: dev, text: 'Drag and drop works; keyboard menu next.' },
    ],
  });
  const calendar = await create({
    title: 'Calendar view by due date', type: 'story', storyPoints: 5, sprint: webActive._id, epic: viewsEpic._id, project: webName,
    status: 'pending', priority: 'medium', startDate: day(1), deadline: day(5), labels: ['frontend'], assignees: [dev],
    dependencies: [api._id], description: 'Month grid on desktop, week strip and agenda on phones.',
  });
  await create({
    title: 'Timeline (Gantt) with dependencies', type: 'story', storyPoints: 8, sprint: webActive._id, epic: viewsEpic._id, project: webName,
    status: 'pending', priority: 'medium', startDate: day(2), deadline: day(6), labels: ['frontend'], assignees: [dev],
    dependencies: [api._id],
  });
  const crash = await create({
    title: 'Board crashes when a column is empty', type: 'bug', storyPoints: 2, sprint: webActive._id, epic: viewsEpic._id, project: webName,
    status: 'completed', priority: 'high', deadline: day(-2), labels: ['frontend'], assignees: [dev],
  });
  await create({
    title: 'Spike: offline support for the PWA', type: 'spike', storyPoints: 3, sprint: webActive._id, project: webName,
    status: 'in-progress', priority: 'low', startDate: day(-1), deadline: day(3), labels: ['research'], assignees: [scrum],
  });
  await Promise.all([finishedOn(api._id, -4), finishedOn(crash._id, -2)]);

  // Subtasks of the board story
  const subtasks = await Promise.all([
    create({ title: 'Column layout and card design', parent: board._id, epic: viewsEpic._id, sprint: webActive._id, project: webName,
      status: 'completed', deadline: day(-1), assignees: [designer], description: 'Status colors, counts, empty column state.' }),
    create({ title: 'Drag and drop between columns', parent: board._id, epic: viewsEpic._id, sprint: webActive._id, project: webName,
      status: 'completed', deadline: day(0), assignees: [dev] }),
    create({ title: 'Keyboard "Move to…" menu', parent: board._id, epic: viewsEpic._id, sprint: webActive._id, project: webName,
      status: 'in-progress', deadline: day(1), assignees: [dev], description: 'Screen reader announces the new column.' }),
    create({ title: 'Mobile status tabs', parent: board._id, epic: viewsEpic._id, sprint: webActive._id, project: webName,
      status: 'pending', deadline: day(2), assignees: [designer] }),
  ]);
  await Promise.all([finishedOn(subtasks[0]._id, -1), finishedOn(subtasks[1]._id, 0)]);
  await create({ title: 'Week strip for phones', parent: calendar._id, epic: viewsEpic._id, sprint: webActive._id, project: webName,
    status: 'pending', deadline: day(4), assignees: [dev] });

  // ---- Website v1 · Sprint 3 (planned) and backlog ----
  await create({ title: 'Performance budget and Lighthouse checks', type: 'task', storyPoints: 3, sprint: webNext._id, epic: launchEpic._id, project: webName,
    status: 'pending', priority: 'medium', startDate: day(8), deadline: day(12), labels: ['qa'], assignees: [scrum] });
  await create({ title: 'Release checklist and launch', type: 'task', storyPoints: 2, sprint: webNext._id, epic: launchEpic._id, project: webName,
    status: 'pending', priority: 'high', startDate: day(18), deadline: day(20), labels: ['release'], assignees: [lead] });
  await create({ title: 'Recurring tasks', type: 'story', storyPoints: 8, project: webName, status: 'pending', priority: 'low',
    deadline: day(30), labels: ['backlog'], description: 'Repeat a task every day, week or month.' });
  await create({ title: 'Export tasks to CSV', type: 'story', storyPoints: 3, project: webName, status: 'pending', priority: 'medium',
    deadline: day(28), description: 'Download the filtered list as a spreadsheet.' });
  await create({ title: 'Due date reminder emails', type: 'story', storyPoints: null, project: webName, status: 'pending',
    priority: 'medium', deadline: day(35), description: 'Not estimated yet: discuss at the next refinement.' });

  // ---- Marketing Site · Campaign sprint (active) and backlog ----
  const copy = await create({ title: 'Write landing page copy', type: 'task', storyPoints: 3, sprint: mktActive._id, project: marketingName,
    status: 'completed', priority: 'medium', startDate: day(-3), deadline: day(-1), labels: ['content'], assignees: [designer] });
  await finishedOn(copy._id, -1);
  await create({ title: 'Hero illustration', type: 'task', storyPoints: 2, sprint: mktActive._id, project: marketingName,
    status: 'in-progress', priority: 'medium', startDate: day(-1), deadline: day(3), labels: ['design'], assignees: [designer] });
  await create({ title: 'Responsive landing page', type: 'story', storyPoints: 5, sprint: mktActive._id, project: marketingName,
    status: 'pending', priority: 'high', startDate: day(3), deadline: day(9), labels: ['frontend'], assignees: [dev],
    dependencies: [copy._id] });
  await create({ title: 'Launch newsletter', type: 'task', storyPoints: 2, project: marketingName, status: 'pending',
    priority: 'low', deadline: day(14), labels: ['content'] });

  // ---- Documentation (Kanban, no sprints) ----
  await create({ title: 'Getting started guide', type: 'task', project: docsName, status: 'in-progress', priority: 'medium',
    deadline: day(5), labels: ['docs'], assignees: [designer], description: 'Sign up, create a workspace, invite the team.' });
  await create({ title: 'Roles and permissions explained', type: 'task', project: docsName, status: 'pending', priority: 'low',
    deadline: day(12), labels: ['docs'], assignees: [scrum] });

  return Task.countDocuments({ workspace, project: { $in: [webName, marketingName, docsName] } });
};
