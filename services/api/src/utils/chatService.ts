import mongoose from 'mongoose';
import ChatChannel, { GENERAL_SLUG, type IChatChannel } from '../models/chatChannelModel.js';
import ChatMessage, { MAX_MESSAGE_LENGTH, type IChatMessage } from '../models/chatMessageModel.js';
import ChatPresence, { CHAT_PRESENCE_TTL_SECONDS } from '../models/chatPresenceModel.js';
import ChatRead from '../models/chatReadModel.js';
import Notification from '../models/notificationModel.js';
import Role from '../models/roleModel.js';
import User from '../models/userModel.js';
import Workspace from '../models/workspaceModel.js';
import { emitToRooms, rooms } from '../realtime/publish.js';
import { parseChatMentions, previewOf } from './chat.js';
import { loadMentionCandidates, wantsPush } from './notify.js';
import { isPushConfigured, sendPushToUser } from './webPush.js';

// Team chat rules shared by the REST handlers and the Socket.IO server

type Id = mongoose.Types.ObjectId | string;

export class ChatError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Who is acting in which workspace, with the permissions their role grants. */
export interface ChatContext {
  workspace: { _id: Id; slug: string; name: string; members: { user: Id; joinedAt?: Date }[] };
  userId: string;
  userName: string;
  userAvatar: string;
  permissions: string[];
}

/** Channel fields the access rules need (documents and lean objects both fit). */
export interface ChannelAccessInfo {
  workspace: Id;
  type: string;
  private?: boolean;
  members?: Id[];
}

/** Whether the person may read and post in the channel. Anything unreadable is reported as missing. */
export const canAccessChannel = (
  ctx: Pick<ChatContext, 'workspace' | 'userId' | 'permissions'>,
  channel: ChannelAccessInfo,
): boolean => {
  if (String(channel.workspace) !== String(ctx.workspace._id)) return false;
  if (!ctx.permissions.includes('tasks:read')) return false;
  if (channel.type === 'project' && !ctx.permissions.includes('projects:read')) return false;
  if (channel.type === 'dm' || channel.private) return (channel.members ?? []).some(member => String(member) === ctx.userId);
  return true;
};

/** Socket rooms that hear about a channel's activity: members of private channels, the whole workspace otherwise. */
export const audienceRooms = (channel: ChannelAccessInfo): string[] =>
  channel.type === 'dm' || channel.private
    ? (channel.members ?? []).map(member => rooms.user(member))
    : [rooms.workspace(channel.workspace)];

/** Context for a socket (no request): null when the person left the workspace or lost chat access. */
export const loadChatContext = async (userId: Id, workspaceId: Id): Promise<ChatContext | null> => {
  const workspace = await Workspace.findOne({
    _id: new mongoose.Types.ObjectId(String(workspaceId)),
    'members.user': new mongoose.Types.ObjectId(String(userId)),
  });
  const membership = workspace?.members.find(member => String(member.user) === String(userId));
  if (!workspace || !membership?.roleId) return null;
  const [role, user] = await Promise.all([
    Role.findById(membership.roleId),
    User.findById(userId).select('name avatarUrl twoFactor'),
  ]);
  if (!role || !user) return null;
  if (workspace.security?.require2fa && !user.twoFactor?.enabled) return null;
  return {
    workspace,
    userId: String(userId),
    userName: user.name,
    userAvatar: user.avatarUrl ?? '',
    permissions: role.permissions,
  };
};

// ----------------------------------------------------------------
// Serialization
// ----------------------------------------------------------------
interface PublicUser {
  _id: Id;
  name: string;
  avatarUrl?: string;
}

const publicUser = (user: unknown): { _id: string; name: string; avatarUrl: string } | null => {
  if (!user || typeof user !== 'object' || !('name' in user)) return null;
  const { _id, name, avatarUrl } = user as PublicUser;
  return { _id: String(_id), name, avatarUrl: avatarUrl ?? '' };
};

