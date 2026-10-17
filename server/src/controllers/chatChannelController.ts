import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, query } from 'express-validator';
import ChatChannel, { CHANNEL_KINDS, MAX_CHANNEL_NAME, directKeyOf } from '../models/chatChannelModel.js';
import ChatMessage from '../models/chatMessageModel.js';
import ChatRead from '../models/chatReadModel.js';
import Project from '../models/projectModel.js';
import Workspace from '../models/workspaceModel.js';
import { emitToChannel } from '../realtime/bus.js';
import { deleteFiles, openFileStream, saveFile } from '../utils/gridfs.js';
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

/** Display name of a channel: the override a Product Owner set, else the project's name. */
export const displayNameOf = (
  channel: { name: string; nameOverride?: string | null },
  projectName?: string | null,
): string => channel.nameOverride?.trim() || projectName?.trim() || channel.name;

/**
 * @desc    Team channels the caller may read, with preview and unread state, in one request
 * @route   GET /api/workspaces/:slug/chat/teams
 */
export const listTeamChannels = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspaceId = workspaceIdOf(req);
    await backfillProjectChannels(workspaceId);

    const permissions = permissionsOf(req);
    const userId = String(req.user?._id);
    const moderator = permissions.includes('chat:moderate');

    const memberProjects = moderator
      ? await Project.find({ workspace: workspaceId }).select('_id name').lean()
      : await Project.find({
        workspace: workspaceId,
        members: new mongoose.Types.ObjectId(userId),
      }).select('_id name').lean();
    const projectNameById = new Map(memberProjects.map(project => [String(project._id), project.name]));

    const projectIds = memberProjects.map(project => project._id);
    const channels = projectIds.length === 0
      ? []
      : await ChatChannel.find({
        workspace: workspaceId,
        kind: 'project',
        project: { $in: projectIds },
      }).select('-nameKey -__v -directKey').sort({ archived: 1, name: 1 }).lean();

    // Last message per channel and the caller's read pointers, in two queries rather than per channel
    const channelIds = channels.map(channel => channel._id);
    const [lastMessages, reads] = await Promise.all([
      channelIds.length === 0 ? [] : ChatMessage.aggregate<{
        _id: mongoose.Types.ObjectId; body: string; createdAt: Date; authorName?: string;
      }>([
        { $match: { channel: { $in: channelIds }, deletedAt: null } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$channel', body: { $first: '$body' }, createdAt: { $first: '$createdAt' }, author: { $first: '$author' } } },
        { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'authorDoc' } },
        { $project: { body: 1, createdAt: 1, authorName: { $ifNull: [{ $first: '$authorDoc.name' }, ''] } } },
      ]),
      ChatRead.find({ channel: { $in: channelIds }, user: new mongoose.Types.ObjectId(userId) })
        .select('channel lastReadAt').lean(),
    ]);

    const previewOf = new Map(lastMessages.map(row => [String(row._id), row]));
    const readOf = new Map(reads.map(row => [String(row.channel), row.lastReadAt]));

    const teams = channels.map(channel => {
      const preview = previewOf.get(String(channel._id));
      const lastReadAt = readOf.get(String(channel._id));
      const projectName = channel.project ? projectNameById.get(String(channel.project)) : undefined;
      return {
        _id: String(channel._id),
        name: displayNameOf(channel, projectName),
        project: channel.project ? String(channel.project) : null,
        avatarUrl: channel.avatarFileId ? `/chat/${String(channel._id)}/avatar` : null,
        archived: Boolean(channel.archived),
        lastMessage: preview ? { body: preview.body, at: preview.createdAt, authorName: preview.authorName } : null,
        unread: Boolean(preview && (!lastReadAt || preview.createdAt > lastReadAt)),
      };
    });

    res.status(200).json({ teams });
  } catch (error) {
    handleError(res, error, 'listTeamChannels');
  }
};

export const validateRenameChannel = [
  body('name').isString().trim().isLength({ min: 1, max: MAX_CHANNEL_NAME })
    .withMessage(`Channel names are limited to ${MAX_CHANNEL_NAME} characters`),
];

/**
 * @desc    Rename a team channel (chat:moderate only)
 * @route   PATCH /api/workspaces/:slug/chat/:channelId
 */
export const renameChannel = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const lookup = await loadChannelForCaller(req, true);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }
    if (lookup.channel.kind !== 'project') {
      res.status(400).json({ message: 'Only team channels can be renamed' });
      return;
    }

    lookup.channel.nameOverride = String(req.body.name).trim();
    await lookup.channel.save();

    emitToChannel(String(lookup.channel._id), 'chat:channel', channelSummary(lookup.channel));
    res.status(200).json(channelSummary(lookup.channel));
  } catch (error) {
    handleError(res, error, 'renameChannel');
  }
};

