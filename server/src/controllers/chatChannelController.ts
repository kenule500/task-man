import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';
import ChatChannel, {
  CHANNEL_KINDS, MAX_CHANNEL_NAME, MAX_DIRECT_PARTICIPANTS, directKeyOf,
} from '../models/chatChannelModel.js';
import ChatMessage from '../models/chatMessageModel.js';
import ChatPresence from '../models/chatPresenceModel.js';
import ChatRead from '../models/chatReadModel.js';
import Project from '../models/projectModel.js';
import Role from '../models/roleModel.js';
import User from '../models/userModel.js';
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
    name: 'Project Chat',
    // The stored kind stays 'team' so permissions, indexes and existing rows are untouched (AC-078);
    // only the label describes what the channel is actually used for (FR-072, FR-073).
    description: 'Project coordination: work in progress, resources, blockers and decisions.',
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

  await renameLegacyTeamChannel(workspaceId);
};

/** The label the seeded team channel carried before v2; kept so the backfill can recognise it. */
export const LEGACY_TEAM_CHANNEL_NAME = 'Team Chat';

/**
 * Renames an existing `Team Chat` row to `Project Chat` (FR-072, AC-076).
 *
 * The seeding pass runs on every list request, so an existing workspace corrects itself here instead
 * of needing a migration script. The write is guarded against the unique
 * (workspace, kind, nameKey) index (RISK-011): if a `team` row already holds the target name, that row
 * is the default channel and the legacy one is left alone rather than failing the whole seed.
 */
const renameLegacyTeamChannel = async (workspaceId: mongoose.Types.ObjectId): Promise<void> => {
  const target = DEFAULT_CHANNELS.find(channel => channel.kind === 'team');
  if (!target) return;
  const targetKey = nameKeyOf(target.name);

  // Already renamed, or never seeded: nothing to do
  const legacy = await ChatChannel.findOne({
    workspace: workspaceId,
    kind: 'team',
    nameKey: nameKeyOf(LEGACY_TEAM_CHANNEL_NAME),
  }).select('_id nameOverride').lean();
  if (!legacy) return;

  // A second team row already answers to the new name: renaming would collide on the unique index
  const occupied = await ChatChannel.exists({
    workspace: workspaceId,
    kind: 'team',
    nameKey: targetKey,
    _id: { $ne: legacy._id },
  });
  if (occupied) return;

  // `nameKey` is derived in a document hook, which updateOne does not run, so it is set explicitly
  await ChatChannel.updateOne(
    { _id: legacy._id, workspace: workspaceId },
    { $set: { name: target.name.slice(0, MAX_CHANNEL_NAME), nameKey: targetKey } },
  );
};

/**
 * Gives every existing project a channel.
 * Projects can predate this feature, and `syncProjectsFromTasks` can create projects outside createProject.
 */
