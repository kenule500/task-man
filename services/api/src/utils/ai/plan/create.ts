import { Request } from 'express';
import mongoose from 'mongoose';
import type { IAiPlan } from '../../../models/aiPlanModel.js';
import Project from '../../../models/projectModel.js';
import Sprint from '../../../models/sprintModel.js';
import Task from '../../../models/taskModel.js';
import type { IWorkspace } from '../../../models/workspaceModel.js';
import { recordActivity } from '../../activity.js';
import { reserveTaskNumbers } from '../../taskNumbers.js';
import { stageFor, workflowOf } from '../../workflow.js';
import { AiQueueError } from '../reviewService.js';
import { dayToDate } from './dates.js';
import { countPlan, describePlanProblem, editedPlanSchema, finalizePlan, planEndDate, uniqueKey, uniqueName, type PlanContent } from './schema.js';
import { usedProjectNames } from './service.js';
import { dedupeSprintNames } from './sprints.js';
import type { PlanTarget } from './target.js';

// Creates the project, its sprints, epics, tasks, subtasks and acceptance criteria from a reviewed plan. The same
// writer is used to add a plan to a project that already exists. All or nothing: whatever this call wrote is taken
// back when a step fails (the same approach as the importer), and a pre-existing target is never part of the rollback.

type Id = mongoose.Types.ObjectId;

const BATCH = 200;

export type PlanDestination = 'new' | 'existing';

export interface CreatedFromPlan {
  project: { _id: string; name: string; key: string };
  counts: { sprints: number; epics: number; items: number; subtasks: number; tasks: number; criteria: number };
  destination: PlanDestination;
}

interface Draft {
  _id: Id;
  [field: string]: unknown;
}

/** Ids this request has written, collected before each insert so a partial batch can still be rolled back. */
interface Written {
  sprintIds: Id[];
  taskIds: Id[];
  taskCount: number;
}

const emptyWritten = (): Written => ({ sprintIds: [], taskIds: [], taskCount: 0 });

/** The task documents of a plan, in creation order: epics first, then each item followed by its subtasks. */
export const draftTasks = (content: PlanContent, context: {
  sprintIds: Id[];
  userId: Id;
  workspaceId: Id;
  projectName: string;
  stage: { stage: string; status: string };
  startDate: string;
  sprintLengthWeeks: number;
  basePosition: number;
}): Draft[] => {
  const planStart = content.sprints[0]?.startDate ?? context.startDate;
  const planEnd = planEndDate(content, context.startDate, context.sprintLengthWeeks);
  const epicIds = new Map(content.epics.map(epic => [epic.ref, new mongoose.Types.ObjectId()]));

  const common = {
    status: context.stage.status,
    stage: context.stage.stage,
    project: context.projectName,
    watchers: [context.userId],
    owner: context.userId,
    workspace: context.workspaceId,
    dependencies: [],
    assignees: [],
  };
  const drafts: Draft[] = [];
  const next = () => context.basePosition + drafts.length;
  const criteria = (texts: string[]) => texts.map(text => ({ text }));

  for (const epic of content.epics) {
    drafts.push({
      ...common,
      _id: epicIds.get(epic.ref) as Id,
      title: epic.title,
      description: epic.description,
      type: 'epic',
      priority: 'medium',
      storyPoints: null,
      labels: [],
      acceptanceCriteria: [],
      sprint: null,
      parent: null,
      epic: null,
      startDate: dayToDate(planStart),
      deadline: dayToDate(planEnd),
      position: next(),
    });
  }

  // Sprint by sprint, backlog last; inside a group the order of the plan is kept
  const order = content.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.sprintIndex ?? Number.MAX_SAFE_INTEGER) - (b.item.sprintIndex ?? Number.MAX_SAFE_INTEGER) || a.index - b.index);

  for (const { item } of order) {
    const sprint = item.sprintIndex !== null ? content.sprints[item.sprintIndex] : undefined;
    const sprintId = item.sprintIndex !== null ? context.sprintIds[item.sprintIndex] ?? null : null;
    const epicId = item.epicRef ? epicIds.get(item.epicRef) ?? null : null;
    const startDate = sprint ? dayToDate(sprint.startDate) : undefined;
    const deadline = dayToDate(sprint ? sprint.endDate : planEnd);
    const id = new mongoose.Types.ObjectId();
    drafts.push({
      ...common,
      _id: id,
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      storyPoints: item.storyPoints,
      labels: item.labels,
      acceptanceCriteria: criteria(item.acceptanceCriteria),
      sprint: sprintId,
      parent: null,
      epic: epicId,
      startDate,
      deadline,
      position: next(),
    });
    for (const subtask of item.subtasks) {
      drafts.push({
        ...common,
        _id: new mongoose.Types.ObjectId(),
        title: subtask.title,
        description: '',
        type: 'task',
        priority: item.priority,
        storyPoints: null,
        labels: [],
        acceptanceCriteria: criteria(subtask.acceptanceCriteria),
        // Subtasks follow their parent: sprint, epic and dates
        sprint: sprintId,
        parent: id,
        epic: epicId,
        startDate,
        deadline,
        position: next(),
      });
    }
  }
  return drafts;
};

