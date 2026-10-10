import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Task, { TASK_TYPES, TASK_STATUSES, type TaskStatus, type TaskType } from '../models/taskModel.js';
import Project, { MAX_PROJECT_NAME } from '../models/projectModel.js';
import Sprint from '../models/sprintModel.js';
import User from '../models/userModel.js';
import type { IWorkspace } from '../models/workspaceModel.js';
import { recordActivity } from '../utils/activity.js';
import { normalizeLabels } from '../utils/taskQuery.js';
import { reserveTaskNumbers } from '../utils/taskNumbers.js';
import { stageFor, workflowOf } from '../utils/workflow.js';
import { cleanText, looksLikeEmail } from '../utils/importers/text.js';
import { resolveLinks } from '../utils/importers/links.js';
import {
  IMPORT_LIMITS, IMPORT_SOURCES, ImportParseError, MAX_IMPORT_CONTENT, MAX_IMPORT_ITEMS, parseImport, suggestStatus, suggestType,
  type ImportItem, type ImportSource, type ParsedImport,
} from '../utils/importers/index.js';
import { TaskRuleError, handleError, hasValidationErrors, workspaceOf } from './taskController.js';

const PREVIEW_ITEMS = 20;
const MAX_LIST = 100;
const MAX_WARNINGS = 50;
const MAX_MAPPING_ENTRIES = 2000;
const MAX_NEW_SPRINTS = 30;
const BATCH = 500;
const SPRINT_DAYS = 14;

class ConflictError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ================================================================
// Validation
// ================================================================
const sourceAndContent = [
  body('source').isIn(IMPORT_SOURCES).withMessage('Choose a source: csv, trello or jira'),
  body('content').isString().withMessage('The file content is required')
    .bail()
    .isLength({ min: 1, max: MAX_IMPORT_CONTENT }).withMessage('The file must not be empty or larger than 2 MB'),
];

export const validatePreviewImport = sourceAndContent;
export const validateCommitImport = [
  ...sourceAndContent,
  body('mapping').isObject().withMessage('mapping is required'),
];

// ================================================================
// Helpers
// ================================================================
const parseOrReject = (source: ImportSource, content: string): ParsedImport => {
  try {
    return parseImport(source, content);
  } catch (error) {
    if (error instanceof ImportParseError) throw new TaskRuleError(error.message);
    throw error;
  }
};

interface Member {
  id: string;
  name: string;
  email: string;
}

const loadMembers = async (workspace: IWorkspace): Promise<Member[]> => {
  const ids = workspace.members.map(member => member.user);
  const users = await User.find({ _id: { $in: ids } }).select('name email').lean();
  return users.map(user => ({ id: String(user._id), name: String(user.name ?? ''), email: String(user.email ?? '').toLowerCase() }));
};

/** Finds the workspace member a source person stands for: by email, else by a unique full name. */
const matchMember = (members: readonly Member[], identifier: string): Member | null => {
  const wanted = identifier.trim().toLowerCase();
  if (!wanted) return null;
  if (looksLikeEmail(wanted)) return members.find(member => member.email === wanted) ?? null;
  const byName = members.filter(member => member.name.trim().toLowerCase() === wanted);
  return byName.length === 1 ? byName[0] : null;
};

const tally = (values: Iterable<string>): { name: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
};

const previewItem = (item: ImportItem) => ({
  externalId: item.externalId,
  title: item.title,
  status: item.status,
  type: item.type,
  priority: item.priority,
  labels: item.labels,
  assignees: item.assigneeEmails,
  dueDate: item.dueDate,
  startDate: item.startDate,
  storyPoints: item.storyPoints,
  parentExternalId: item.parentExternalId,
  epicExternalId: item.epicExternalId,
  sprint: item.sprintName,
  comments: item.comments.length,
  checklist: item.checklist.length,
});

