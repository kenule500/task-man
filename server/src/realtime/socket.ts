import crypto from 'crypto';
import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server, type ServerOptions, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/mongo-adapter';
import { getConfig } from '../config/env.js';
import ChatChannel from '../models/chatChannelModel.js';
import Session from '../models/sessionModel.js';
import User from '../models/userModel.js';
import Workspace from '../models/workspaceModel.js';
import { API_TOKEN_PREFIX } from '../utils/apiTokens.js';
import {
  ChatError, findAccessibleChannel, isUserOnline, loadChatContext, postMessage, presenceDown, presenceTouch, presenceUp,
  type ChatContext,
} from '../utils/chatService.js';
import { hashToken } from '../utils/tokens.js';
import { eventsCollection, hasBackplane, rooms, setLocalServer } from './publish.js';
import { createSocketLimiter, createThrottle, isPlainObject } from './rateLimiter.js';

/** Where the browser reaches the socket server (one path for local dev and the Vercel function). */
// Exactly the Vercel function's path: requests to sub-paths are not routed to the function
export const SOCKET_PATH = '/api/socket';

// Budgets and caps (documented in SECURITY.md)
export const MAX_MESSAGES_PER_WINDOW = 10;
export const MESSAGE_WINDOW_MS = 10_000;
const MAX_EVENTS_PER_WINDOW = 60;
const TYPING_INTERVAL_MS = 2_000;
const MAX_SOCKETS_PER_USER = 10;
const MAX_JOINED_CHANNELS = 50;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_TOKEN_LENGTH = 2048;
const SWEEP_INTERVAL_MS = 30_000;

export interface ChatServerOptions {
  /** Engine.IO path; the client must use the same one. */
  path?: string;
  /** Resolves when the database (and roles) are ready; sockets wait for it before authenticating. */
  ready?: () => Promise<void>;
  /** Heartbeat and membership re-check interval. */
  sweepIntervalMs?: number;
}

interface SocketData {
  userId: string;
  name: string;
  tokenHash: string;
  workspaces: string[];
  channels: Map<string, string>;
}

const dataOf = (socket: Socket): SocketData => socket.data as SocketData;

type Ack = (response: { ok: boolean; [key: string]: unknown }) => void;

const reply = (ack: unknown, response: { ok: boolean; [key: string]: unknown }): void => {
  if (typeof ack === 'function') (ack as Ack)(response);
};

const memberWorkspaceIds = async (userId: string): Promise<string[]> => {
  const workspaces = await Workspace.find({ 'members.user': new mongoose.Types.ObjectId(userId) }).select('_id').lean();
  return workspaces.map(workspace => String(workspace._id));
};

/**
 * Socket.IO server for team chat. Clients authenticate with their session JWT in `auth.token` (checked
 * like `protect`: signature plus a valid database session; personal API tokens are refused). Every socket
 * joins `user:<id>` and `ws:<workspaceId>` for each workspace it belongs to, and `channel:<id>` through
 * `chat:join` after an access check. Several server instances share events through MongoDB when the
 * database is a replica set (@socket.io/mongo-adapter).
 */
