import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';
import ChatChannel, { IChatChannel } from '../models/chatChannelModel.js';
import ChatMessage, { ChatAttachment, IChatMessage, MAX_MESSAGE_BODY } from '../models/chatMessageModel.js';
import ChatReaction, { MAX_EMOJI_LENGTH } from '../models/chatReactionModel.js';
import ChatRead from '../models/chatReadModel.js';
import Notification from '../models/notificationModel.js';
import Workspace from '../models/workspaceModel.js';
import { emitToChannel, emitToChannelExcept, emitToUser } from '../realtime/bus.js';
import { recordActivity } from '../utils/activity.js';
import { canModerate } from '../utils/chatAccess.js';
import { snippetOf, uniqueIds } from '../utils/chatMentions.js';
import { clampPageSize, decodeMessageCursor, encodeMessageCursor, olderThanCursor, searchFilter } from '../utils/chatQuery.js';
import { MessageInput, parseMessageInput } from '../utils/chatValidation.js';
import { deleteFiles, fileInfoOf, openFileStream, saveFile } from '../utils/gridfs.js';
import { loadChannelForCaller, permissionsOf, workspaceIdOf } from './chatChannelController.js';
import { handleError, hasValidationErrors, PUBLIC_USER_FIELDS } from './taskController.js';

export class ChatRuleError extends Error {}

/** Deleted messages keep their row but lose their content. */
export const messageView = (message: Record<string, unknown>) => {
  if (!message.deletedAt) return message;
  return { ...message, body: '', attachments: [] };
};

/**
 * Populates the author and shapes the message, so every emit carries the same name and avatar that
 * `chat:message` already sends (FR-091, AC-094). `messageView` stays the only place a message is
 * shaped; this only makes sure the author is loaded before that happens.
 */
const messageViewWithAuthor = async (message: IChatMessage): Promise<Record<string, unknown>> => {
  await message.populate('author', PUBLIC_USER_FIELDS);
  return messageView(message.toObject() as unknown as Record<string, unknown>);
};

const objectId = (value: unknown) => new mongoose.Types.ObjectId(String(value));

/** Keeps only the mentioned ids that are actually members of this workspace. */
const resolveMentions = async (workspaceId: mongoose.Types.ObjectId, ids: string[]): Promise<mongoose.Types.ObjectId[]> => {
  if (ids.length === 0) return [];
  const workspace = await Workspace.findOne({ _id: workspaceId, 'members.user': { $in: ids.map(objectId) } })
    .select('members.user')
    .lean();
  const members = new Set((workspace?.members ?? []).map(member => String(member.user)));
  return uniqueIds(ids).filter(id => members.has(id)).map(objectId);
};

/**
 * Notifies mentioned members through the existing in-app notification store and the socket room,
 * rather than inventing a second notification mechanism.
 */
const notifyMentions = async ({
  workspaceId, channel, message, actorId, mentioned,
}: {
  workspaceId: mongoose.Types.ObjectId;
  channel: IChatChannel;
  message: IChatMessage;
  actorId: mongoose.Types.ObjectId;
  mentioned: mongoose.Types.ObjectId[];
}): Promise<void> => {
  const recipients = mentioned.filter(id => String(id) !== String(actorId));
  if (recipients.length === 0) return;

  try {
    const rows = await Notification.insertMany(recipients.map(user => ({
      user,
      workspace: workspaceId,
      actor: actorId,
      type: 'chat.mention',
      channel: channel._id,
      message: message._id,
      summary: snippetOf(message.body) || 'Mentioned you in a channel',
    })));
    rows.forEach(row => emitToUser(String(row.user), 'chat:notified', { channelId: String(channel._id) }));
  } catch (error) {
    // A notification failure must not lose the message that was already stored
    console.error('chat mention notify error:', (error as Error).message);
  }
};

export interface CreateMessageArgs {
  workspaceId: mongoose.Types.ObjectId;
  channel: IChatChannel;
  authorId: mongoose.Types.ObjectId;
  input: MessageInput;
  // The sender's own connection, excluded so their message is not echoed back twice
  exceptSocketId?: string;
}

/**
 * Persists a message and only then broadcasts it, so a client never sees a message that was not stored.
 * Shared by the REST fallback and the socket handler: authorisation has one implementation.
 */
