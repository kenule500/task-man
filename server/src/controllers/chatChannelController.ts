import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, query } from 'express-validator';
import ChatChannel, { CHANNEL_KINDS, MAX_CHANNEL_NAME, directKeyOf } from '../models/chatChannelModel.js';
import Project from '../models/projectModel.js';
import Workspace from '../models/workspaceModel.js';
import { canStartDirect, decideChannelAccess, visibleChannelClause } from '../utils/chatAccess.js';
import { handleError, hasValidationErrors, workspaceOf } from './taskController.js';

export const workspaceIdOf = (req: Request) => workspaceOf(req)._id as mongoose.Types.ObjectId;
const permissionsOf = (req: Request): string[] => (req as { permissions?: string[] }).permissions ?? [];
export { permissionsOf };

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

// Fixed channels every workspace has. Their names are seeded, not editable (spec AC-003).
// They differ in purpose, not permission: both are open to anyone with chat:read, and anyone with
// chat:write can post. The description tells members which one to use.
export const DEFAULT_CHANNELS = [
  {
    kind: 'team' as const,
    name: 'Team Chat',
    description: 'Day-to-day team coordination: workflows, resources, blockers and internal check-ins.',
  },
  {
    kind: 'general' as const,
    name: 'General',
    description: 'Workspace-wide announcements, broad discussion, and the watercooler.',
  },
];

const nameKeyOf = (name: string) => name.trim().toLowerCase();

/** Creates the team and general channels if the workspace does not have them yet. */
export const ensureDefaultChannels = async (workspaceId: mongoose.Types.ObjectId): Promise<void> => {
  await ChatChannel.bulkWrite(DEFAULT_CHANNELS.map(({ kind, name, description }) => ({
    updateOne: {
      filter: { workspace: workspaceId, kind, nameKey: nameKeyOf(name) },
      update: {
        $setOnInsert: { workspace: workspaceId, kind, name, nameKey: nameKeyOf(name), archived: false },
        // The purpose is fixed, so it is refreshed on every pass rather than only on insert
        $set: { description },
      },
      upsert: true,
    },
  })), { ordered: false }).catch(error => {
    // Two requests seeding at once race on the unique index: the channels exist either way
    if (!isDuplicateKey(error)) throw error;
  });
};

/**
 * Gives every existing project a channel.
 * Projects can predate this feature, and `syncProjectsFromTasks` can create projects outside createProject.
 */
export const backfillProjectChannels = async (workspaceId: mongoose.Types.ObjectId): Promise<void> => {
  const projects = await Project.find({ workspace: workspaceId }).select('_id name').lean();
  if (projects.length === 0) return;

  await ChatChannel.bulkWrite(projects.map(project => ({
    updateOne: {
      filter: { workspace: workspaceId, project: project._id },
      update: {
        $setOnInsert: {
          workspace: workspaceId,
          kind: 'project',
          project: project._id,
          name: project.name.slice(0, MAX_CHANNEL_NAME),
          nameKey: nameKeyOf(project.name),
          archived: false,
        },
      },
      upsert: true,
    },
  })), { ordered: false }).catch(error => {
    if (!isDuplicateKey(error)) throw error;
  });
};

/** Called when a project is created: one channel per project, reusing an existing one. */
export const createProjectChannel = async (
  workspaceId: mongoose.Types.ObjectId,
  project: { _id: mongoose.Types.ObjectId; name: string },
): Promise<void> => {
  await ChatChannel.updateOne(
    { workspace: workspaceId, project: project._id },
    {
      $setOnInsert: {
        workspace: workspaceId,
        kind: 'project',
        project: project._id,
        name: project.name.slice(0, MAX_CHANNEL_NAME),
        nameKey: nameKeyOf(project.name),
        archived: false,
      },
    },
    { upsert: true },
  ).catch(error => {
    if (!isDuplicateKey(error)) throw error;
  });
};

/** Called when a project is deleted: its channel goes read-only and keeps its history (spec AC-005). */
export const archiveProjectChannel = async (
  workspaceId: mongoose.Types.ObjectId,
  projectId: mongoose.Types.ObjectId,
): Promise<void> => {
  await ChatChannel.updateOne(
    { workspace: workspaceId, project: projectId },
    { $set: { archived: true } },
  );
};

export const validateListChannels = [
  query('kind').optional().isIn(CHANNEL_KINDS).withMessage('Unknown channel kind'),
];

export const validateStartDirect = [
  body('userId').isMongoId().withMessage('Choose a teammate to message'),
];

/**
 * @desc    Members the caller can mention or message: id, name and avatar only
 * @route   GET /api/workspaces/:slug/chat/members
 * Scoped to chat:read so a Viewer can mention people without holding users:read.
 */