type MessageLike = Pick<IChatMessage, 'text' | 'mentions' | 'editedAt' | 'deletedAt' | 'createdAt'> & {
  _id: Id;
  channel: Id;
  author: unknown;
};

/** A message as clients see it; a deleted one keeps only its place (`deleted: true`, no text). */
export const serializeMessage = (message: MessageLike, author?: PublicUser | null) => {
  const deleted = Boolean(message.deletedAt);
  const raw = message.author as { _id?: Id } | Id;
  const authorId = typeof raw === 'object' && raw !== null && '_id' in raw && raw._id ? raw._id : (raw as Id);
  return {
    _id: String(message._id),
    channel: String(message.channel),
    author: publicUser(author ?? message.author) ?? { _id: String(authorId), name: '', avatarUrl: '' },
    text: deleted ? '' : message.text,
    mentions: (message.mentions ?? []).map(String),
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    deleted,
  };
};

type ChannelLike = Pick<IChatChannel, 'name' | 'slug' | 'type' | 'private'> & {
  _id: Id;
  workspace: Id;
  project?: string;
  members?: Id[];
  createdBy?: Id;
  lastMessageAt?: Date | null;
};

export const serializeChannel = (
  channel: ChannelLike,
  extras: { members?: PublicUser[]; unread?: number; lastMessage?: unknown } = {},
) => ({
  _id: String(channel._id),
  workspace: String(channel.workspace),
  name: channel.name,
  slug: channel.slug,
  type: channel.type,
  project: channel.project ?? '',
  private: Boolean(channel.private),
  isDefault: channel.type === 'team' && channel.slug === GENERAL_SLUG,
  createdBy: channel.createdBy ? String(channel.createdBy) : null,
  lastMessageAt: channel.lastMessageAt ?? null,
  // Who belongs: only direct messages and private channels have a member list
  memberIds: channel.type === 'dm' || channel.private ? (channel.members ?? []).map(String) : [],
  members: (extras.members ?? []).map(publicUser).filter((user): user is NonNullable<typeof user> => user !== null),
  unread: extras.unread ?? 0,
  lastMessage: extras.lastMessage ?? null,
});