export const createMessageInChannel = async ({
  workspaceId, channel, authorId, input, exceptSocketId,
}: CreateMessageArgs): Promise<IChatMessage> => {
  let parentId: mongoose.Types.ObjectId | null = null;
  if (input.parentId) {
    const parent = await ChatMessage.findOne({
      _id: input.parentId,
      workspace: workspaceId,
      channel: channel._id,
      deletedAt: null,
    }).select('_id');
    if (!parent) throw new ChatRuleError('The message you are replying to no longer exists');
    parentId = parent._id as mongoose.Types.ObjectId;
  }

  const mentions = await resolveMentions(workspaceId, input.mentionIds);

  // Attachments must have been uploaded to this channel, so a message cannot borrow another
  // channel's file and expose it to readers who could not otherwise see it
  const attachments: ChatAttachment[] = [];
  for (const attachmentId of input.attachmentIds) {
    const info = await fileInfoOf(attachmentId);
    if (info && info.channel === String(channel._id)) {
      attachments.push({ id: info.id, name: info.name, size: info.size, type: info.type });
    }
  }

  const message = await ChatMessage.create({
    workspace: workspaceId,
    channel: channel._id,
    author: authorId,
    body: input.body,
    parent: parentId,
    mentions,
    attachments,
  });

  // Keep the channel's ordering pointer current so the list never scans messages
  await ChatChannel.updateOne(
    { _id: channel._id },
    { $set: { lastMessageAt: message.createdAt, lastMessageAuthor: authorId } },
  );

  // The client renders the author's name and avatar, so they travel with the message
  await message.populate('author', PUBLIC_USER_FIELDS);

  if (parentId) {
    await ChatMessage.updateOne(
      { _id: parentId },
      { $inc: { replyCount: 1 }, $set: { lastReplyAuthor: authorId } },
    );
  }

  const view = messageView(message.toObject() as unknown as Record<string, unknown>);
  if (exceptSocketId) {
    emitToChannelExcept(String(channel._id), exceptSocketId, 'chat:message', view);
  } else {
    emitToChannel(String(channel._id), 'chat:message', view);
  }

  await notifyMentions({ workspaceId, channel, message, actorId: authorId, mentioned: mentions });

  return message;
};

