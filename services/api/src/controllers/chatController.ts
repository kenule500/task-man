import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';
import ChatChannel, { GENERAL_SLUG, MAX_CHANNEL_NAME, type IChatChannel } from '../models/chatChannelModel.js';
import ChatMessage from '../models/chatMessageModel.js';
import ChatRead from '../models/chatReadModel.js';
import Project from '../models/projectModel.js';
import User from '../models/userModel.js';
import { emitToRooms } from '../realtime/publish.js';
import { recordActivity } from '../utils/activity.js';
import { EMPTY_CURSOR, afterCursor } from '../utils/changeCursor.js';
import { beforeCursor, clampLimit, dmKeyOf, messageCursor, previewOf, readCursor, slugifyChannel } from '../utils/chat.js';
import {
  ChatError, audienceRooms, canAccessChannel, ensureGeneralChannel, findAccessibleChannel, markChannelRead,
  onlineUserIds, postMessage, editMessage, deleteMessage, serializeChannel, serializeMessage, type ChatContext,
} from '../utils/chatService.js';
import { PUBLIC_USER_FIELDS, handleError, hasValidationErrors, workspaceOf } from './taskController.js';

const noStore = (res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
};

const oid = (value: unknown): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(String(value));

/** The acting person and workspace, from what `protect` and `requirePermission` attached. */
const contextOf = (req: Request): ChatContext => ({
  workspace: workspaceOf(req),
  userId: String(req.user!._id),
  userName: req.user!.name,
  userAvatar: req.user!.avatarUrl ?? '',
  permissions: (req as { permissions?: string[] }).permissions ?? [],
});

