import mongoose from 'mongoose';
import { Emitter } from '@socket.io/mongo-emitter';
import type { Server } from 'socket.io';

// Delivers a realtime event to every socket in some rooms, wherever that socket is connected.
//
// - Where a Socket.IO server runs in this process (local dev, tests, the socket function), the event goes
//   through it; its MongoDB adapter (when active) forwards it to other instances.
// - A plain REST function (Vercel) has no server, so it writes the event to the capped collection the
//   adapters of the socket instances tail (@socket.io/mongo-emitter).
// Delivery is best effort and never throws: clients also poll the REST history when their socket is down.

export const EVENTS_COLLECTION = 'socket_io_events';
const EVENTS_COLLECTION_BYTES = 2 * 1024 * 1024;

let local: Server | null = null;

/** Registers (or clears) the Socket.IO server living in this process. */
export const setLocalServer = (server: Server | null): void => {
  local = server;
};

let backplane: Promise<boolean> | null = null;

/**
 * Whether other instances can be reached through MongoDB: the adapter uses change streams, which need a
 * replica set (Atlas always is one). A standalone database (local dev, CI) stays single instance.
 */
export const hasBackplane = (): Promise<boolean> => {
  // Not connected yet: answer without remembering it
  if (!mongoose.connection.db) return Promise.resolve(false);
  backplane ??= (async () => {
    try {
      const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
      return Boolean(hello.setName) || hello.msg === 'isdbgrid';
    } catch {
      return false;
    }
  })();
  return backplane;
};

let collectionReady: Promise<void> | null = null;

/** The capped collection events travel through (created once; "already exists" is fine). */
export const eventsCollection = async () => {
  const db = mongoose.connection.db!;
  collectionReady ??= db
    .createCollection(EVENTS_COLLECTION, { capped: true, size: EVENTS_COLLECTION_BYTES })
    .then(() => undefined, (error: { code?: number }) => {
      if (error?.code === 48) return; // NamespaceExists
      collectionReady = null;
      throw error;
    });
  await collectionReady;
  return db.collection(EVENTS_COLLECTION);
};

/** Sends `event` with `payload` to the given rooms. */
export const emitToRooms = async (rooms: string[], event: string, payload: unknown): Promise<void> => {
  if (rooms.length === 0) return;
  try {
    if (local) {
      local.to(rooms).emit(event, payload);
      return;
    }
    if (mongoose.connection.readyState !== 1 || !(await hasBackplane())) return;
    new Emitter(await eventsCollection()).to(rooms).emit(event, payload);
  } catch (error) {
    console.error('realtime emit error:', (error as Error).message);
  }
};

/** Room names, in one place so the socket server and the REST handlers agree. */
export const rooms = {
  workspace: (id: unknown) => `ws:${String(id)}`,
  channel: (id: unknown) => `channel:${String(id)}`,
  user: (id: unknown) => `user:${String(id)}`,
};