// ================================================================
// @desc    Read an export file and describe what it contains (nothing is saved)
// @route   POST /api/workspaces/:slug/import/preview
// @body    { source: 'csv'|'trello'|'jira', content: string }
// ================================================================
export const previewImport = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspace = workspaceOf(req);
    const source = req.body.source as ImportSource;
    const parsed = parseOrReject(source, req.body.content as string);
    const members = await loadMembers(workspace);
    const warnings = [...parsed.warnings];
    if (parsed.items.length > MAX_IMPORT_ITEMS) {
      warnings.unshift(`The file has ${parsed.items.length} items; an import takes at most ${MAX_IMPORT_ITEMS}. Split the file.`);
    }

    const statusCounts = new Map(tally(parsed.items.map(item => item.status)).map(entry => [entry.name, entry.count]));
    const people = tally(parsed.items.flatMap(item => item.assigneeEmails)).map(entry => {
      const member = matchMember(members, entry.name);
      return { identifier: entry.name, count: entry.count, isMember: Boolean(member), memberId: member?.id ?? null, memberName: member?.name ?? null };
    });

    res.status(200).json({
      source,
      total: parsed.items.length,
      limit: MAX_IMPORT_ITEMS,
      skipped: parsed.skipped,
      columns: parsed.columns,
      statuses: parsed.columns.map(name => ({ name, count: statusCounts.get(name) ?? 0, suggested: suggestStatus(name) })),
      types: tally(parsed.items.map(item => item.type).filter(Boolean)).map(entry => ({ ...entry, suggested: suggestType(entry.name) })),
      people: people.slice(0, MAX_LIST * 5),
      labels: tally(parsed.items.flatMap(item => item.labels)).sort((a, b) => b.count - a.count).slice(0, MAX_LIST),
      sprints: tally(parsed.items.map(item => item.sprintName).filter((name): name is string => Boolean(name))),
      withParent: parsed.items.filter(item => item.parentExternalId).length,
      withEpic: parsed.items.filter(item => item.epicExternalId).length,
      comments: parsed.items.reduce((sum, item) => sum + item.comments.length, 0),
      members: members.map(member => ({ id: member.id, name: member.name })),
      stages: workflowOf(workspace).map(stage => ({ key: stage.key, name: stage.name, group: stage.group })),
      items: parsed.items.slice(0, PREVIEW_ITEMS).map(previewItem),
      warnings: warnings.slice(0, MAX_WARNINGS),
    });
  } catch (error) {
    handleError(res, error, 'previewImport');
  }
};

// ================================================================
// Mapping from the request
// ================================================================
interface Mapping {
  project: { existing: string } | { name: string; key?: string };
  statusMap: Map<string, string>;
  userMap: Map<string, string | null>;
  typeMap: Map<string, TaskType>;
  createSprints: boolean;
  includeComments: boolean;
}

/** Entries of a request object as a Map (never read through the object itself, so keys like "constructor" are plain data). */
const entriesOf = (value: unknown, label: string): [string, unknown][] => {
  if (value === undefined || value === null) return [];
  if (!isRecord(value)) throw new TaskRuleError(`${label} must be an object`);
  const entries = Object.entries(value);
  if (entries.length > MAX_MAPPING_ENTRIES) throw new TaskRuleError(`${label} has too many entries`);
  return entries;
};

