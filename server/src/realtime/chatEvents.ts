import mongoose from 'mongoose';
import type { Server, Socket } from 'socket.io';
import ChatChannel, { IChatChannel } from '../models/chatChannelModel.js';
import Project from '../models/projectModel.js';
import { createMessageInChannel, messageView } from '../controllers/chatMessageController.js';
import { decideChannelAccess } from '../utils/chatAccess.js';
import { parseMessageInput } from '../utils/chatValidation.js';
import { channelRoom } from './bus.js';
import { contextOf, type SocketContext } from './socket.js';

// A single connection may emit at most this many events per window; the HTTP limiter cannot see socket traffic
const THROTTLE_WINDOW_MS = 10_000;
const THROTTLE_MAX_EVENTS = 40;

const buckets = new WeakMap<Socket, number[]>();

const allowEvent = (socket: Socket): boolean => {
  const now = Date.now();
  const recent = (buckets.get(socket) ?? []).filter(at => now - at < THROTTLE_WINDOW_MS);
  if (recent.length >= THROTTLE_MAX_EVENTS) {
    buckets.set(socket, recent);
    return false;
  }
  recent.push(now);
  buckets.set(socket, recent);
  return true;
};

/** Loads the channel if the connected member may use it; a direct channel they are not part of is refused. */
const resolveChannel = async (
  ctx: SocketContext,
  rawChannelId: unknown,
  requireWrite: boolean,
): Promise<IChatChannel | null> => {
  const channelId = typeof rawChannelId === 'string' ? rawChannelId : '';
  if (!mongoose.isValidObjectId(channelId)) return null;

  const channel = await ChatChannel.findOne({ _id: channelId, workspace: ctx.workspaceId });
  if (!channel) return null;

  // A project channel is readable by its project's members, which the socket path must check just as
  // the HTTP controllers do; otherwise a member's socket never joins the room (spec FR-037, AC-063).
  let isProjectMember: boolean | undefined;
  if (channel.kind === 'project' && !ctx.permissions.includes('chat:moderate')) {
    isProjectMember = Boolean(await Project.exists({ _id: channel.project, members: ctx.userId }));
  }

  const decision = decideChannelAccess({
    channel,
    userId: ctx.userId,
    permissions: ctx.permissions,
    requireWrite,
    isProjectMember,
  });

  return decision === 'allow' ? channel : null;
};

type Ack = (response: { ok: boolean; error?: string; message?: unknown; joined?: number }) => void;

// One join may subscribe a member to a whole panel; the cap keeps a crafted payload from being a
// cheap way to make the server run thousands of access checks.
const MAX_JOIN_CHANNELS = 200;

export const registerChatEvents = (_io: Server, socket: Socket): void => {
  const ctx = contextOf(socket);

  // Accepts one channel or a list: the client subscribes to every conversation so a background row
  // can refresh without a reload (spec AC-063). Access is decided here, once per requested channel.
  socket.on('chat:join', async (
    payload: { channelId?: unknown; channelIds?: unknown } | undefined,
    ack?: Ack,
  ) => {
    if (!allowEvent(socket)) return ack?.({ ok: false, error: 'Too many requests' });

    const requested = Array.isArray(payload?.channelIds) ? payload.channelIds : [payload?.channelId];
    const ids = requested
      .filter((id): id is string => typeof id === 'string' && mongoose.isValidObjectId(id))
      .slice(0, MAX_JOIN_CHANNELS);
    if (ids.length === 0) return ack?.({ ok: false, error: 'Channel not found' });

    const channels = await ChatChannel.find({ _id: { $in: ids }, workspace: ctx.workspaceId }).lean();
    const projectIds = channels
      .filter(channel => channel.kind === 'project' && channel.project)
      .map(channel => channel.project as mongoose.Types.ObjectId);
    const memberProjects = projectIds.length === 0
      ? []
      : await Project.find({ _id: { $in: projectIds }, members: ctx.userId }).select('_id').lean();
    const memberProjectIds = new Set(memberProjects.map(project => String(project._id)));

    const allowed = channels.filter(channel => decideChannelAccess({
      channel,
      userId: ctx.userId,
      permissions: ctx.permissions,
      isProjectMember: channel.project ? memberProjectIds.has(String(channel.project)) : undefined,
    }) === 'allow');

    await Promise.all(allowed.map(channel => socket.join(channelRoom(String(channel._id)))));
    ack?.({ ok: true, joined: allowed.length });
  });

  socket.on('chat:leave', async (payload: { channelId?: string } | undefined, ack?: Ack) => {
    const channelId = typeof payload?.channelId === 'string' ? payload.channelId : '';
    if (mongoose.isValidObjectId(channelId)) await socket.leave(channelRoom(channelId));
    ack?.({ ok: true });
  });

  socket.on('chat:typing', async (payload: { channelId?: string } | undefined) => {
    if (!allowEvent(socket)) return;
    const channel = await resolveChannel(ctx, payload?.channelId, false);
    if (!channel) return;
    // Ephemeral: never stored, and not echoed back to the person typing
    socket.to(channelRoom(String(channel._id))).emit('chat:typing', {
      channelId: String(channel._id),
      userId: ctx.userId,
    });
  });

  socket.on('chat:send', async (payload: unknown, ack?: Ack) => {
    if (!allowEvent(socket)) return ack?.({ ok: false, error: 'Too many requests' });

    // The payload is validated with the same rules the REST fallback uses
    const parsed = parseMessageInput(payload);
    if (!parsed.ok) return ack?.({ ok: false, error: parsed.error });

    const raw = (payload ?? {}) as { channelId?: unknown };
    const channel = await resolveChannel(ctx, raw.channelId, true);
    if (!channel) return ack?.({ ok: false, error: 'You cannot post in this channel' });

    try {
      const message = await createMessageInChannel({
        workspaceId: new mongoose.Types.ObjectId(ctx.workspaceId),
        channel,
        authorId: new mongoose.Types.ObjectId(ctx.userId),
        input: parsed.value,
        exceptSocketId: socket.id,
      });
      ack?.({ ok: true, message: messageView(message.toObject() as unknown as Record<string, unknown>) });
    } catch (error) {
      ack?.({ ok: false, error: error instanceof Error ? error.message : 'Could not send the message' });
    }
  });
};