/**
 * @desc    Replace a team channel's avatar (chat:moderate only)
 * @route   POST /api/workspaces/:slug/chat/:channelId/avatar
 */
export const setChannelAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const lookup = await loadChannelForCaller(req, true);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }
    if (lookup.channel.kind !== 'project') {
      res.status(400).json({ message: 'Only team channels can have an avatar' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'No image received' });
      return;
    }

    const previous = lookup.channel.avatarFileId;
    const fileId = await saveFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    lookup.channel.avatarFileId = String(fileId);
    lookup.channel.avatarType = req.file.mimetype;
    await lookup.channel.save();
    // The old file is only removed once the new one is stored, so a failed upload keeps the previous avatar
    if (previous) await deleteFiles([previous]);

    emitToChannel(String(lookup.channel._id), 'chat:channel', channelSummary(lookup.channel));
    res.status(200).json(channelSummary(lookup.channel));
  } catch (error) {
    handleError(res, error, 'setChannelAvatar');
  }
};

/**
 * @desc    Stream a channel avatar to callers who may read the channel
 * @route   GET /api/workspaces/:slug/chat/:channelId/avatar
 */
export const getChannelAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const lookup = await loadChannelForCaller(req);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }
    if (!lookup.channel.avatarFileId) {
      res.status(404).json({ message: 'This channel has no avatar' });
      return;
    }

    res.setHeader('Content-Type', lookup.channel.avatarType ?? 'image/png');
    res.setHeader('Cache-Control', 'private, no-cache');
    const stream = openFileStream(lookup.channel.avatarFileId);
    stream.once('error', () => {
      if (!res.headersSent) res.status(404).json({ message: 'Avatar not found' });
    });
    stream.pipe(res);
  } catch (error) {
    handleError(res, error, 'getChannelAvatar');
  }
};

/** What the client needs to update a channel in place after a rename or avatar change. */
const channelSummary = (channel: {
  _id: unknown; name: string; nameOverride?: string | null; avatarFileId?: string | null; archived?: boolean;
}) => ({
  _id: String(channel._id),
  name: channel.nameOverride?.trim() || channel.name,
  avatarUrl: channel.avatarFileId ? `/chat/${String(channel._id)}/avatar` : null,
  archived: Boolean(channel.archived),
});

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

  // Project channels are gated by the owning project's membership
  let isProjectMember: boolean | undefined;
  if (channel.kind === 'project' && channel.project) {
    const project = await Project.findOne({
      _id: channel.project,
      workspace: channel.workspace,
      members: new mongoose.Types.ObjectId(String(req.user?._id)),
    }).select('_id').lean();
    isProjectMember = Boolean(project);
  }

  const decision = decideChannelAccess({
    channel,
    userId: String(req.user?._id),
    permissions: permissionsOf(req),
    requireWrite,
    isProjectMember,
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
    // Project channels are visible by project membership, so the caller's projects are resolved once
    const memberProjects = await Project.find({
      workspace: workspaceId,
      members: new mongoose.Types.ObjectId(userId),
    }).select('_id').lean();
    const filter: Record<string, unknown> = {
      workspace: workspaceId,
      ...visibleChannelClause(permissions, userId, memberProjects.map(project => String(project._id))),
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

    // Member counts and unread state come from one query each, not one per channel
    const ids = rows.map(row => row._id);
    const [workspace, projectRows, reads] = await Promise.all([
      Workspace.findById(workspaceId).select('members').lean(),
      Project.find({ workspace: workspaceId }).select('_id members').lean(),
      ids.length === 0
        ? []
        : ChatRead.find({ channel: { $in: ids }, user: new mongoose.Types.ObjectId(userId) })
          .select('channel lastReadAt').lean(),
    ]);

    const workspaceMembers = workspace?.members.length ?? 0;
    const projectMemberCount = new Map(projectRows.map(p => [String(p._id), p.members?.length ?? 0]));
    const readAt = new Map(reads.map(row => [String(row.channel), row.lastReadAt]));

    // Only the two default channels are main-menu entries; project channels belong to the chat screen's
    // team list, so the server states this rather than leaving each client to hardcode it (spec T12.3)
    res.status(200).json(rows.map(row => {
      const lastReadAt = readAt.get(String(row._id));
      const memberCount = row.kind === 'direct'
        ? (row.participants?.length ?? 0)
        : row.kind === 'project'
          ? projectMemberCount.get(String(row.project)) ?? 0
          : workspaceMembers;
      return {
        ...row,
        mainMenu: row.kind === 'team' || row.kind === 'general',
        memberCount,
        unread: Boolean(row.lastMessageAt && (!lastReadAt || new Date(row.lastMessageAt) > new Date(lastReadAt))),
      };
    }));
  } catch (error) {
    handleError(res, error, 'listChannels');
  }
};