const fail = (res: Response, error: unknown, context: string) => {
  if (error instanceof ChatError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  handleError(res, error, context);
};

// ----------------------------------------------------------------
// Validation
// ----------------------------------------------------------------
const channelId = param('id').isMongoId().withMessage('Invalid channel');
const text = body('text').isString().withMessage('Message text is required');

export const validateCreateChannel = [
  body('type').optional().isIn(['team', 'project']).withMessage('Invalid channel type'),
  body('name').optional().isString().trim().isLength({ min: 1, max: MAX_CHANNEL_NAME }).withMessage(`Name must be 1 to ${MAX_CHANNEL_NAME} characters`),
  body('project').optional().isString().trim().isLength({ min: 1, max: 60 }).withMessage('Invalid project'),
  body('private').optional().isBoolean().withMessage('private must be true or false'),
  body('members').optional().isArray({ max: 200 }).withMessage('members must be a list'),
  body('members.*').isMongoId().withMessage('Invalid member'),
];
export const validateUpdateChannel = [
  channelId,
  body('name').optional().isString().trim().isLength({ min: 1, max: MAX_CHANNEL_NAME }).withMessage(`Name must be 1 to ${MAX_CHANNEL_NAME} characters`),
  body('members').optional().isArray({ max: 200 }).withMessage('members must be a list'),
  body('members.*').isMongoId().withMessage('Invalid member'),
];
export const validateChannelId = [channelId];
export const validateDm = [body('userId').isMongoId().withMessage('Invalid user')];
export const validateListMessages = [
  channelId,
  query('before').optional().isString().isLength({ max: 40 }).withMessage('Invalid cursor'),
  query('after').optional().isString().isLength({ max: 40 }).withMessage('Invalid cursor'),
  query('changedSince').optional().isISO8601().withMessage('Invalid date'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1 to 100'),
];
export const validatePostMessage = [channelId, text];
export const validateEditMessage = [param('id').isMongoId().withMessage('Invalid message'), text];
export const validateMessageId = [param('id').isMongoId().withMessage('Invalid message')];

// ----------------------------------------------------------------
// Channels
// ----------------------------------------------------------------
const workspaceMemberIds = (ctx: ChatContext): Set<string> => new Set(ctx.workspace.members.map(member => String(member.user)));

/** Public profile of each channel member, loaded once for a set of channels. */
const loadMemberProfiles = async (channels: { members?: mongoose.Types.ObjectId[]; type: string; private?: boolean }[]) => {
  const ids = new Set<string>();
  for (const channel of channels) {
    if (channel.type === 'dm' || channel.private) channel.members?.forEach(member => ids.add(String(member)));
  }
  if (ids.size === 0) return new Map<string, { _id: mongoose.Types.ObjectId; name: string; avatarUrl?: string }>();
  const users = await User.find({ _id: { $in: [...ids].map(oid) } }).select(PUBLIC_USER_FIELDS).lean();
  return new Map(users.map(user => [String(user._id), user as { _id: mongoose.Types.ObjectId; name: string; avatarUrl?: string }]));
};

const membersOf = (channel: { members?: mongoose.Types.ObjectId[]; type: string; private?: boolean }, profiles: Map<string, { _id: mongoose.Types.ObjectId; name: string; avatarUrl?: string }>) =>
  channel.type === 'dm' || channel.private
    ? (channel.members ?? []).map(member => profiles.get(String(member))).filter((user): user is NonNullable<typeof user> => Boolean(user))
    : [];

/** A channel in the shape clients use, with its member profiles (unread 0: for a fresh channel). */
const present = async (channel: IChatChannel) => {
  const profiles = await loadMemberProfiles([channel]);
  return serializeChannel(channel, { members: membersOf(channel, profiles) });
};

/**
 * @desc    Channels the caller can see, with unread counts and the last message of each
 * @route   GET /api/workspaces/:slug/chat/channels
 */
export const listChannels = async (req: Request, res: Response): Promise<void> => {
  noStore(res);
  try {
    const ctx = contextOf(req);
    await ensureGeneralChannel(ctx.workspace._id, ctx.userId);

    const all = await ChatChannel.find({ workspace: oid(ctx.workspace._id), archived: false }).lean();
    const channels = all.filter(channel => canAccessChannel(ctx, channel));
    const ids = channels.map(channel => channel._id);

    const joinedAt = ctx.workspace.members.find(member => String(member.user) === ctx.userId)?.joinedAt ?? new Date(0);
    const [reads, profiles] = await Promise.all([
      ChatRead.find({ user: oid(ctx.userId), channel: { $in: ids } }).lean(),
      loadMemberProfiles(channels),
    ]);
    const readAt = new Map(reads.map(read => [String(read.channel), read.lastReadAt]));

    const rows = await Promise.all(channels.map(async channel => {
      const since = readAt.get(String(channel._id)) ?? joinedAt;
      const [unread, last] = await Promise.all([
        ChatMessage.countDocuments({
          channel: channel._id, author: { $ne: oid(ctx.userId) }, deletedAt: null, createdAt: { $gt: since },
        }).limit(100),
        ChatMessage.findOne({ channel: channel._id, deletedAt: null })
          .sort({ createdAt: -1, _id: -1 })
          .populate('author', PUBLIC_USER_FIELDS)
          .lean(),
      ]);
      const author = last ? (last.author as unknown as { _id?: unknown; name?: string } | null) : null;
      const lastMessage = last
        ? {
          _id: String(last._id),
          text: previewOf(last.text),
          createdAt: last.createdAt,
          author: { _id: author?._id ? String(author._id) : '', name: author?.name ?? '' },
        }
        : null;
      return serializeChannel(channel, { members: membersOf(channel, profiles), unread, lastMessage });
    }));

    rows.sort((a, b) =>
      Number(b.isDefault) - Number(a.isDefault)
      || (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0) - (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0)
      || a.name.localeCompare(b.name));

    res.status(200).json({ channels: rows, unreadTotal: rows.reduce((sum, row) => sum + row.unread, 0) });
  } catch (error) {
    fail(res, error, 'listChannels');
  }
};

/**
 * @desc    Create a team channel (optionally private) or open a project's channel (idempotent)
 * @route   POST /api/workspaces/:slug/chat/channels   { name, type?, project?, private?, members? }
 */
export const createChannel = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const ctx = contextOf(req);
    const workspaceId = oid(ctx.workspace._id);
    const input = req.body as { name?: string; type?: 'team' | 'project'; project?: string; private?: boolean; members?: string[] };

    if (input.type === 'project') {
      if (!input.project) throw new ChatError('project is required');
      if (!ctx.permissions.includes('projects:read')) throw new ChatError('You do not have permission to do this', 403);
      const project = await Project.findOne({ workspace: workspaceId, nameKey: { $eq: input.project.trim().toLowerCase() } });
      if (!project) throw new ChatError('Project not found', 404);

      const existing = await ChatChannel.findOne({ workspace: workspaceId, type: 'project', project: { $eq: project.name } });
      if (existing) {
        if (existing.archived) await ChatChannel.updateOne({ _id: existing._id }, { $set: { archived: false } });
        res.status(200).json(await present(existing));
        return;
      }
      const channel = await ChatChannel.create({
        workspace: workspaceId,
        name: project.name,
        slug: `project-${slugifyChannel(project.name)}`.slice(0, 80),
        type: 'project',
        project: project.name,
        private: false,
        members: [],
        createdBy: oid(ctx.userId),
      });
      await announceCreated(req, channel);
      res.status(201).json(await present(channel));
      return;
    }

    if (!input.name) throw new ChatError('name is required');
    const slug = slugifyChannel(input.name);
    if (slug === GENERAL_SLUG || (await ChatChannel.exists({ workspace: workspaceId, slug: { $eq: slug } }))) {
      throw new ChatError('A channel with this name already exists', 409);
    }

    const members = new Set<string>([ctx.userId]);
    if (input.private) {
      const allowed = workspaceMemberIds(ctx);
      for (const member of input.members ?? []) {
        if (!allowed.has(member)) throw new ChatError('Members must belong to this workspace');
        members.add(member);
      }
    }
    const channel = await ChatChannel.create({
      workspace: workspaceId,
      name: input.name,
      slug,
      type: 'team',
      private: Boolean(input.private),
      members: input.private ? [...members].map(oid) : [],
      createdBy: oid(ctx.userId),
    });
    await announceCreated(req, channel);
    res.status(201).json(await present(channel));
  } catch (error) {
    fail(res, error, 'createChannel');
  }
};