const reactionSummary = async (messageId: mongoose.Types.ObjectId) => {
  const rows = await ChatReaction.aggregate<{ _id: string; count: number; users: mongoose.Types.ObjectId[] }>([
    { $match: { message: messageId } },
    { $group: { _id: '$emoji', count: { $sum: 1 }, users: { $addToSet: '$user' } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  return rows.map(row => ({ emoji: row._id, count: row.count, users: row.users.map(String) }));
};

/** Loads a message inside a readable channel; replies to it are checked against the same channel. */
const loadMessage = async (req: Request, requireWrite: boolean) => {
  const lookup = await loadChannelForCaller(req, requireWrite);
  if (!lookup.ok) return lookup;

  const messageId = String(req.params.messageId ?? '');
  if (!mongoose.isValidObjectId(messageId)) {
    return { ok: false as const, failure: { status: 404, message: 'Message not found' } };
  }

  const message = await ChatMessage.findOne({
    _id: messageId,
    workspace: lookup.channel.workspace,
    channel: lookup.channel._id,
  });
  if (!message) return { ok: false as const, failure: { status: 404, message: 'Message not found' } };

  return { ok: true as const, channel: lookup.channel, message };
};

// ---------------------------------------------------------------- validation

export const validateSendMessage = [
  body('body').optional().isString().withMessage('Message text must be a string'),
  body('parentId').optional({ nullable: true })
    .custom(value => value === null || mongoose.isValidObjectId(String(value)))
    .withMessage('Invalid parent message'),
  body('attachmentIds').optional().isArray({ max: 10 }).withMessage('Too many attachments'),  body('mentionIds').optional().isArray({ max: 20 }).withMessage('Too many mentions'),
];

export const validateListMessages = [
  query('before').optional().isString().isLength({ max: 40 }).withMessage('Invalid cursor'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
];

export const validateEditMessage = [
  body('body').isString().trim().isLength({ min: 1, max: MAX_MESSAGE_BODY })
    .withMessage(`Messages are limited to ${MAX_MESSAGE_BODY} characters`),
];

export const validateReaction = [
  body('emoji').isString().trim().isLength({ min: 1, max: MAX_EMOJI_LENGTH }).withMessage('Invalid emoji'),
  param('emoji').optional().isString().isLength({ min: 1, max: MAX_EMOJI_LENGTH }).withMessage('Invalid emoji'),
];

export const validateSearch = [
  query('q').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Enter something to search for'),
  query('before').optional().isString().isLength({ max: 40 }).withMessage('Invalid cursor'),
];

export const validateMarkRead = [
  body('messageId').optional({ nullable: true })
    .custom(value => value === null || mongoose.isValidObjectId(String(value)))
    .withMessage('Invalid message'),
];

// ---------------------------------------------------------------- handlers

/**
 * @desc    One page of a channel's top-level messages, newest first
 * @route   GET /api/workspaces/:slug/chat/:channelId/messages
 */
export const listMessages = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const lookup = await loadChannelForCaller(req);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }

    const { channel } = lookup;
    const limit = clampPageSize(req.query.limit);
    const cursor = req.query.before ? decodeMessageCursor(req.query.before) : null;
    if (req.query.before && !cursor) {
      res.status(400).json({ message: 'Invalid cursor' });
      return;
    }

    // The channel shows top-level messages; replies live in their thread
    const rows = await ChatMessage.find({
      workspace: channel.workspace,
      channel: channel._id,
      parent: null,
      ...(cursor ? olderThanCursor(cursor) : {}),
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .select('-workspace -__v')
      .populate('author', PUBLIC_USER_FIELDS)
      .lean();

    const hasMore = rows.length > limit;
    const messages = hasMore ? rows.slice(0, limit) : rows;
    const last = messages[messages.length - 1];

    res.status(200).json({
      messages: messages.map(row => messageView(row as unknown as Record<string, unknown>)),
      nextCursor: hasMore && last ? encodeMessageCursor(last as unknown as { createdAt: Date; _id: unknown }) : null,
    });
  } catch (error) {
    handleError(res, error, 'listMessages');
  }
};

/**
 * @desc    Replies of one message, oldest first
 * @route   GET /api/workspaces/:slug/chat/:channelId/messages/:messageId/replies
 */
export const listReplies = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await loadMessage(req, false);
    if (!found.ok) {
      res.status(found.failure.status).json({ message: found.failure.message });
      return;
    }

    const rows = await ChatMessage.find({
      workspace: found.channel.workspace,
      channel: found.channel._id,
      parent: found.message._id,
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(200)
      .select('-workspace -__v')
      .populate('author', PUBLIC_USER_FIELDS)
      .lean();

    res.status(200).json({
      replies: rows.map(row => messageView(row as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    handleError(res, error, 'listReplies');
  }
};

/**
 * @desc    Send a message over HTTP, used when no socket is available and by API clients
 * @route   POST /api/workspaces/:slug/chat/:channelId/messages
 */
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const lookup = await loadChannelForCaller(req, true);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }

    const parsed = parseMessageInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.error });
      return;
    }

    const message = await createMessageInChannel({
      workspaceId: workspaceIdOf(req),
      channel: lookup.channel,
      authorId: objectId(req.user?._id),
      input: parsed.value,
    });

    res.status(201).json(messageView(message.toObject() as unknown as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ChatRuleError) {
      res.status(400).json({ message: error.message });
      return;
    }
    handleError(res, error, 'sendMessage');
  }
};

/**
 * @desc    Edit your own message
 * @route   PATCH /api/workspaces/:slug/chat/:channelId/messages/:messageId
 */
export const editMessage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const found = await loadMessage(req, true);
    if (!found.ok) {
      res.status(found.failure.status).json({ message: found.failure.message });
      return;
    }

    if (String(found.message.author) !== String(req.user?._id)) {
      res.status(403).json({ message: 'You can only edit your own messages' });
      return;
    }
    if (found.message.deletedAt) {
      res.status(400).json({ message: 'This message was deleted' });
      return;
    }

    found.message.body = String(req.body.body).trim();
    found.message.editedAt = new Date();
    await found.message.save();

    const view = await messageViewWithAuthor(found.message);
    emitToChannel(String(found.channel._id), 'chat:updated', view);

    res.status(200).json(view);
  } catch (error) {
    handleError(res, error, 'editMessage');
  }
};

/**
 * @desc    Delete a message (author, or a moderator deleting anyone's)
 * @route   DELETE /api/workspaces/:slug/chat/:channelId/messages/:messageId
 */
export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const lookup = await loadChannelForCaller(req);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }

    const messageId = String(req.params.messageId ?? '');
    if (!mongoose.isValidObjectId(messageId)) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    const message = await ChatMessage.findOne({
      _id: messageId,
      workspace: lookup.channel.workspace,
      channel: lookup.channel._id,
    });
    if (!message) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    const isAuthor = String(message.author) === String(req.user?._id);
    const moderator = canModerate(permissionsOf(req));
    if (!isAuthor && !moderator) {
      res.status(403).json({ message: 'You can only delete your own messages' });
      return;
    }

    const fileIds = message.attachments.map(attachment => attachment.id);
    message.deletedAt = new Date();
    message.body = '';
    message.attachments = [];
    message.mentions = [];
    await message.save();
    await deleteFiles(fileIds);

    if (!isAuthor) {
      await recordActivity(req, {
        action: 'chat.message_deleted',
        summary: snippetOf(String(req.body?.reason ?? 'Message removed by a moderator')),
      });
    }

    const view = messageView(message.toObject() as unknown as Record<string, unknown>);
    emitToChannel(String(lookup.channel._id), 'chat:deleted', view);

    res.status(200).json(view);
  } catch (error) {
    handleError(res, error, 'deleteMessage');
  }
};

