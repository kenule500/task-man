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

// Creates the project, its sprints, epics, tasks, subtasks and acceptance criteria from a reviewed plan.
// All or nothing: whatever this call wrote is taken back when a step fails (the same approach as the importer).

type Id = mongoose.Types.ObjectId;

const BATCH = 200;

export interface CreatedFromPlan {
  project: { _id: string; name: string; key: string };
  counts: { sprints: number; epics: number; items: number; subtasks: number; tasks: number; criteria: number };
}

interface Draft {
  _id: Id;
  [field: string]: unknown;
}

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

/**
 * Creates everything for a plan that is `ready`. The caller has claimed the plan (`creating`) and handles the status;
 * this throws `AiQueueError` for conflicts (name or key already used) and rolls back on any other failure.
 */
export const createProjectFromPlan = async (req: Request, plan: IAiPlan): Promise<CreatedFromPlan> => {
  const workspace = req.workspace as IWorkspace;
  const workspaceId = workspace._id as Id;
  const userId = req.user?._id as Id;

  const parsed = editedPlanSchema.safeParse(plan.plan);
  if (!parsed.success) throw new AiQueueError(422, 'PLAN_INVALID', `The plan is not valid: ${describePlanProblem(parsed.error)}`);
  const content = finalizePlan(parsed.data, {
    startDate: plan.options.startDate,
    sprintLengthWeeks: plan.options.sprintLengthWeeks,
    keepDates: true,
  });

  // Names and keys are checked here (not silently changed): the person fixes them on the review screen
  const { names, keys } = await usedProjectNames(workspaceId);
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

  const taskIds: Id[] = [];
  const sprintIds: Id[] = content.sprints.map(() => new mongoose.Types.ObjectId());
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

    if (content.sprints.length > 0) {
      await Sprint.insertMany(content.sprints.map((sprint, index) => ({
        _id: sprintIds[index],
        workspace: workspaceId,
        project: projectId,
        name: sprint.name,
        goal: sprint.goal,
        startDate: dayToDate(sprint.startDate),
        endDate: dayToDate(sprint.endDate),
        status: 'planned',
      })));
    }

    const drafts = draftTasks(content, {
      sprintIds,
      userId,
      workspaceId,
      projectName: project.name,
      stage: resolvedStage,
      startDate: plan.options.startDate,
      sprintLengthWeeks: plan.options.sprintLengthWeeks,
      basePosition: Date.now(),
    });
    taskIds.push(...drafts.map(draft => draft._id));
    const firstNumber = await reserveTaskNumbers(workspaceId, drafts.length);
    const numbered = drafts.map((draft, index) => ({ ...draft, number: firstNumber + index }));
    for (let from = 0; from < numbered.length; from += BATCH) {
      await Task.insertMany(numbered.slice(from, from + BATCH) as never[]);
    }

    const counts = countPlan(content);
    await recordActivity(req, { action: 'project.created', summary: project.name, project: projectId });
    for (const [index, sprint] of content.sprints.entries()) {
      await recordActivity(req, {
        action: 'sprint.created', summary: `${sprint.name} · ${project.name}`, project: projectId, sprint: sprintIds[index],
      });
    }
    await recordActivity(req, {
      action: 'ai.plan_created',
      summary: project.name,
      project: projectId,
      changes: [
        { field: 'file', to: plan.source.fileName },
        { field: 'sprints', to: String(counts.sprints) },
        { field: 'tasks', to: String(numbered.length) },
        { field: 'subtasks', to: String(counts.subtasks) },
        { field: 'criteria', to: String(counts.criteria) },
      ],
    });

    return {
      project: { _id: String(projectId), name: project.name, key: project.key },
      counts: {
        sprints: counts.sprints, epics: counts.epics, items: counts.items, subtasks: counts.subtasks, tasks: numbered.length, criteria: counts.criteria,
      },
    };
  } catch (error) {
    // All or nothing: take back whatever this call already wrote
    try {
      if (taskIds.length > 0) await Task.deleteMany({ _id: { $in: taskIds }, workspace: workspaceId });
      await Sprint.deleteMany({ _id: { $in: sprintIds }, workspace: workspaceId });
      if (projectId) await Project.deleteOne({ _id: projectId, workspace: workspaceId });
    } catch (cleanupError) {
      console.error('createProjectFromPlan rollback error:', (cleanupError as Error).message);
    }
    if ((error as { code?: number } | null)?.code === 11000) {
      throw new AiQueueError(409, 'PROJECT_NAME_TAKEN', 'A project with this name already exists. Choose another name.');
    }
    throw error;
  }
};