const announceCreated = async (req: Request, channel: IChatChannel): Promise<void> => {
  await recordActivity(req, { action: 'chat.channel_created', summary: channel.name });
  await emitToRooms(audienceRooms(channel), 'chat:channel', { action: 'created', channel: await present(channel) });
};

/** Whether the person may rename or archive: the creator, or anyone who manages the workspace. */
const canManage = (ctx: ChatContext, channel: IChatChannel): boolean =>
  ctx.permissions.includes('settings:manage') || String(channel.createdBy) === ctx.userId;

const loadManageable = async (req: Request, res: Response): Promise<{ ctx: ChatContext; channel: IChatChannel } | null> => {
  const ctx = contextOf(req);
  const channel = await findAccessibleChannel(ctx, String(req.params.id));
  if (!channel || channel.archived) {
    res.status(404).json({ message: 'Channel not found' });
    return null;
  }
  if (channel.type === 'dm' || (channel.type === 'team' && channel.slug === GENERAL_SLUG)) {
    res.status(400).json({ message: 'This channel cannot be changed' });
    return null;
  }
  if (!canManage(ctx, channel)) {
    res.status(403).json({ message: 'Only the creator or a workspace manager can change this channel' });
    return null;
  }
  return { ctx, channel };
};

/**
 * @desc    Rename a channel or change who is in a private one
 * @route   PATCH /api/workspaces/:slug/chat/channels/:id   { name?, members? }
 */
export const updateChannel = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const loaded = await loadManageable(req, res);
    if (!loaded) return;
    const { ctx, channel } = loaded;
    const input = req.body as { name?: string; members?: string[] };
    const before = channel.name;

    if (input.name !== undefined && channel.type === 'team') {
      const slug = slugifyChannel(input.name);
      if (slug !== channel.slug) {
        if (slug === GENERAL_SLUG || (await ChatChannel.exists({ workspace: channel.workspace, slug: { $eq: slug }, _id: { $ne: channel._id } }))) {
          throw new ChatError('A channel with this name already exists', 409);
        }
        channel.slug = slug;
      }
      channel.name = input.name;
    }
    if (input.members !== undefined && channel.private) {
      const allowed = workspaceMemberIds(ctx);
      const next = new Set<string>([String(channel.createdBy ?? ctx.userId), ...input.members]);
      for (const member of next) if (!allowed.has(member)) throw new ChatError('Members must belong to this workspace');
      channel.members = [...next].map(oid);
    }
    await channel.save();

    await recordActivity(req, {
      action: 'chat.channel_updated',
      summary: channel.name,
      changes: before !== channel.name ? [{ field: 'name', from: before, to: channel.name }] : [],
    });
    const payload = await present(channel);
    await emitToRooms(audienceRooms(channel), 'chat:channel', { action: 'updated', channel: payload });
    res.status(200).json(payload);
  } catch (error) {
    fail(res, error, 'updateChannel');
  }
};