// ----------------------------------------------------------------
// Channels
// ----------------------------------------------------------------
/** Creates #general on first use (concurrent first calls end up with one). */
export const ensureGeneralChannel = async (workspaceId: Id, userId: Id): Promise<void> => {
  const workspace = new mongoose.Types.ObjectId(String(workspaceId));
  try {
    await ChatChannel.updateOne(
      { workspace, slug: { $eq: GENERAL_SLUG } },
      {
        $setOnInsert: {
          name: 'general', type: 'team', private: false, archived: false, members: [],
          createdBy: new mongoose.Types.ObjectId(String(userId)),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
};

/** The channel when it exists in the workspace and the person can access it. */
export const findAccessibleChannel = async (ctx: ChatContext, channelId: unknown) => {
  if (typeof channelId !== 'string' || !mongoose.isValidObjectId(channelId)) return null;
  const channel = await ChatChannel.findOne({
    _id: new mongoose.Types.ObjectId(channelId),
    workspace: new mongoose.Types.ObjectId(String(ctx.workspace._id)),
  });
  return channel && canAccessChannel(ctx, channel) ? channel : null;
};

/** Moves the person's read marker forward (never back). */
export const markChannelRead = async (
  ctx: Pick<ChatContext, 'workspace' | 'userId'>,
  channelId: Id,
  at = new Date(),
): Promise<Date> => {
  await ChatRead.updateOne(
    { user: new mongoose.Types.ObjectId(ctx.userId), channel: new mongoose.Types.ObjectId(String(channelId)) },
    { $max: { lastReadAt: at }, $setOnInsert: { workspace: new mongoose.Types.ObjectId(String(ctx.workspace._id)) } },
    { upsert: true },
  );
  return at;
};

// ----------------------------------------------------------------
// Messages
// ----------------------------------------------------------------
export const cleanText = (value: unknown): string => {
  if (typeof value !== 'string') throw new ChatError('Message text is required');
  const text = value.replace(/\r\n/g, '\n').trim();
  if (text.length === 0) throw new ChatError('Message text is required');
  if (text.length > MAX_MESSAGE_LENGTH) throw new ChatError(`A message can have at most ${MAX_MESSAGE_LENGTH} characters`);
  return text;
};

const mentionIdsFor = async (ctx: ChatContext, channel: ChannelAccessInfo, text: string): Promise<string[]> => {
  const candidates = await loadMentionCandidates(ctx.workspace);
  const restricted = channel.type === 'dm' || channel.private;
  return parseChatMentions(text, candidates, { authorId: ctx.userId, allowed: restricted ? channel.members ?? [] : null });
};

/** In-app notification and device push for each tagged member (never the sender); never throws. */
const notifyMentioned = async (ctx: ChatContext, channel: IChatChannel, mentioned: string[], text: string): Promise<void> => {
  try {
    const memberIds = new Set(ctx.workspace.members.map(member => String(member.user)));
    const recipients = [...new Set(mentioned)]
      .filter(id => id !== ctx.userId && memberIds.has(id) && mongoose.isValidObjectId(id));
    if (recipients.length === 0) return;
    const summary = previewOf(text, 140);
    const created = await Notification.insertMany(recipients.map(user => ({
      user, workspace: ctx.workspace._id, actor: ctx.userId, type: 'chat.mention', channel: channel._id, summary,
    })));
    if (!isPushConfigured()) return;
    const users = await User.find({ _id: { $in: recipients } }).select('notifications');
    await Promise.allSettled(users.map(async user => {
      if (!wantsPush(user.notifications)) return;
      const label = channel.type === 'dm' ? '' : ` in #${channel.name}`;
      await sendPushToUser(String(user._id), {
        title: 'TaskMan',
        body: previewOf(`${ctx.userName} mentioned you${label}: ${text}`, 200),
        url: `/${ctx.workspace.slug}/chat/${String(channel._id)}`,
        tag: String(created.find(row => String(row.user) === String(user._id))?._id ?? channel._id),
      });
    }));
  } catch (error) {
    console.error('chat mention notify error:', (error as Error).message);
  }
};

const activityPayload = (channel: IChatChannel, message: ReturnType<typeof serializeMessage>) => ({
  workspace: String(channel.workspace),
  channelId: String(channel._id),
  messageId: message._id,
  authorId: message.author._id,
  authorName: message.author.name,
  preview: previewOf(message.text),
  createdAt: message.createdAt,
  mentions: message.mentions,
});

/** Stores a message, tells the channel and its audience, and notifies tagged members. */
export const postMessage = async (ctx: ChatContext, channel: IChatChannel, rawText: unknown) => {
  if (channel.archived) throw new ChatError('This channel is archived', 409);
  const text = cleanText(rawText);
  const mentions = await mentionIdsFor(ctx, channel, text);

  const message = await ChatMessage.create({
    workspace: ctx.workspace._id,
    channel: channel._id,
    author: ctx.userId,
    text,
    mentions,
  });
  await Promise.all([
    ChatChannel.updateOne({ _id: channel._id }, { $max: { lastMessageAt: message.createdAt } }),
    markChannelRead(ctx, channel._id, message.createdAt),
  ]);

  const payload = serializeMessage(message, { _id: ctx.userId, name: ctx.userName, avatarUrl: ctx.userAvatar });
  await emitToRooms([rooms.channel(channel._id)], 'chat:message', payload);
  await emitToRooms(audienceRooms(channel), 'chat:activity', activityPayload(channel, payload));
  await notifyMentioned(ctx, channel, mentions, text);
  return payload;
};

/** Changes the text of the person's own message. */
export const editMessage = async (ctx: ChatContext, channel: IChatChannel, message: IChatMessage, rawText: unknown) => {
  if (String(message.author) !== ctx.userId) throw new ChatError('You can only edit your own messages', 403);
  if (message.deletedAt) throw new ChatError('Message not found', 404);
  const text = cleanText(rawText);
  const mentions = await mentionIdsFor(ctx, channel, text);
  const before = new Set(message.mentions.map(String));

  message.text = text;
  message.mentions = mentions.map(id => new mongoose.Types.ObjectId(id));
  message.editedAt = new Date();
  await message.save();

  const payload = serializeMessage(message, { _id: ctx.userId, name: ctx.userName, avatarUrl: ctx.userAvatar });
  await emitToRooms([rooms.channel(channel._id)], 'chat:message_updated', payload);
  await notifyMentioned(ctx, channel, mentions.filter(id => !before.has(id)), text);
  return payload;
};

/** Soft delete of the person's own message: the text is removed, the row stays as a tombstone. */
export const deleteMessage = async (ctx: ChatContext, channel: IChatChannel, message: IChatMessage) => {
  if (String(message.author) !== ctx.userId) throw new ChatError('You can only delete your own messages', 403);
  if (message.deletedAt) throw new ChatError('Message not found', 404);
  const deletedAt = new Date();
  // updateOne skips the "text required" validation on purpose: the text is erased
  await ChatMessage.updateOne({ _id: message._id }, { $set: { deletedAt, text: '', mentions: [] } });
  const payload = { _id: String(message._id), channel: String(channel._id), deletedAt };
  await emitToRooms([rooms.channel(channel._id)], 'chat:message_deleted', payload);
  return payload;
};

// ----------------------------------------------------------------
// Presence (online status)
// ----------------------------------------------------------------
const freshSince = () => new Date(Date.now() - CHAT_PRESENCE_TTL_SECONDS * 1000);
const oid = (value: Id) => new mongoose.Types.ObjectId(String(value));

/** A socket of `userId` connected on `instance`. */
export const presenceUp = async (workspaceIds: Id[], userId: Id, instance: string): Promise<void> => {
  const now = new Date();
  await Promise.all(workspaceIds.map(workspace => ChatPresence.updateOne(
    { workspace: oid(workspace), user: oid(userId), instance: { $eq: instance } },
    { $inc: { socketCount: 1 }, $set: { lastSeenAt: now } },
    { upsert: true },
  )));
};

/** A socket closed; the row goes away with the last one. */
export const presenceDown = async (workspaceIds: Id[], userId: Id, instance: string): Promise<void> => {
  await Promise.all(workspaceIds.map(async workspace => {
    const filter = { workspace: oid(workspace), user: oid(userId), instance: { $eq: instance } };
    await ChatPresence.updateOne(filter, { $inc: { socketCount: -1 }, $set: { lastSeenAt: new Date() } });
    await ChatPresence.deleteOne({ ...filter, socketCount: { $lte: 0 } });
  }));
};

/** Heartbeat for everything this instance holds, so only rows of dead instances expire. */
export const presenceTouch = async (instance: string): Promise<void> => {
  await ChatPresence.updateMany({ instance: { $eq: instance } }, { $set: { lastSeenAt: new Date() } });
};

/** Ids of members with at least one live socket in the workspace. */
export const onlineUserIds = async (workspaceId: Id): Promise<string[]> => {
  const users = await ChatPresence.distinct('user', {
    workspace: oid(workspaceId),
    socketCount: { $gt: 0 },
    lastSeenAt: { $gt: freshSince() },
  });
  return users.map(String);
};

export const isUserOnline = async (workspaceId: Id, userId: Id): Promise<boolean> =>
  Boolean(await ChatPresence.exists({
    workspace: oid(workspaceId),
    user: oid(userId),
    socketCount: { $gt: 0 },
    lastSeenAt: { $gt: freshSince() },
  }));