const readMapping = (raw: unknown, workspace: IWorkspace): Mapping => {
  if (!isRecord(raw)) throw new TaskRuleError('mapping is required');

  let project: Mapping['project'];
  if (typeof raw.project === 'string') {
    const name = raw.project.trim();
    if (!name) throw new TaskRuleError('Choose a project');
    project = { existing: name };
  } else if (isRecord(raw.project) && typeof raw.project.name === 'string') {
    const name = cleanText(raw.project.name, MAX_PROJECT_NAME);
    if (!name) throw new TaskRuleError('The new project needs a name');
    const key = typeof raw.project.key === 'string' ? raw.project.key.trim().toUpperCase() : '';
    if (key && !/^[A-Z0-9]{2,6}$/.test(key)) throw new TaskRuleError('The project key must be 2 to 6 letters or numbers');
    project = { name, key: key || undefined };
  } else {
    throw new TaskRuleError('Choose a project');
  }

  const stageKeys = new Set(workflowOf(workspace).map(stage => stage.key));
  const statusMap = new Map<string, string>();
  for (const [name, value] of entriesOf(raw.statusMap, 'statusMap')) {
    if (typeof value !== 'string' || !(stageKeys.has(value) || (TASK_STATUSES as readonly string[]).includes(value))) {
      throw new TaskRuleError(`Unknown status or stage for "${name.slice(0, 40)}"`);
    }
    statusMap.set(name, value);
  }

  const memberIds = new Set(workspace.members.map(member => member.user.toString()));
  const userMap = new Map<string, string | null>();
  for (const [name, value] of entriesOf(raw.userMap, 'userMap')) {
    if (value === null || value === '') {
      userMap.set(name, null);
    } else if (typeof value === 'string' && mongoose.isValidObjectId(value) && memberIds.has(value)) {
      userMap.set(name, value);
    } else {
      throw new TaskRuleError(`"${name.slice(0, 60)}" must be mapped to a member of this workspace or left unassigned`);
    }
  }

  const typeMap = new Map<string, TaskType>();
  for (const [name, value] of entriesOf(raw.typeMap, 'typeMap')) {
    if (typeof value !== 'string' || !(TASK_TYPES as readonly string[]).includes(value)) {
      throw new TaskRuleError(`Unknown task type for "${name.slice(0, 40)}"`);
    }
    typeMap.set(name, value as TaskType);
  }

  return {
    project,
    statusMap,
    userMap,
    typeMap,
    createSprints: raw.createSprints === true,
    includeComments: raw.includeComments !== false && raw.includeComments !== 'false',
  };
};

const dayToDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const todayKey = (): string => new Date().toISOString().slice(0, 10);

interface ImportedComment {
  author: string | mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
}

interface Candidate {
  source: ImportItem;
  id: mongoose.Types.ObjectId;
  type: TaskType;
  data: Record<string, unknown>;
}