/**
 * @desc    Archive a channel (messages are kept)
 * @route   DELETE /api/workspaces/:slug/chat/channels/:id
 */
export const archiveChannel = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const loaded = await loadManageable(req, res);
    if (!loaded) return;
    const { channel } = loaded;
    channel.archived = true;
    await channel.save();
    await recordActivity(req, { action: 'chat.channel_deleted', summary: channel.name });
    await emitToRooms(audienceRooms(channel), 'chat:channel', { action: 'archived', channel: { _id: String(channel._id) } });
    res.status(200).json({ message: 'Channel archived' });
  } catch (error) {
    fail(res, error, 'archiveChannel');
  }
};

/**
 * @desc    Open the direct conversation with a member (the same one every time)
 * @route   POST /api/workspaces/:slug/chat/dm   { userId }
 */
export const openDirectMessage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const ctx = contextOf(req);
    const other = String((req.body as { userId: string }).userId);
    if (other === ctx.userId) throw new ChatError('You cannot message yourself');
    if (!workspaceMemberIds(ctx).has(other)) throw new ChatError('That person is not a member of this workspace', 404);

    const workspace = oid(ctx.workspace._id);
    const dmKey = dmKeyOf(ctx.userId, other);
    const find = () => ChatChannel.findOne({ workspace, dmKey: { $eq: dmKey } });
    let channel = await find();
    let created = false;
    if (!channel) {
      try {
        channel = await ChatChannel.create({
          workspace,
          name: 'Direct message',
          slug: `dm-${dmKey}`.slice(0, 80),
          type: 'dm',
          private: true,
          dmKey,
          members: [ctx.userId, other].map(oid),
          createdBy: oid(ctx.userId),
        });
        created = true;
      } catch (error) {
        // Both people opened it at once: the other request won
        if ((error as { code?: number }).code !== 11000) throw error;
        channel = await find();
      }
    }
    if (!channel) throw new ChatError('Could not open the conversation', 500);
    if (channel.archived) {
      channel.archived = false;
      await channel.save();
    }
    const payload = await present(channel);
    if (created) await emitToRooms(audienceRooms(channel), 'chat:channel', { action: 'created', channel: payload });
    res.status(created ? 201 : 200).json(payload);
  } catch (error) {
    fail(res, error, 'openDirectMessage');
  }
};

// ----------------------------------------------------------------
// Messages
// ----------------------------------------------------------------
const AUTHOR = { path: 'author', select: PUBLIC_USER_FIELDS };

/**
 * @desc    Message history. Newest page by default; `before` pages back; `after` returns what is newer (the
 *          polling fallback), plus edits and deletions since `changedSince`.
 * @route   GET /api/workspaces/:slug/chat/channels/:id/messages?before=&after=&limit=&changedSince=
 */