/** Parses and finalises the plan; both destinations start here. */
const readPlan = (plan: IAiPlan, options: { takenNames?: ReadonlySet<string>; takenKeys?: ReadonlySet<string> } = {}): PlanContent => {
  const parsed = editedPlanSchema.safeParse(plan.plan);
  if (!parsed.success) throw new AiQueueError(422, 'PLAN_INVALID', `The plan is not valid: ${describePlanProblem(parsed.error)}`);
  return finalizePlan(parsed.data, {
    startDate: plan.options.startDate,
    sprintLengthWeeks: plan.options.sprintLengthWeeks,
    keepDates: true,
    ...options,
  });
};

/**
 * Writes the plan's sprints, epics, items, subtasks and criteria into a project. Task numbers are reserved once and
 * inserts run in batches. Ids are recorded before each insert, so the caller can remove exactly these records.
 */
const writePlanRecords = async (
  content: PlanContent,
  context: {
    workspaceId: Id;
    userId: Id;
    projectId: Id;
    projectName: string;
    stage: { stage: string; status: string };
    startDate: string;
    sprintLengthWeeks: number;
    sprintNames: string[];
  },
  written: Written,
): Promise<void> => {
  written.sprintIds = content.sprints.map(() => new mongoose.Types.ObjectId());
  if (content.sprints.length > 0) {
    await Sprint.insertMany(content.sprints.map((sprint, index) => ({
      _id: written.sprintIds[index],
      workspace: context.workspaceId,
      project: context.projectId,
      name: context.sprintNames[index] ?? sprint.name,
      goal: sprint.goal,
      startDate: dayToDate(sprint.startDate),
      endDate: dayToDate(sprint.endDate),
      status: 'planned',
    })));
  }

  const drafts = draftTasks(content, {
    sprintIds: written.sprintIds,
    userId: context.userId,
    workspaceId: context.workspaceId,
    projectName: context.projectName,
    stage: context.stage,
    startDate: context.startDate,
    sprintLengthWeeks: context.sprintLengthWeeks,
    basePosition: Date.now(),
  });
  written.taskIds = drafts.map(draft => draft._id);
  const firstNumber = await reserveTaskNumbers(context.workspaceId, drafts.length);
  const numbered = drafts.map((draft, index) => ({ ...draft, number: firstNumber + index }));
  for (let from = 0; from < numbered.length; from += BATCH) {
    await Task.insertMany(numbered.slice(from, from + BATCH) as never[]);
  }
  written.taskCount = numbered.length;
};

/** Deletes only the records this request created; the target project and its pre-existing records are untouched. */
const rollback = async (workspaceId: Id, written: Written, newProjectId: Id | null): Promise<void> => {
  try {
    if (written.taskIds.length > 0) await Task.deleteMany({ _id: { $in: written.taskIds }, workspace: workspaceId });
    if (written.sprintIds.length > 0) await Sprint.deleteMany({ _id: { $in: written.sprintIds }, workspace: workspaceId });
    if (newProjectId) await Project.deleteOne({ _id: newProjectId, workspace: workspaceId });
  } catch (cleanupError) {
    console.error('createFromPlan rollback error:', (cleanupError as Error).message);
  }
};

const recordSprints = async (req: Request, projectId: Id, projectName: string, sprintIds: Id[], sprintNames: string[]): Promise<void> => {
  for (const [index, name] of sprintNames.entries()) {
    await recordActivity(req, {
      action: 'sprint.created', summary: `${name} · ${projectName}`, project: projectId, sprint: sprintIds[index],
    });
  }
};

const recordPlanCreated = async (
  req: Request,
  plan: IAiPlan,
  projectId: Id,
  projectName: string,
  counts: ReturnType<typeof countPlan>,
  taskCount: number,
  destination: PlanDestination,
): Promise<void> => {
  await recordActivity(req, {
    action: 'ai.plan_created',
    summary: projectName,
    project: projectId,
    changes: [
      { field: 'file', to: plan.source.fileName },
      { field: 'destination', to: destination },
      ...(destination === 'existing' ? [{ field: 'target', to: projectName }] : []),
      { field: 'sprints', to: String(counts.sprints) },
      { field: 'tasks', to: String(taskCount) },
      { field: 'subtasks', to: String(counts.subtasks) },
      { field: 'criteria', to: String(counts.criteria) },
    ],
  });
};