export const createChatServer = (httpServer: HttpServer, options: ChatServerOptions = {}): Server => {
  const config = getConfig();
  const instance = crypto.randomUUID();
  const origins = config.corsOrigins.filter(origin => origin !== '*');

  const io = new Server(httpServer, {
    path: options.path ?? SOCKET_PATH,
    // No trailing slash: the client connects to /api/socket?EIO=4… which the function receives as is
    addTrailingSlash: false,
    // Vercel Functions accept WebSocket upgrades only (no long-polling)
    transports: ['websocket'] as ServerOptions['transports'],
    serveClient: false,
    maxHttpBufferSize: MAX_PAYLOAD_BYTES,
    connectTimeout: 10_000,
    cors: { origin: origins },
  });
  setLocalServer(io);

  const backplane = (async () => {
    try {
      await options.ready?.();
      if (await hasBackplane()) {
        // The adapter wants the native driver collection; mongoose bundles a compatible driver
        io.adapter(createAdapter((await eventsCollection()) as never, { addCreatedAtField: true }));
      }
    } catch (error) {
      console.error('realtime backplane error:', (error as Error).message);
    }
  })();

  // ---------------------------------------------------------------
  // Authentication (same checks as the protect middleware)
  // ---------------------------------------------------------------
  io.use(async (socket, next) => {
    try {
      await backplane;
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH || token.startsWith(API_TOKEN_PREFIX)) {
        next(new Error('unauthorized'));
        return;
      }
      const decoded = jwt.verify(token, config.jwtSecret) as { id?: string };
      const tokenHash = hashToken(token);
      const session = await Session.findOne({ token: tokenHash, isValid: true }).select('_id').lean();
      const user = session && decoded.id && mongoose.isValidObjectId(decoded.id)
        ? await User.findById(decoded.id).select('name').lean()
        : null;
      if (!user) {
        next(new Error('unauthorized'));
        return;
      }
      const userId = String(user._id);
      if ((io.sockets.adapter.rooms.get(rooms.user(userId))?.size ?? 0) >= MAX_SOCKETS_PER_USER) {
        next(new Error('too many connections'));
        return;
      }
      socket.data = { userId, name: user.name, tokenHash, workspaces: [], channels: new Map() } satisfies SocketData;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  const announcePresence = async (workspaceIds: string[], userId: string): Promise<void> => {
    await Promise.all(workspaceIds.map(async workspace => {
      io.to(rooms.workspace(workspace)).emit('presence:update', { workspace, userId, online: await isUserOnline(workspace, userId) });
    }));
  };

  /** Channel and context for an event; null when the channel is missing or off limits. */
  const contextFor = async (socket: Socket, channelId: unknown): Promise<{ ctx: ChatContext; channel: NonNullable<Awaited<ReturnType<typeof findAccessibleChannel>>> } | null> => {
    if (typeof channelId !== 'string' || !mongoose.isValidObjectId(channelId)) return null;
    const raw = await ChatChannel.findById(channelId).select('workspace').lean();
    if (!raw) return null;
    const ctx = await loadChatContext(dataOf(socket).userId, raw.workspace);
    if (!ctx) return null;
    const channel = await findAccessibleChannel(ctx, channelId);
    return channel ? { ctx, channel } : null;
  };

  // ---------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------
  io.on('connection', socket => {
    const data = dataOf(socket);
    const events = createSocketLimiter(MAX_EVENTS_PER_WINDOW, MESSAGE_WINDOW_MS);
    const sends = createSocketLimiter(MAX_MESSAGES_PER_WINDOW, MESSAGE_WINDOW_MS);
    const typing = createThrottle(TYPING_INTERVAL_MS);

    /** Wraps a handler with the event budget, payload shape check and error containment. */
    const on = (event: string, handler: (payload: Record<string, unknown>, ack: unknown) => Promise<void>): void => {
      socket.on(event, async (payload: unknown, ack: unknown) => {
        if (!events.allow()) {
          reply(ack, { ok: false, error: 'rate_limited' });
          return;
        }
        if (!isPlainObject(payload)) {
          reply(ack, { ok: false, error: 'invalid_payload' });
          return;
        }
        try {
          await handler(payload, ack);
        } catch (error) {
          if (!(error instanceof ChatError)) console.error(`socket ${event} error:`, (error as Error).message);
          reply(ack, { ok: false, error: error instanceof ChatError ? error.message : 'server_error' });
        }
      });
    };

    on('chat:join', async (payload, ack) => {
      if (data.channels.size >= MAX_JOINED_CHANNELS && !data.channels.has(String(payload.channelId))) {
        reply(ack, { ok: false, error: 'too_many_channels' });
        return;
      }
      const found = await contextFor(socket, payload.channelId);
      if (!found) {
        reply(ack, { ok: false, error: 'not_found' });
        return;
      }
      data.channels.set(String(found.channel._id), String(found.channel.workspace));
      await socket.join(rooms.channel(found.channel._id));
      reply(ack, { ok: true });
    });

    on('chat:leave', async (payload, ack) => {
      const id = String(payload.channelId);
      data.channels.delete(id);
      await socket.leave(rooms.channel(id));
      reply(ack, { ok: true });
    });

    on('chat:typing', async payload => {
      const id = String(payload.channelId);
      // Only people who joined the channel can be heard in it
      if (!data.channels.has(id) || !typing(id)) return;
      socket.to(rooms.channel(id)).volatile.emit('chat:typing', { channelId: id, user: { _id: data.userId, name: data.name } });
    });

    on('chat:send', async (payload, ack) => {
      if (!sends.allow()) {
        reply(ack, { ok: false, error: 'rate_limited' });
        return;
      }
      const found = await contextFor(socket, payload.channelId);
      if (!found) {
        reply(ack, { ok: false, error: 'not_found' });
        return;
      }
      reply(ack, { ok: true, message: await postMessage(found.ctx, found.channel, payload.text) });
    });

    socket.on('disconnect', () => {
      const workspaces = data.workspaces;
      presenceDown(workspaces, data.userId, instance)
        .then(() => announcePresence(workspaces, data.userId))
        .catch(error => console.error('presence down error:', (error as Error).message));
    });

    // Rooms and presence come after the handlers are in place, so early events are not lost
    (async () => {
      const workspaces = await memberWorkspaceIds(data.userId);
      data.workspaces = workspaces;
      await socket.join([rooms.user(data.userId), ...workspaces.map(rooms.workspace)]);
      await presenceUp(workspaces, data.userId, instance);
      // Closed while setting up: the disconnect handler may have run before the count went up
      if (socket.disconnected) await presenceDown(workspaces, data.userId, instance);
      await announcePresence(workspaces, data.userId);
      socket.emit('chat:ready', { workspaces });
    })().catch(error => {
      console.error('socket setup error:', (error as Error).message);
      socket.disconnect(true);
    });
  });

  // ---------------------------------------------------------------
  // Heartbeat: keep presence fresh and drop access that was revoked
  // (sign-out of the session, removal from a workspace, a private channel changing)
  // ---------------------------------------------------------------
  const sweep = async (): Promise<void> => {
    await presenceTouch(instance);
    const contexts = new Map<string, Promise<ChatContext | null>>();
    for (const socket of io.sockets.sockets.values()) {
      const data = dataOf(socket);
      if (!data?.userId) continue;
      if (!(await Session.exists({ token: data.tokenHash, isValid: true }))) {
        socket.disconnect(true);
        continue;
      }
      const current = new Set(await memberWorkspaceIds(data.userId));
      for (const workspace of data.workspaces) {
        if (!current.has(workspace)) await socket.leave(rooms.workspace(workspace));
      }
      for (const workspace of current) {
        if (!data.workspaces.includes(workspace)) await socket.join(rooms.workspace(workspace));
      }
      data.workspaces = [...current];

      for (const [channelId, workspace] of [...data.channels]) {
        const key = `${data.userId}:${workspace}`;
        if (!contexts.has(key)) contexts.set(key, loadChatContext(data.userId, workspace));
        const ctx = await contexts.get(key);
        if (!ctx || !(await findAccessibleChannel(ctx, channelId))) {
          data.channels.delete(channelId);
          await socket.leave(rooms.channel(channelId));
        }
      }
    }
  };
  const timer = setInterval(() => {
    sweep().catch(error => console.error('socket sweep error:', (error as Error).message));
  }, options.sweepIntervalMs ?? SWEEP_INTERVAL_MS);
  timer.unref();
  httpServer.once('close', () => {
    clearInterval(timer);
    setLocalServer(null);
  });

  return io;
};