export const listMessages = async (req: Request, res: Response): Promise<void> => {
  noStore(res);
  if (hasValidationErrors(req, res)) return;
  try {
    const ctx = contextOf(req);
    const channel = await findAccessibleChannel(ctx, String(req.params.id));
    if (!channel) {
      res.status(404).json({ message: 'Channel not found' });
      return;
    }

    const before = readCursor(req.query.before);
    const after = readCursor(req.query.after);
    if (before === null || after === null) {
      res.status(400).json({ message: 'Invalid cursor' });
      return;
    }
    const limit = clampLimit(req.query.limit);
    const scope = { channel: channel._id, deletedAt: null };

    if (after) {
      const rows = await ChatMessage.find({ ...scope, ...afterCursor(after) })
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit + 1)
        .populate(AUTHOR);
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      let changes: ReturnType<typeof serializeMessage>[] = [];
      const since = typeof req.query.changedSince === 'string' ? new Date(req.query.changedSince) : null;
      if (since && !Number.isNaN(since.getTime())) {
        const changed = await ChatMessage.find({
          channel: channel._id,
          $or: [{ editedAt: { $gt: since } }, { deletedAt: { $gt: since } }],
        }).sort({ createdAt: 1 }).limit(MAX_CHANGES).populate(AUTHOR);
        const fresh = new Set(page.map(row => String(row._id)));
        changes = changed.filter(row => !fresh.has(String(row._id))).map(row => serializeMessage(row));
      }
      res.status(200).json({
        messages: page.map(row => serializeMessage(row)),
        changes,
        hasMore,
        cursor: page.length > 0 ? messageCursor(page[page.length - 1]) : String(req.query.after || EMPTY_CURSOR),
        serverTime: new Date().toISOString(),
      });
      return;
    }

    const rows = await ChatMessage.find({ ...scope, ...(before ? beforeCursor(before) : {}) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate(AUTHOR);
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
    res.status(200).json({
      messages: page.map(row => serializeMessage(row)),
      // Older messages exist beyond this page
      hasMore,
      cursor: page.length > 0 ? messageCursor(page[page.length - 1]) : EMPTY_CURSOR,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    fail(res, error, 'listMessages');
  }
};

const MAX_CHANGES = 100;

/**
 * @desc    Post a message (plain text, @mentions notify members)
 * @route   POST /api/workspaces/:slug/chat/channels/:id/messages   { text }
 */
export const createMessage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const ctx = contextOf(req);
    const channel = await findAccessibleChannel(ctx, String(req.params.id));
    if (!channel) {
      res.status(404).json({ message: 'Channel not found' });
      return;
    }
    res.status(201).json(await postMessage(ctx, channel, (req.body as { text: string }).text));
  } catch (error) {
    fail(res, error, 'createMessage');
  }
};

/** The caller's message with its channel, or null (missing, other workspace, no access to the channel). */
const loadOwnMessage = async (req: Request, ctx: ChatContext) => {
  if (!mongoose.isValidObjectId(String(req.params.id))) return null;
  const message = await ChatMessage.findOne({ _id: oid(req.params.id), workspace: oid(ctx.workspace._id) });
  if (!message) return null;
  const channel = await findAccessibleChannel(ctx, String(message.channel));
  return channel ? { message, channel } : null;
};

/**
 * @desc    Edit one of your own messages
 * @route   PATCH /api/workspaces/:slug/chat/messages/:id   { text }
 */
export const updateMessage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const ctx = contextOf(req);
    const found = await loadOwnMessage(req, ctx);
    if (!found || found.message.deletedAt) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }
    res.status(200).json(await editMessage(ctx, found.channel, found.message, (req.body as { text: string }).text));
  } catch (error) {
    fail(res, error, 'updateMessage');
  }
};

/**
 * @desc    Delete one of your own messages (soft delete)
 * @route   DELETE /api/workspaces/:slug/chat/messages/:id
 */
export const removeMessage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const ctx = contextOf(req);
    const found = await loadOwnMessage(req, ctx);
    if (!found || found.message.deletedAt) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }
    res.status(200).json(await deleteMessage(ctx, found.channel, found.message));
  } catch (error) {
    fail(res, error, 'removeMessage');
  }
};

/**
 * @desc    Mark a channel as read up to now
 * @route   POST /api/workspaces/:slug/chat/channels/:id/read
 */
export const markRead = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const ctx = contextOf(req);
    const channel = await findAccessibleChannel(ctx, String(req.params.id));
    if (!channel) {
      res.status(404).json({ message: 'Channel not found' });
      return;
    }
    const lastReadAt = await markChannelRead(ctx, channel._id);
    res.status(200).json({ channelId: String(channel._id), lastReadAt, unread: 0 });
  } catch (error) {
    fail(res, error, 'markRead');
  }
};

/**
 * @desc    Members with a live socket right now
 * @route   GET /api/workspaces/:slug/chat/presence
 */
export const getOnline = async (req: Request, res: Response): Promise<void> => {
  noStore(res);
  try {
    const ctx = contextOf(req);
    res.status(200).json({ online: await onlineUserIds(ctx.workspace._id) });
  } catch (error) {
    fail(res, error, 'getOnline');
  }
};

/**
 * @desc    Workspace members as name and avatar only (for mentions and direct messages; no users:read needed)
 * @route   GET /api/workspaces/:slug/chat/members
 */
export const listChatMembers = async (req: Request, res: Response): Promise<void> => {
  noStore(res);
  try {
    const ctx = contextOf(req);
    const users = await User.find({ _id: { $in: ctx.workspace.members.map(member => member.user) } })
      .select(PUBLIC_USER_FIELDS)
      .sort({ name: 1 })
      .lean();
    res.status(200).json({
      members: users.map(user => ({ _id: String(user._id), name: user.name, avatarUrl: user.avatarUrl ?? '' })),
    });
  } catch (error) {
    fail(res, error, 'listChatMembers');
  }
};