// ================================================================
// @desc    Create the tasks of an export file in one project
// @route   POST /api/workspaces/:slug/import/commit
// @body    { source, content, mapping: { project, statusMap, userMap, typeMap, createSprints, includeComments } }
// ================================================================
export const commitImport = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  const createdTaskIds: mongoose.Types.ObjectId[] = [];
  const createdSprintIds: mongoose.Types.ObjectId[] = [];
  let createdProjectId: mongoose.Types.ObjectId | null = null;

  try {
    const workspace = workspaceOf(req);
    const workspaceId = workspace._id as mongoose.Types.ObjectId;
    const source = req.body.source as ImportSource;
    const permissions = req.permissions ?? [];
    const canManageProjects = permissions.includes('projects:write');

    const parsed = parseOrReject(source, req.body.content as string);
    if (parsed.items.length === 0) throw new TaskRuleError('There is nothing to import in this file');
    if (parsed.items.length > MAX_IMPORT_ITEMS) {
      throw new TaskRuleError(`An import takes at most ${MAX_IMPORT_ITEMS} items; this file has ${parsed.items.length}. Split the file.`);
    }
    const mapping = readMapping(req.body.mapping, workspace);
    if ('name' in mapping.project && !canManageProjects) {
      res.status(403).json({ message: 'You need permission to create projects to import into a new one' });
      return;
    }

    const members = await loadMembers(workspace);
    const memberIds = new Set(members.map(member => member.id));
    const workflow = workflowOf(workspace);
    const warnings = [...parsed.warnings];
    const counters = { noDue: 0, badDates: 0, invalid: 0, commentsAsImporter: 0 };
    const invalidReasons = new Set<string>();

    // ---- Existing project (checked before anything is written)
    let existingProject: InstanceType<typeof Project> | null = null;
    if ('existing' in mapping.project) {
      existingProject = await Project.findOne({
        workspace: workspaceId,
        nameKey: { $eq: mapping.project.existing.toLowerCase() },
      });
      if (!existingProject) throw new TaskRuleError('Project not found in this workspace');
      if (existingProject.archived) throw new TaskRuleError('This project is archived');
    } else if (await Project.exists({ workspace: workspaceId, nameKey: { $eq: mapping.project.name.toLowerCase() } })) {
      throw new ConflictError('A project with this name already exists');
    }
    const wantsSprints = parsed.items.some(item => item.sprintName);
    if (wantsSprints && mapping.createSprints && !canManageProjects) {
      warnings.push('Sprints were not created because your role cannot create sprints');
      mapping.createSprints = false;
    }

    // ---- Per-item data
    const importerId = req.user?._id as mongoose.Types.ObjectId;
    const today = todayKey();
    const now = new Date();
    const basePosition = Date.now();

    const resolveStatus = (raw: string): { stage: string; status: TaskStatus } => {
      const wanted = mapping.statusMap.get(raw) ?? suggestStatus(raw);
      const stage = workflow.some(item => item.key === wanted)
        ? stageFor(workflow, { stage: wanted })
        : stageFor(workflow, { status: wanted as TaskStatus });
      return stage ?? stageFor(workflow, { status: 'pending' }) as { stage: string; status: TaskStatus };
    };

    const userFor = (identifier: string): string | null => {
      if (mapping.userMap.has(identifier)) return mapping.userMap.get(identifier) ?? null;
      return matchMember(members, identifier)?.id ?? null;
    };

    const candidates: Candidate[] = [];
    for (const [index, item] of parsed.items.entries()) {
      const type = mapping.typeMap.get(item.type) ?? suggestType(item.type);
      const { stage, status } = resolveStatus(item.status);

      const assignees = [...new Set(item.assigneeEmails.map(userFor).filter((id): id is string => id !== null && memberIds.has(id)))]
        .slice(0, IMPORT_LIMITS.assignees);

      const labels = normalizeLabels(normalizeLabels(item.labels).map(label => cleanText(label, IMPORT_LIMITS.label)))
        .slice(0, IMPORT_LIMITS.labels);

      const deadlineDay = item.dueDate ?? item.startDate ?? today;
      if (!item.dueDate && !item.startDate) counters.noDue++;
      let startDay = item.startDate;
      if (startDay && startDay > deadlineDay) {
        counters.badDates++;
        startDay = null;
      }

      const comments = mapping.includeComments
        ? item.comments.slice(0, IMPORT_LIMITS.comments).flatMap((comment): ImportedComment[] => {
          const text = cleanText(comment.text, IMPORT_LIMITS.comment, true);
          if (!text) return [];
          const author = userFor(comment.authorEmail);
          if (author) return [{ author, text, createdAt: comment.createdAt ? new Date(comment.createdAt) : now }];
          counters.commentsAsImporter++;
          const prefix = comment.authorEmail ? `Imported comment from ${comment.authorEmail}: ` : 'Imported comment: ';
          return [{
            author: importerId,
            text: cleanText(`${prefix}${text}`, IMPORT_LIMITS.comment, true),
            createdAt: comment.createdAt ? new Date(comment.createdAt) : now,
          }];
        })
        : [];

      const id = new mongoose.Types.ObjectId();
      candidates.push({
        source: item,
        id,
        type,
        data: {
          _id: id,
          title: cleanText(item.title, IMPORT_LIMITS.title),
          description: cleanText(item.description, IMPORT_LIMITS.description, true),
          status,
          stage,
          priority: item.priority ?? 'medium',
          type,
          storyPoints: item.storyPoints,
          labels,
          assignees,
          checklist: item.checklist.slice(0, IMPORT_LIMITS.checklistItems)
            .map(entry => ({ text: cleanText(entry.text, IMPORT_LIMITS.checklistText), done: entry.done }))
            .filter(entry => entry.text),
          comments,
          startDate: startDay ? dayToDate(startDay) : undefined,
          deadline: dayToDate(deadlineDay),
          position: basePosition + index,
          completedAt: status === 'completed' ? now : undefined,
          watchers: [],
          dependencies: [],
          owner: importerId,
          workspace: workspaceId,
        },
      });
    }

    // ---- Drop items the task model would reject (nothing is written yet)
    const valid: Candidate[] = [];
    for (const candidate of candidates) {
      try {
        await new Task({ ...candidate.data, project: 'validation' }).validate();
        valid.push(candidate);
      } catch (error) {
        counters.invalid++;
        if (error instanceof mongoose.Error.ValidationError) {
          const message = Object.values(error.errors)[0]?.message;
          if (message) invalidReasons.add(message.slice(0, 120));
        }
      }
    }
    if (valid.length === 0) throw new TaskRuleError('None of the items could be imported');

    // ---- Parent and epic links
    const typeById = new Map(valid.map(candidate => [candidate.source.externalId, candidate.type]));
    const linkResult = resolveLinks(valid.map(candidate => candidate.source), id => typeById.get(id) ?? 'task');
    warnings.push(...linkResult.warnings);
    const taskIdByExternal = new Map(valid.map(candidate => [candidate.source.externalId, candidate.id]));

    // ---- Project (created only now that the file is known to be usable)
    let project = existingProject;
    if (!project) {
      const requested = mapping.project as { name: string; key?: string };
      project = await Project.create({
        workspace: workspaceId, name: requested.name, key: requested.key, createdBy: importerId,
      });
      createdProjectId = project._id as mongoose.Types.ObjectId;
      await recordActivity(req, { action: 'project.created', summary: project.name, project: createdProjectId });
    }
    const projectId = project._id as mongoose.Types.ObjectId;

    // ---- Sprints (existing ones by name; new ones only when asked)
    const sprintIdByName = new Map<string, mongoose.Types.ObjectId>();
    const wantedSprints = new Map<string, string>();
    for (const candidate of valid) {
      const name = candidate.source.sprintName;
      if (name && candidate.type !== 'epic' && !wantedSprints.has(name.toLowerCase())) wantedSprints.set(name.toLowerCase(), name);
    }
    let sprintsCreated = 0;
    let sprintsSkipped = 0;
    if (wantedSprints.size > 0) {
      const existing = await Sprint.find({ workspace: workspaceId, project: projectId });
      const start = dayToDate(today);
      const end = new Date(start.getTime() + (SPRINT_DAYS - 1) * 86_400_000);
      for (const [key, name] of wantedSprints) {
        const found = existing.find(sprint => sprint.name.trim().toLowerCase() === key);
        if (found) {
          if (found.status === 'completed') sprintsSkipped++;
          else sprintIdByName.set(key, found._id as mongoose.Types.ObjectId);
        } else if (mapping.createSprints && sprintsCreated < MAX_NEW_SPRINTS) {
          const sprint = await Sprint.create({ workspace: workspaceId, project: projectId, name: name.slice(0, IMPORT_LIMITS.sprint), startDate: start, endDate: end });
          createdSprintIds.push(sprint._id as mongoose.Types.ObjectId);
          sprintIdByName.set(key, sprint._id as mongoose.Types.ObjectId);
          sprintsCreated++;
        } else {
          sprintsSkipped++;
        }
      }
    }

    // ---- Numbers, links and one write
    const firstNumber = await reserveTaskNumbers(workspaceId, valid.length);
    const sprintOf = new Map<string, mongoose.Types.ObjectId | null>();
    for (const candidate of valid) {
      const name = candidate.source.sprintName;
      sprintOf.set(candidate.source.externalId, name && candidate.type !== 'epic' ? sprintIdByName.get(name.toLowerCase()) ?? null : null);
    }
    const documents = valid.map((candidate, index) => {
      const link = linkResult.links.get(candidate.source.externalId);
      const parentExternal = link?.parent ?? null;
      // A subtask shares the sprint of its parent unless it names one of its own
      const sprint = sprintOf.get(candidate.source.externalId) ?? (parentExternal ? sprintOf.get(parentExternal) ?? null : null);
      return {
        ...candidate.data,
        _id: candidate.id,
        number: firstNumber + index,
        project: project.name,
        sprint,
        parent: parentExternal ? taskIdByExternal.get(parentExternal) ?? null : null,
        epic: link?.epic ? taskIdByExternal.get(link.epic) ?? null : null,
      };
    });
    if (sprintsSkipped > 0 && wantedSprints.size > 0) {
      warnings.push(`${sprintsSkipped} sprint${sprintsSkipped === 1 ? '' : 's'} named in the file ${sprintsSkipped === 1 ? 'was' : 'were'} not used (not created, or already completed); those items are in the backlog`);
    }

    for (let from = 0; from < documents.length; from += BATCH) {
      const batch = documents.slice(from, from + BATCH);
      await Task.insertMany(batch as never[]);
      createdTaskIds.push(...batch.map(document => document._id));
    }

    // ---- Summary warnings
    if (counters.noDue > 0) warnings.push(`${counters.noDue} item${counters.noDue === 1 ? ' has' : 's have'} no date in the file, so today (${today}) is their due date`);
    if (counters.badDates > 0) warnings.push(`${counters.badDates} start date${counters.badDates === 1 ? ' was' : 's were'} after the due date and ${counters.badDates === 1 ? 'was' : 'were'} dropped`);
    if (counters.commentsAsImporter > 0) warnings.push(`${counters.commentsAsImporter} comment${counters.commentsAsImporter === 1 ? '' : 's'} could not be matched to a member and ${counters.commentsAsImporter === 1 ? 'is' : 'are'} shown as written by you`);
    if (counters.invalid > 0) warnings.push(`${counters.invalid} item${counters.invalid === 1 ? '' : 's'} could not be imported${invalidReasons.size > 0 ? ` (${[...invalidReasons].slice(0, 3).join('; ')})` : ''}`);

    const created = documents.length;
    const skipped = parsed.skipped + counters.invalid;
    await recordActivity(req, {
      action: 'import.completed',
      summary: `Imported ${created} task${created === 1 ? '' : 's'} from ${source} into ${project.name}`,
      project: projectId,
      changes: [
        { field: 'source', to: source },
        { field: 'created', to: String(created) },
        { field: 'skipped', to: String(skipped) },
        ...(sprintsCreated > 0 ? [{ field: 'sprints', to: String(sprintsCreated) }] : []),
      ],
    });

    res.status(201).json({
      created,
      skipped,
      sprintsCreated,
      warnings: warnings.slice(0, MAX_WARNINGS),
      project: { _id: projectId, name: project.name, key: project.key },
    });
  } catch (error) {
    // All or nothing: take back whatever this request already wrote
    try {
      if (createdTaskIds.length > 0) await Task.deleteMany({ _id: { $in: createdTaskIds }, workspace: workspaceOf(req)._id });
      if (createdSprintIds.length > 0) await Sprint.deleteMany({ _id: { $in: createdSprintIds }, workspace: workspaceOf(req)._id });
      if (createdProjectId) await Project.deleteOne({ _id: createdProjectId, workspace: workspaceOf(req)._id });
    } catch (cleanupError) {
      console.error('commitImport rollback error:', (cleanupError as Error).message);
    }
    if (error instanceof ConflictError) {
      res.status(409).json({ message: error.message });
      return;
    }
    handleError(res, error, 'commitImport');
  }
};