/**
 * @desc    Toggle a reaction on a message
 * @route   POST /api/workspaces/:slug/chat/:channelId/messages/:messageId/reactions
 */
export const toggleReaction = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const found = await loadMessage(req, true);
    if (!found.ok) {
      res.status(found.failure.status).json({ message: found.failure.message });
      return;
    }

    const emoji = String(req.body.emoji).trim();
    const userId = objectId(req.user?._id);

    const existing = await ChatReaction.findOne({ message: found.message._id, user: userId, emoji });
    if (existing) {
      await existing.deleteOne();
    } else {
      await ChatReaction.create({
        workspace: found.channel.workspace,
        message: found.message._id,
        user: userId,
        emoji,
      });
    }

    const reactions = await reactionSummary(found.message._id as mongoose.Types.ObjectId);
    // The channel is included so a client listening to several conversations can ignore other rooms
    const payload = { channelId: String(found.channel._id), messageId: String(found.message._id), reactions };
    emitToChannel(String(found.channel._id), 'chat:reaction', payload);

    res.status(200).json(payload);
  } catch (error) {
    handleError(res, error, 'toggleReaction');
  }
};

/**
 * @desc    Remove one of your reactions
 * @route   DELETE /api/workspaces/:slug/chat/:channelId/messages/:messageId/reactions/:emoji
 */
export const removeReaction = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const found = await loadMessage(req, true);
    if (!found.ok) {
      res.status(found.failure.status).json({ message: found.failure.message });
      return;
    }

    await ChatReaction.deleteOne({
      message: found.message._id,
      user: objectId(req.user?._id),
      emoji: String(req.params.emoji),
    });

    const reactions = await reactionSummary(found.message._id as mongoose.Types.ObjectId);
    const payload = { channelId: String(found.channel._id), messageId: String(found.message._id), reactions };
    emitToChannel(String(found.channel._id), 'chat:reaction', payload);

    res.status(200).json(payload);
  } catch (error) {
    handleError(res, error, 'removeReaction');
  }
};

/**
 * @desc    Pin a message
 * @route   POST /api/workspaces/:slug/chat/:channelId/messages/:messageId/pin
 */
export const pinMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await loadMessage(req, true);
    if (!found.ok) {
      res.status(found.failure.status).json({ message: found.failure.message });
      return;
    }

    found.message.pinnedAt = new Date();
    found.message.pinnedBy = objectId(req.user?._id);
    await found.message.save();

    const view = await messageViewWithAuthor(found.message);
    emitToChannel(String(found.channel._id), 'chat:updated', view);
    res.status(200).json(view);
  } catch (error) {
    handleError(res, error, 'pinMessage');
  }
};

/**
 * @desc    Unpin a message
 * @route   DELETE /api/workspaces/:slug/chat/:channelId/messages/:messageId/pin
 */
export const unpinMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await loadMessage(req, true);
    if (!found.ok) {
      res.status(found.failure.status).json({ message: found.failure.message });
      return;
    }

    found.message.pinnedAt = null;
    found.message.pinnedBy = null;
    await found.message.save();

    const view = await messageViewWithAuthor(found.message);
    emitToChannel(String(found.channel._id), 'chat:updated', view);
    res.status(200).json(view);
  } catch (error) {
    handleError(res, error, 'unpinMessage');
  }
};

/**
 * @desc    Pinned messages of a channel, most recently pinned first
 * @route   GET /api/workspaces/:slug/chat/:channelId/pins
 */
export const listPinned = async (req: Request, res: Response): Promise<void> => {
  try {
    const lookup = await loadChannelForCaller(req);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }

    const rows = await ChatMessage.find({
      workspace: lookup.channel.workspace,
      channel: lookup.channel._id,
      pinnedAt: { $ne: null },
      deletedAt: null,
    })
      .sort({ pinnedAt: -1 })
      .limit(50)
      .select('-workspace -__v')
      .populate('author', PUBLIC_USER_FIELDS)
      .lean();

    res.status(200).json({ pinned: rows });
  } catch (error) {
    handleError(res, error, 'listPinned');
  }
};