export const backfillProjectChannels = async (workspaceId: mongoose.Types.ObjectId): Promise<void> => {
  const projects = await Project.find({ workspace: workspaceId })
    .select('_id name createdBy members').lean();
  if (projects.length === 0) return;

  // The creator is part of the project and therefore of its channel, even without an assigned task.
  // The channel backfill already runs on every list request, so an existing workspace corrects itself
  // here instead of needing a migration (spec FR-064).
  const missingCreator = projects.filter(project => project.createdBy
    && !(project.members ?? []).some(id => String(id) === String(project.createdBy)));
  if (missingCreator.length > 0) {
    await Project.bulkWrite(missingCreator.map(project => ({
      updateOne: {
        filter: { _id: project._id },
        update: { $addToSet: { members: project.createdBy } },
      },
    })), { ordered: false });
  }

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

/**
 * Called when a project is created: one channel per project, reusing an existing one.
 * Returns nothing on purpose — callers that need the row read it back through `projectChannelCard`.
 */
export const createProjectChannel = async (
  workspaceId: mongoose.Types.ObjectId,
  project: { _id: mongoose.Types.ObjectId; name: string; members?: (mongoose.Types.ObjectId | string)[] },
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

/**
 * The card a granted channel is announced with: enough for the client to render the row and join its
 * room, and nothing it would have to fetch (FR-076, AC-081). Ensures the channel exists first, so a
 * project that predates its channel still produces a grant (EC-030).
 */
export const projectChannelCard = async (
  workspaceId: mongoose.Types.ObjectId,
  project: { _id: mongoose.Types.ObjectId; name: string; members?: (mongoose.Types.ObjectId | string)[] },
): Promise<ChannelCard> => {
  await createProjectChannel(workspaceId, project);
  // Read back rather than build a view by hand: the row may have pre-existed with its own name/avatar
  const stored = await ChatChannel.findOne({ workspace: workspaceId, project: project._id })
    .select('name avatarFileId archived').lean();

  return channelCard(stored ?? { _id: project._id, archived: false }, {
    // The project's current name wins, so a rename is reflected without touching the channel row
    name: project.name,
    avatarUrl: stored?.avatarFileId ? `/chat/${String(project._id)}/avatar` : null,
    project: String(project._id),
    memberCount: project.members?.length ?? 0,
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
 * Unread message count per channel for one caller: messages newer than that channel's read pointer,
 * tombstones excluded. One aggregation for the whole list, never a query per row (spec NFR-023).
 */
const unreadCountsFor = async (
  channelIds: unknown[],
  userId: string,
): Promise<Map<string, number>> => {
  if (channelIds.length === 0) return new Map();
  const rows = await ChatMessage.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { channel: { $in: channelIds }, deletedAt: null } },
    {
      $lookup: {
        from: 'chatreads',
        let: { channel: '$channel' },
        pipeline: [{
          $match: {
            $expr: {
              $and: [
                { $eq: ['$channel', '$$channel'] },
                { $eq: ['$user', new mongoose.Types.ObjectId(userId)] },
              ],
            },
          },
        }],
        as: 'read',
      },
    },
    { $addFields: { lastReadAt: { $ifNull: [{ $first: '$read.lastReadAt' }, null] } } },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ['$lastReadAt', null] },
            { $gt: ['$createdAt', '$lastReadAt'] },
          ],
        },
      },
    },
    { $group: { _id: '$channel', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map(row => [String(row._id), row.count]));
};

/**
 * The fields of a conversation row that are not about its messages: identity, name, picture and size.
 * Extracted so the grant event and the conversations list describe a channel the same way (FR-076).
 */
export const channelCard = (
  channel: { _id: unknown; archived?: boolean },
  fields: { name: string; avatarUrl: string | null; project?: string | null; memberCount?: number },
) => ({
  _id: String(channel._id),
  name: fields.name,
  project: fields.project ?? null,
  avatarUrl: fields.avatarUrl,
  memberCount: fields.memberCount ?? 0,
  archived: Boolean(channel.archived),
});

export type ChannelCard = ReturnType<typeof channelCard>;

/** The shape both conversation sections render: one card per channel with its preview and unread state. */
const conversationCard = (
  channel: { _id: unknown; archived?: boolean },
  fields: { name: string; avatarUrl: string | null; project?: string | null; memberCount?: number },
  preview: { body: string; createdAt: Date; authorName?: string } | undefined,
  unreadCount: number,
): ChannelCard & {
  lastMessage: { body: string; at: Date; authorName: string } | null;
  unread: boolean;
  unreadCount: number;
} => ({
  ...channelCard(channel, fields),
  lastMessage: preview ? { body: preview.body, at: preview.createdAt, authorName: preview.authorName ?? '' } : null,
  unread: unreadCount > 0,
  unreadCount,
});

type ConversationCardShape = ReturnType<typeof conversationCard>;