/** Creates a new project and everything in the plan. */
export const createProjectFromPlan = async (req: Request, plan: IAiPlan): Promise<CreatedFromPlan> => {
  const workspace = req.workspace as IWorkspace;
  const workspaceId = workspace._id as Id;
  const userId = req.user?._id as Id;

  // Names and keys are checked here (not silently changed): the person fixes them on the review screen
  const { names, keys } = await usedProjectNames(workspaceId);
  const content = readPlan(plan);
  if (names.has(content.project.name.toLowerCase())) {
    const suggestion = uniqueName(content.project.name, names);
    throw Object.assign(new AiQueueError(409, 'PROJECT_NAME_TAKEN', 'A project with this name already exists. Choose another name.'), { suggestion });
  }
  if (keys.has(content.project.key)) {
    const suggestion = uniqueKey(content.project.key, keys);
    throw Object.assign(new AiQueueError(409, 'PROJECT_KEY_TAKEN', 'This project key is already used. Choose another key.'), { suggestion });
  }

  const resolvedStage = stageFor(workflowOf(workspace), { status: 'pending' });
  if (!resolvedStage) throw new AiQueueError(422, 'PLAN_INVALID', 'The workspace workflow has no starting stage.');

  const written = emptyWritten();
  let projectId: Id | null = null;

  try {
    const project = await Project.create({
      workspace: workspaceId,
      name: content.project.name,
      key: content.project.key,
      description: content.project.description,
      color: content.project.color,
      createdBy: userId,
    });
    projectId = project._id as Id;

    const sprintNames = content.sprints.map(sprint => sprint.name);
    await writePlanRecords(content, {
      workspaceId,
      userId,
      projectId,
      projectName: project.name,
      stage: resolvedStage,
      startDate: plan.options.startDate,
      sprintLengthWeeks: plan.options.sprintLengthWeeks,
      sprintNames,
    }, written);

    const counts = countPlan(content);
    await recordActivity(req, { action: 'project.created', summary: project.name, project: projectId });
    await recordSprints(req, projectId, project.name, written.sprintIds, sprintNames);
    await recordPlanCreated(req, plan, projectId, project.name, counts, written.taskCount, 'new');

    return {
      project: { _id: String(projectId), name: project.name, key: project.key },
      counts: {
        sprints: counts.sprints, epics: counts.epics, items: counts.items, subtasks: counts.subtasks, tasks: written.taskCount, criteria: counts.criteria,
      },
      destination: 'new',
    };
  } catch (error) {
    // All or nothing: take back whatever this call already wrote
    await rollback(workspaceId, written, projectId);
    if ((error as { code?: number } | null)?.code === 11000) {
      throw new AiQueueError(409, 'PROJECT_NAME_TAKEN', 'A project with this name already exists. Choose another name.');
    }
    throw error;
  }
};

/**
 * Adds the plan's sprints, epics, items, subtasks and criteria to an existing project. The plan's project block and
 * the target's own fields, members, settings, sprints and tasks are left untouched.
 */
export const createIntoProjectFromPlan = async (req: Request, plan: IAiPlan, target: PlanTarget): Promise<CreatedFromPlan> => {
  const workspace = req.workspace as IWorkspace;
  const workspaceId = workspace._id as Id;
  const userId = req.user?._id as Id;

  const content = readPlan(plan);
  const resolvedStage = stageFor(workflowOf(workspace), { status: 'pending' });
  if (!resolvedStage) throw new AiQueueError(422, 'PLAN_INVALID', 'The workspace workflow has no starting stage.');

  const targetId = new mongoose.Types.ObjectId(target._id);
  const existing = await Sprint.find({ workspace: workspaceId, project: targetId }).select('name').lean();
  const sprintNames = dedupeSprintNames(content.sprints.map(sprint => sprint.name), existing.map(sprint => sprint.name));

  const written = emptyWritten();
  try {
    await writePlanRecords(content, {
      workspaceId,
      userId,
      projectId: targetId,
      projectName: target.name,
      stage: resolvedStage,
      startDate: plan.options.startDate,
      sprintLengthWeeks: plan.options.sprintLengthWeeks,
      sprintNames,
    }, written);

    const counts = countPlan(content);
    await recordSprints(req, targetId, target.name, written.sprintIds, sprintNames);
    await recordPlanCreated(req, plan, targetId, target.name, counts, written.taskCount, 'existing');

    return {
      project: { _id: target._id, name: target.name, key: target.key },
      counts: {
        sprints: counts.sprints, epics: counts.epics, items: counts.items, subtasks: counts.subtasks, tasks: written.taskCount, criteria: counts.criteria,
      },
      destination: 'existing',
    };
  } catch (error) {
    // Only this request's records: the target project and its existing sprints/tasks are never included
    await rollback(workspaceId, written, null);
    throw error;
  }
};

/** Creates the plan in the chosen destination: a new project, or the validated existing target. */
export const createFromPlan = async (req: Request, plan: IAiPlan, target: PlanTarget | null): Promise<CreatedFromPlan> =>
  target ? createIntoProjectFromPlan(req, plan, target) : createProjectFromPlan(req, plan);