/**
 * @desc    Search this channel's messages
 * @route   GET /api/workspaces/:slug/chat/:channelId/search
 */
export const searchMessages = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const lookup = await loadChannelForCaller(req);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }

    const cursor = req.query.before ? decodeMessageCursor(req.query.before) : null;
    if (req.query.before && !cursor) {
      res.status(400).json({ message: 'Invalid cursor' });
      return;
    }

    const limit = 20;
    const rows = await ChatMessage.find({
      workspace: lookup.channel.workspace,
      channel: lookup.channel._id,
      ...searchFilter(String(req.query.q)),
      // The find widget navigates the conversation body, so a thread reply (which is only rendered
      // inside its thread panel) would produce a result that cannot be jumped to
      parent: null,
      ...(cursor ? olderThanCursor(cursor) : {}),
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .select('-workspace -__v')
      .populate('author', PUBLIC_USER_FIELDS)
      .lean();

    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const last = results[results.length - 1];

    res.status(200).json({
      results: results.map(row => messageView(row as unknown as Record<string, unknown>)),
      nextCursor: hasMore && last ? encodeMessageCursor(last as unknown as { createdAt: Date; _id: unknown }) : null,
    });
  } catch (error) {
    handleError(res, error, 'searchMessages');
  }
};

/**
 * @desc    Mark a channel as read up to now
 * @route   POST /api/workspaces/:slug/chat/:channelId/read
 */
export const markRead = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const lookup = await loadChannelForCaller(req);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }

    const lastReadMessage = req.body?.messageId ? objectId(req.body.messageId) : null;
    await ChatRead.updateOne(
      { channel: lookup.channel._id, user: objectId(req.user?._id) },
      {
        $set: { lastReadAt: new Date(), lastReadMessage },
        $setOnInsert: { workspace: lookup.channel.workspace, channel: lookup.channel._id, user: objectId(req.user?._id) },
      },
      { upsert: true },
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    handleError(res, error, 'markRead');
  }
};

/**
 * @desc    Store one uploaded file; the id is attached to a message when it is sent
 * @route   POST /api/workspaces/:slug/chat/:channelId/attachments
 */
export const uploadAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const lookup = await loadChannelForCaller(req, true);
    if (!lookup.ok) {
      res.status(lookup.failure.status).json({ message: lookup.failure.message });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file received' });
      return;
    }

    // The channel id travels with the file so a message cannot attach another channel's upload
    const fileId = await saveFile(file.buffer, file.originalname, file.mimetype, {
      channel: String(lookup.channel._id),
    });
    res.status(201).json({
      attachment: {
        id: String(fileId),
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
      },
    });
  } catch (error) {
    handleError(res, error, 'uploadAttachment');
  }
};

/**
 * @desc    Download an attachment of a message the caller may read
 * @route   GET /api/workspaces/:slug/chat/attachments/:attachmentId
 */
export const downloadAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const attachmentId = String(req.params.attachmentId ?? '');
    if (!mongoose.isValidObjectId(attachmentId)) {
      res.status(404).json({ message: 'Attachment not found' });
      return;
    }

    // The attachment is reachable only through a message the caller is allowed to read
    const message = await ChatMessage.findOne({
      workspace: workspaceIdOf(req),
      'attachments.id': attachmentId,
    }).select('channel attachments');

    if (!message) {
      res.status(404).json({ message: 'Attachment not found' });
      return;
    }

    const channel = await ChatChannel.findOne({ _id: message.channel, workspace: workspaceIdOf(req) });
    if (!channel) {
      res.status(404).json({ message: 'Attachment not found' });
      return;
    }

    const { decideChannelAccess } = await import('../utils/chatAccess.js');
    const decision = decideChannelAccess({ channel, userId: String(req.user?._id), permissions: permissionsOf(req) });
    if (decision !== 'allow') {
      res.status(404).json({ message: 'Attachment not found' });
      return;
    }

    const attachment = message.attachments.find(item => String(item.id) === attachmentId);
    res.setHeader('Content-Type', attachment?.type ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${(attachment?.name ?? 'file').replace(/"/g, '')}"`);

    const stream = openFileStream(attachmentId);
    stream.once('error', () => {
      if (!res.headersSent) res.status(404).json({ message: 'Attachment not found' });
    });
    stream.pipe(res);
  } catch (error) {
    handleError(res, error, 'downloadAttachment');
  }
};