/** Newest first, so both sections follow recent activity; never-used conversations fall back to name. */
const byRecency = (a: ConversationCardShape, b: ConversationCardShape): number => {
  const at = a.lastMessage ? a.lastMessage.at.getTime() : 0;
  const bt = b.lastMessage ? b.lastMessage.at.getTime() : 0;
  if (at !== bt) return bt - at;
  return a.name.localeCompare(b.name);
};

/**
 * @desc    The caller's conversations — direct messages and team channels — with previews and unread
 *          state, in one request so the side panel needs a single round trip
 * @route   GET /api/workspaces/:slug/chat/conversations
 */
export const listConversations = async (req: Request, res: Response): Promise<void> => {
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

    const [teams, directs] = await Promise.all([
      projectIds.length === 0
        ? []
        : ChatChannel.find({ workspace: workspaceId, kind: 'project', project: { $in: projectIds } })
          .select('-nameKey -__v -directKey').sort({ archived: 1, name: 1 }).lean(),
      // A direct conversation is listed for its two participants only
      ChatChannel.find({ workspace: workspaceId, kind: 'direct', participants: new mongoose.Types.ObjectId(userId) })
        .select('-nameKey -__v -directKey').lean(),
    ]);

    const channelIds = [...teams, ...directs].map(channel => channel._id);

    // Last message, unread count and names for every channel in a few queries, never one per channel
    const [lastMessages, unreadCounts, otherUsers] = await Promise.all([
      channelIds.length === 0 ? [] : ChatMessage.aggregate<{
        _id: mongoose.Types.ObjectId; body: string; createdAt: Date; authorName?: string;
      }>([
        { $match: { channel: { $in: channelIds }, deletedAt: null } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$channel', body: { $first: '$body' }, createdAt: { $first: '$createdAt' }, author: { $first: '$author' } } },
        { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'authorDoc' } },
        { $project: { body: 1, createdAt: 1, authorName: { $ifNull: [{ $first: '$authorDoc.name' }, ''] } } },
      ]),
      unreadCountsFor(channelIds, userId),
      // The other participant of each direct conversation, for its name and picture
      User.find({
        _id: {
          $in: directs.flatMap(channel => channel.participants ?? [])
            .filter(id => String(id) !== userId),
        },
      }).select('name avatarUrl').lean(),
    ]);

    const previewOf = new Map(lastMessages.map(row => [String(row._id), row]));
    const userById = new Map(otherUsers.map(user => [String(user._id), user]));

    const teamCards = teams.map(channel => conversationCard(
      channel,
      {
        name: displayNameOf(channel, channel.project ? projectNameById.get(String(channel.project)) : undefined),
        avatarUrl: channel.avatarFileId ? `/chat/${String(channel._id)}/avatar` : null,
        project: channel.project ? String(channel.project) : null,
      },
      previewOf.get(String(channel._id)),
      unreadCounts.get(String(channel._id)) ?? 0,
    ));

    const directCards = directs.map(channel => {
      const otherId = (channel.participants ?? []).map(String).find(id => id !== userId) ?? '';
      const other = userById.get(otherId);
      return conversationCard(
        channel,
        {
          // A direct conversation is named after the person, not the stored placeholder
          name: other?.name ?? 'Direct message',
          avatarUrl: other?.avatarUrl ?? null,
        },
        previewOf.get(String(channel._id)),
        unreadCounts.get(String(channel._id)) ?? 0,
      );
    });

    res.status(200).json({ directs: directCards.sort(byRecency), teams: teamCards.sort(byRecency) });
  } catch (error) {
    handleError(res, error, 'listConversations');
  }
};

