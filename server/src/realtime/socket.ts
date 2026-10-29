import type { Server as HttpServer } from 'node:http';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { getConfig } from '../config/env.js';
import ChatPresence from '../models/chatPresenceModel.js';
import Role from '../models/roleModel.js';
import Session from '../models/sessionModel.js';
import User from '../models/userModel.js';
import Workspace from '../models/workspaceModel.js';
import { hashToken } from '../utils/tokens.js';
import { isAllowedOrigin } from '../utils/corsOrigins.js';
import { attachBus, auditRoom, detachBus, projectRoom, userRoom, workspaceRoom } from './bus.js';
import { registerActivityRealtime } from './activityEvents.js';
import { registerChatEvents } from './chatEvents.js';

/** What a connection is allowed to act as, resolved once per handshake. */
export interface SocketContext {
  userId: string;
  workspaceId: string;
  slug: string;
  permissions: string[];
}

export const contextOf = (socket: Socket): SocketContext =>
  (socket.data as { ctx: SocketContext }).ctx;

export const setContext = (socket: Socket, ctx: SocketContext): void => {
  (socket.data as { ctx: SocketContext }).ctx = ctx;
};

// Messages a client may see. Anything else becomes a generic refusal so the handshake never leaks why it failed.
const SAFE_REASONS = new Set([
  'Session expired or invalidated',
  'Not a member of this workspace',
  'Two-factor authentication required',
]);

/**
 * Same checks as `protect` + `requirePermission`: verify the JWT, confirm the database session is still
 * valid, then resolve the caller's role in the requested workspace.
 */
const authenticate = async (rawToken: unknown, rawSlug: unknown): Promise<SocketContext> => {
  const token = typeof rawToken === 'string' ? rawToken : '';
  const slug = typeof rawSlug === 'string' ? rawSlug : '';
  if (!token || !slug) throw new Error('Unauthorized');

  const decoded = jwt.verify(token, getConfig().jwtSecret) as { id?: string };
  if (!decoded?.id) throw new Error('Unauthorized');

  const session = await Session.findOne({ token: hashToken(token), isValid: true }).select('_id');
  if (!session) throw new Error('Session expired or invalidated');

  const user = await User.findById(decoded.id).select('_id twoFactor');
  if (!user) throw new Error('Unauthorized');

  const workspace = await Workspace.findOne({ slug: { $eq: slug }, 'members.user': user._id });
  if (!workspace) throw new Error('Not a member of this workspace');

  const membership = workspace.members.find(member => String(member.user) === String(user._id));
  if (!membership?.roleId) throw new Error('Unauthorized');

  const role = await Role.findById(membership.roleId);
  if (!role) throw new Error('Unauthorized');

  if (workspace.security?.require2fa && !user.twoFactor?.enabled) {
    throw new Error('Two-factor authentication required');
  }

  return {
    userId: String(user._id),
    workspaceId: String(workspace._id),
    slug,
    permissions: [...role.permissions],
  };
};

/**
 * One presence per person, not per connection: several tabs or devices count as one.
 * A periodic refresh keeps the row alive; an unclean disconnect ages out through the TTL index.
 */
const PRESENCE_REFRESH_MS = 30_000;

/** Exported for the presence unit test; behaviour is unchanged. */
export const registerPresence = (io: Server, socket: Socket, ctx: SocketContext): void => {
  const workspace = new mongoose.Types.ObjectId(ctx.workspaceId);
  const user = new mongoose.Types.ObjectId(ctx.userId);
  const key = { workspace, user };

  void ChatPresence.updateOne(
    key,
    { $inc: { connections: 1 }, $set: { seenAt: new Date() } },
    { upsert: true },
  ).catch(error => console.error('presence join error:', (error as Error).message));

  void io.to(workspaceRoom(ctx.workspaceId)).emit('chat:presence', { userId: ctx.userId, online: true });

  const refresh = setInterval(() => {
    void ChatPresence.updateOne(key, { $set: { seenAt: new Date() } })
      .catch(error => console.error('presence refresh error:', (error as Error).message));
  }, PRESENCE_REFRESH_MS);
  refresh.unref?.();

  socket.on('disconnect', async () => {
    clearInterval(refresh);
    try {
      const row = await ChatPresence.findOneAndUpdate(
        key,
        { $inc: { connections: -1 }, $set: { seenAt: new Date() } },
        { new: true },
      );
      if (!row || row.connections <= 0) {
        await ChatPresence.deleteOne(key);
        io.to(workspaceRoom(ctx.workspaceId)).emit('chat:presence', { userId: ctx.userId, online: false });
      }
    } catch (error) {
      console.error('presence leave error:', (error as Error).message);
    }
  });
};

/**
 * Attaches Socket.IO to the long-running HTTP server.
 * The Vercel entry (api/index.ts) is serverless and cannot hold a socket, so it never calls this.
 */
export const createSocketServer = (httpServer: HttpServer): Server => {
  const config = getConfig();

  const io = new Server(httpServer, {
    // The allow-list comes from validated configuration, never a literal (CON-206, spec NFR-013). It
    // shares the API's rule, so the handshake and the REST calls agree on which dev port is welcome
    cors: {
      origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) =>
        callback(null, isAllowedOrigin(origin, config.corsOrigins, { allowLoopback: !config.isProduction })),
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  // app.use(helmet()) covers normal requests; upgrade requests go straight to the engine
  io.engine.use(helmet());

  io.use(async (socket, next) => {
    try {
      const ctx = await authenticate(socket.handshake.auth?.token, socket.handshake.auth?.workspaceSlug);
      setContext(socket, ctx);
      next();
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      next(new Error(SAFE_REASONS.has(reason) ? reason : 'Unauthorized'));
    }
  });

  io.on('connection', socket => {
    const ctx = contextOf(socket);
    // Workspace and personal rooms are joined once; channel rooms are joined on demand and access-checked
    void socket.join(workspaceRoom(ctx.workspaceId));
    void socket.join(userRoom(ctx.userId));
    // Permission rooms: a restricted activity entry is emitted straight to the members who may see it
    if (ctx.permissions.includes('settings:manage')) void socket.join(auditRoom(ctx.workspaceId));
    if (ctx.permissions.includes('projects:read')) void socket.join(projectRoom(ctx.workspaceId));
    registerChatEvents(io, socket);
    registerPresence(io, socket, ctx);
  });

  attachBus(io);
  registerActivityRealtime();

  io.on('close', () => detachBus());

  return io;
};