export const listChatMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = await Workspace.findById(workspaceIdOf(req))
      .select('members.user')
      .populate('members.user', 'name avatarUrl')
      .lean();

    const members = (workspace?.members ?? [])
      .map(member => member.user as unknown as { _id: mongoose.Types.ObjectId; name?: string; avatarUrl?: string } | null)
      .filter((user): user is { _id: mongoose.Types.ObjectId; name?: string; avatarUrl?: string } => Boolean(user))
      .map(user => ({ _id: String(user._id), name: user.name ?? '', avatarUrl: user.avatarUrl ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ members });
  } catch (error) {
    handleError(res, error, 'listChatMembers');
  }
};

/**
 * @desc    Open (or reuse) the direct conversation between the caller and one teammate
 * @route   POST /api/workspaces/:slug/chat/direct
 */
export const startDirect = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    if (!canStartDirect(permissionsOf(req))) {
      res.status(403).json({ message: 'You do not have permission to send direct messages' });
      return;
    }

    const workspaceId = workspaceIdOf(req);
    const me = String(req.user?._id);
    const other = String(req.body.userId);

    if (other === me) {
      res.status(400).json({ message: 'You cannot message yourself' });
      return;
    }

    const member = await Workspace.findOne({
      _id: workspaceId,
      'members.user': new mongoose.Types.ObjectId(other),
    }).select('_id').lean();
    if (!member) {
      res.status(404).json({ message: 'Teammate not found in this workspace' });
      return;
    }

    const directKey = directKeyOf(me, other);
    const existing = await ChatChannel.findOne({ workspace: workspaceId, directKey }).select('-nameKey -__v').lean();
    if (existing) {
      res.status(200).json(existing);
      return;
    }

    try {
      const channel = await ChatChannel.create({
        workspace: workspaceId,
        kind: 'direct',
        name: 'Direct message',
        nameKey: 'direct message',
        participants: [new mongoose.Types.ObjectId(me), new mongoose.Types.ObjectId(other)],
        directKey,
      });
      const { nameKey, __v, ...view } = channel.toObject();
      res.status(201).json(view);
    } catch (error) {
      // Two people opening the conversation at once: the unique key resolves it, both get the same channel
      if (!isDuplicateKey(error)) throw error;
      const channel = await ChatChannel.findOne({ workspace: workspaceId, directKey }).select('-nameKey -__v').lean();
      res.status(200).json(channel);
    }
  } catch (error) {
    handleError(res, error, 'startDirect');
  }
};

export interface ChannelFailure {
  status: number;
  message: string;
}

export type ChannelLookup =
  | { ok: true; channel: InstanceType<typeof ChatChannel> }
  | { ok: false; failure: ChannelFailure };

/**
 * Loads a channel in the requesting workspace and applies the access rules.
 * A direct channel the caller is not part of answers 404, never 403, so its existence is not disclosed.
 */
export const loadChannelForCaller = async (
  req: Request,
  requireWrite = false,
): Promise<ChannelLookup> => {
  const id = String(req.params.channelId ?? '');
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, failure: { status: 404, message: 'Channel not found' } };
  }

  const channel = await ChatChannel.findOne({ _id: id, workspace: workspaceIdOf(req) });
  if (!channel) {
    return { ok: false, failure: { status: 404, message: 'Channel not found' } };
  }

  const decision = decideChannelAccess({
    channel,
    userId: String(req.user?._id),
    permissions: permissionsOf(req),
    requireWrite,
  });

  if (decision === 'not_found') return { ok: false, failure: { status: 404, message: 'Channel not found' } };
  if (decision === 'forbidden') {
    return {
      ok: false,
      failure: { status: 403, message: requireWrite ? 'You cannot post in this channel' : 'You cannot read this channel' },
    };
  }

  return { ok: true, channel };
};

// Team first, then general, then project channels by name, then direct conversations by name
const KIND_ORDER: Record<string, number> = { team: 0, general: 1, project: 2, direct: 3 };

/**
 * @desc    Channels the caller may read
 * @route   GET /api/workspaces/:slug/channels
 */
export const listChannels = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceIdOf(req);
    await ensureDefaultChannels(workspaceId);
    await backfillProjectChannels(workspaceId);

    const permissions = permissionsOf(req);
    const userId = String(req.user?._id);
    const filter: Record<string, unknown> = {
      workspace: workspaceId,
      ...visibleChannelClause(permissions, userId),
    };
    if (req.query.kind) {
      // Narrowing by kind must not widen visibility, so it is applied alongside the clause
      filter.kind = req.query.kind;
    }

    const rows = await ChatChannel.find(filter)
      .select('-nameKey -__v')
      .sort({ name: 1 })
      .lean();

    rows.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
      || String(a.name).localeCompare(String(b.name)));

    res.status(200).json(rows);
  } catch (error) {
    handleError(res, error, 'listChannels');
  }
};