/** Kept for callers that only need the team channels. */
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

    // Last message per channel and the caller's unread count, in two queries rather than per channel
    const channelIds = channels.map(channel => channel._id);
    const [lastMessages, unreadCounts] = await Promise.all([
      channelIds.length === 0 ? [] : ChatMessage.aggregate<{
        _id: mongoose.Types.ObjectId; body: string; createdAt: Date; authorName?: string;
      }>([
        { $match: { channel: { $in: channelIds }, deletedAt: null } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$channel', body: { $first: '$body' }, createdAt: { $first: '$createdAt' }, author: { $first: '$author' } } },
        { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'authorDoc' } },
        { $project: { body: 1, createdAt: 1, authorName: { $ifNull: [{ $first: '$authorDoc.name' }, ''] } } },
      ]),
      unreadCountsFor(channelIds, userId),
    ]);

    const previewOf = new Map(lastMessages.map(row => [String(row._id), row]));

    const teams = channels.map(channel => conversationCard(
      channel,
      {
        name: displayNameOf(channel, channel.project ? projectNameById.get(String(channel.project)) : undefined),
        avatarUrl: channel.avatarFileId ? `/chat/${String(channel._id)}/avatar` : null,
        project: channel.project ? String(channel.project) : null,
      },
      previewOf.get(String(channel._id)),
      unreadCounts.get(String(channel._id)) ?? 0,
    ));

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
    const workspaceId = workspaceIdOf(req);
    const users = await workspaceDirectory(workspaceId);

    const members = users
      .map(user => ({ _id: user._id, name: user.name, avatarUrl: user.avatarUrl }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ members });
  } catch (error) {
    handleError(res, error, 'listChatMembers');
  }
};

/** A member of the workspace with the fields the chat surfaces render. */
interface DirectoryUser {
  _id: string;
  name: string;
  avatarUrl: string;
}

/**
 * The workspace's people, by id (NFR-030). Extracted from `listChatMembers` so the channel-members
 * resolver can reuse it instead of issuing the same query a second time.
 */
const workspaceDirectory = async (workspaceId: mongoose.Types.ObjectId): Promise<DirectoryUser[]> => {
  const workspace = await Workspace.findById(workspaceId)
    .select('members.user')
    .populate('members.user', 'name avatarUrl')
    .lean();

  return (workspace?.members ?? [])
    .map(member => member.user as unknown as { _id: mongoose.Types.ObjectId; name?: string; avatarUrl?: string } | null)
    .filter((user): user is { _id: mongoose.Types.ObjectId; name?: string; avatarUrl?: string } => Boolean(user))
    .map(user => ({ _id: String(user._id), name: user.name ?? '', avatarUrl: user.avatarUrl ?? '' }));
};

/** One row of the channel member panel. */
export interface ChannelMember {
  _id: string;
  name: string;
  avatarUrl: string;
  roleName: string;
  online: boolean;
}

/**
 * Who belongs to a channel, resolved from its kind alone (EC-038, FR-094):
 *
 *  - `project`  - the owning project's members
 *  - `direct`   - exactly its two participants
 *  - otherwise  - every workspace member (the `team` and `general` channels are open to the workspace)
 *
 * Two reads plus one `Role` lookup at most, never a query per member (NFR-030). Ids outside the
 * workspace directory are dropped, so a stale project member cannot leak a removed user's name.
 */
