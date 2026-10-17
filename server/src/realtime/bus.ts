import type { Server } from 'socket.io';

/**
 * Lets controllers broadcast without importing the socket server, which would create a cycle
 * (socket -> chat events -> controllers -> socket).
 */
let io: Server | null = null;

export const attachBus = (server: Server): void => {
  io = server;
};

export const detachBus = (): void => {
  io = null;
};

export const channelRoom = (channelId: string): string => `channel:${channelId}`;
export const workspaceRoom = (workspaceId: string): string => `workspace:${workspaceId}`;
export const userRoom = (userId: string): string => `user:${userId}`;
// Permission-scoped rooms, so a restricted entry is emitted once instead of being filtered per socket
export const auditRoom = (workspaceId: string): string => `workspace:${workspaceId}:audit`;
export const projectRoom = (workspaceId: string): string => `workspace:${workspaceId}:projects`;

export const emitToRoom = (room: string, event: string, payload: unknown): void => {
  io?.to(room).emit(event, payload);
};

export const emitToChannel = (channelId: string, event: string, payload: unknown): void => {
  io?.to(channelRoom(channelId)).emit(event, payload);
};

/** Everyone in the channel except one connection (the sender, so their own message is not echoed twice). */
export const emitToChannelExcept = (
  channelId: string,
  exceptSocketId: string,
  event: string,
  payload: unknown,
): void => {
  io?.to(channelRoom(channelId)).except(exceptSocketId).emit(event, payload);
};

export const emitToWorkspace = (workspaceId: string, event: string, payload: unknown): void => {
  io?.to(workspaceRoom(workspaceId)).emit(event, payload);
};

export const emitToUser = (userId: string, event: string, payload: unknown): void => {
  io?.to(userRoom(userId)).emit(event, payload);
};

export const isBusAttached = (): boolean => io !== null;