const resolveChannelAudience = async (
  workspaceId: mongoose.Types.ObjectId,
  channel: { kind: string; project?: mongoose.Types.ObjectId | null; participants?: mongoose.Types.ObjectId[] },
): Promise<{ users: DirectoryUser[]; roleByUserId: Map<string, string>; onlineIds: Set<string> }> => {
  // The workspace member list carries the role assignment; a project or direct audience is intersected
  // with it below, so the role always describes a real workspace membership.
  const [directory, workspace] = await Promise.all([
    workspaceDirectory(workspaceId),
    Workspace.findById(workspaceId).select('members.user members.roleId').lean(),
  ]);

  const roleByUserId = new Map<string, string>();
  const roleIds = new Set<string>();
  for (const member of workspace?.members ?? []) {
    const roleId = member.roleId ? String(member.roleId) : '';
    if (!roleId) continue;
    roleIds.add(roleId);
    roleByUserId.set(String(member.user), roleId);
  }

  // One lookup for every distinct role actually referenced, not one per member
  const roles = roleIds.size === 0
    ? []
    : await Role.find({ _id: { $in: [...roleIds] } }).select('name').lean();
  const roleNameById = new Map(roles.map(role => [String(role._id), role.name]));

  let audience = directory;
  if (channel.kind === 'project' && channel.project) {
    const project = await Project.findOne({ _id: channel.project, workspace: workspaceId })
      .select('members').lean();
    const projectMembers = new Set((project?.members ?? []).map(String));
    audience = directory.filter(user => projectMembers.has(user._id));
  } else if (channel.kind === 'direct') {
    const participants = new Set((channel.participants ?? []).map(String));
    audience = directory.filter(user => participants.has(user._id));
  }

  // Presence rows are the same source the socket broadcasts, so the panel and the header agree
  const online = audience.length === 0
    ? []
    : await ChatPresence.find({
      workspace: workspaceId,
      user: { $in: audience.map(user => new mongoose.Types.ObjectId(user._id)) },
      connections: { $gt: 0 },
    }).select('user').lean();
  const onlineIds = new Set(online.map(row => String(row.user)));

  return {
    users: audience,
    roleByUserId: new Map([...roleByUserId].map(([userId, roleId]) => [userId, roleNameById.get(roleId) ?? ''])),
    onlineIds,
  };
};

export const validateChannelIdParam = [
  param('channelId').isMongoId().withMessage('Channel not found'),
];

/**
 * @desc    Everyone in one channel, with their workspace role and presence
 * @route   GET /api/workspaces/:slug/chat/:channelId/members
 */
export const channelMembers = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const lookup = await loadChannelForCaller(req);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }

    const { users, roleByUserId, onlineIds } = await resolveChannelAudience(
      workspaceIdOf(req),
      lookup.channel,
    );

    const members: ChannelMember[] = users
      .map(user => ({
        _id: user._id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        roleName: roleByUserId.get(user._id) ?? '',
        online: onlineIds.has(user._id),
      }))
      // Online first, then alphabetical, matching the panel's grouping (FR-095)
      .sort((a, b) => (Number(b.online) - Number(a.online)) || a.name.localeCompare(b.name));

    res.status(200).json({ members, count: members.length });
  } catch (error) {
    handleError(res, error, 'channelMembers');
  }
};

export const validateProjectChannelParam = [
  param('projectId').isMongoId().withMessage('Project not found'),
];

/**
 * @desc    The channel for one project, created on demand so the project header can link to it
 * @route   GET /api/workspaces/:slug/chat/projects/:projectId/channel
 *
 * A project the caller cannot see answers 404, never 403, so the endpoint does not disclose which
 * projects exist (EC-040, NFR-035). Only a member of the project may cause a channel to be created.
 */
export const projectChannel = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceIdOf(req);
    const project = await Project.findOne({
      _id: String(req.params.projectId),
      workspace: workspaceId,
      members: new mongoose.Types.ObjectId(String(req.user?._id)),
    }).select('_id name members').lean();

    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const card = await projectChannelCard(workspaceId, {
      _id: project._id as mongoose.Types.ObjectId,
      name: project.name,
      members: project.members ?? [],
    });

    res.status(200).json(card);
  } catch (error) {
    handleError(res, error, 'projectChannel');
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
      // A direct conversation always counts its two participants (spec AC-068)
      res.status(200).json({ ...existing, memberCount: MAX_DIRECT_PARTICIPANTS });
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
      res.status(201).json({ ...view, memberCount: MAX_DIRECT_PARTICIPANTS });
    } catch (error) {
      // Two people opening the conversation at once: the unique key resolves it, both get the same channel
      if (!isDuplicateKey(error)) throw error;
      const channel = await ChatChannel.findOne({ workspace: workspaceId, directKey }).select('-nameKey -__v').lean();
      res.status(200).json({ ...channel, memberCount: MAX_DIRECT_PARTICIPANTS });
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
