---
name: socket-io
description: Use when adding or changing real-time transport with Socket.IO (socket.io on the server, socket.io-client in the browser). Covers wiring the server onto the existing Express HTTP server, JWT handshake authentication, room membership, and the serverless deployment limit.
license: Apache-2.0 (project-internal skill; generated from official Socket.IO v4 documentation)
sources:
  - https://socket.io/docs/v4/server-initialization/
  - https://socket.io/docs/v4/middlewares/
---

# Socket.IO

Covers both packages: `socket.io` (server) and `socket.io-client` (browser).

**Verified versions in this repo**

| Package | Package scope | Installed |
|---|---|---|
| `socket.io` | `server` | 4.x |
| `socket.io-client` | `client` | 4.x |

Install command (from the repository root, never inside a package folder):

```bash
pnpm --filter server add socket.io
pnpm --filter client add socket.io-client
```

## Critical project constraint

`api/index.ts` re-exports the Express app into a **Vercel serverless function** (`maxDuration: 30` in `vercel.json`).
**Serverless cannot hold a WebSocket open.** Attach Socket.IO only on the long-running entry point:

- `server/src/server.ts` — long-lived (`node server/dist/server.js` on Render). Socket.IO works here.
- `api/index.ts` — serverless. Socket.IO does **not** work here.

Never assume socket availability. Every operation must remain reachable over REST so the serverless deployment keeps
working, with the socket treated as an accelerator. See `.sdrive/specs/ongoing/real-time-chat/v1/spec.md` FR-032.

## Server: attach to the existing HTTP server

Do **not** use the standalone `new Server(3000)` form — this project already has an Express app and must share its port.

```ts
// server/src/server.ts (ESM, NodeNext — note the .js extension on relative imports)
import { createServer } from 'node:http';
import app, { ensureReady } from './app.js';
import { getConfig } from './config/env.js';
import { createSocketServer } from './realtime/socket.js';

const { port, nodeEnv } = getConfig();

ensureReady().then(() => {
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);
  httpServer.listen(port, () => {
    console.log(`🚀 Server running on port ${port} (${nodeEnv})`);
  });
});
```

`app.listen()` returns an `http.Server` too, so `const httpServer = app.listen(port)` followed by
`createSocketServer(httpServer)` is equally valid — but wrap it in `createServer(app)` when you need the server
reference before listening.

## Server: JWT handshake authentication

The client passes credentials through the `auth` option; the server reads `socket.handshake.auth.token`.

```ts
// client
import { io } from 'socket.io-client';
const socket = io(getApiOrigin(), { auth: { token: getToken() } });
```

```ts
// server — a middleware runs once per connection, before "connection" fires
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  // ... validate with the SAME path the HTTP API uses, including the DB session lookup
  next();
});
```

Rules for this project:

- Validate the token with the existing auth logic — do not re-implement JWT verification.
- Look up the **database session**, so a revoked session cannot hold a socket open (spec NFR-006).
- Never trust a workspace id sent by the client; derive it from the authenticated session (CON-106).
- `next(new Error('...'))` refuses the connection and fires `connect_error` on the client. Do not leak why it failed
  in production.

## Client: connection lifecycle and errors

```ts
import { io } from 'socket.io-client';

const socket = io(origin, { auth: { token }, transports: ['websocket'], reconnection: true });

socket.on('connect', () => { /* … */ });
socket.on('connect_error', err => { /* fall back to REST polling */ });
socket.on('disconnect', reason => { /* surface degraded state */ });
```

- Always handle `connect_error` and `disconnect` — treating a socket as always-on is the failure this project's
  fallback design exists to prevent.
- The token can change after re-authentication; pass `auth` as a callback so reconnects pick up the current token:
  `io(origin, { auth: cb => cb({ token: getToken() }) })`.

## Server: rooms

```ts
io.on('connection', socket => {
  socket.join(`workspace:${workspaceId}`);
  socket.join(`channel:${channelId}`);

  socket.on('chat:send', async payload => {
    // validate payload first, then persist, then emit
    socket.to(`channel:${channelId}`).emit('chat:message', message);
  });
});
```

- Use `socket.to(room)` to emit to everyone in the room **except** the sender; use `io.to(room)` to include them.
  Echoing a sender's own message back causes duplicate rendering.
- Emit **after** the database write succeeds, never before.
- `socket.leave(room)` on channel change; do not accumulate room memberships per navigation.

## Server: Helmet on the upgrade path

`app.use(helmet())` covers normal HTTP requests but **not** the WebSocket upgrade. Socket.IO ≥ 4.6 exposes the
underlying engine so Express middleware can run on upgrade requests too:

```ts
import helmet from 'helmet';
io.engine.use(helmet());
```

Keep `helmet()` on the Express app as well. Socket.IO middlewares (`io.use`) and Express middlewares are not
interchangeable — `io.use` takes `(socket, next)`, Express takes `(req, res, next)`.

## Project conventions

- ESM with `module: NodeNext`: every relative import needs the `.js` extension (CON-102).
- Types: type the events on both ends; an untyped `emit` silently accepts anything.
- Server files live in `server/src/realtime/`; client transport lives in the owning feature module
  (`client/src/features/<feature>/hooks/`), never inline in a component.
- Add socket CORS origins from `config/env.ts`, never a string literal (CON-206, spec NFR-013).
- Production must use `wss:`. The client CSP `connect-src` in `vercel.json` currently allows `'self'` only and will
  **block** the socket outright until that origin is added.

## Common pitfalls

| Pitfall | Consequence |
|---|---|
| Treating a socket as reliable | Events are silently lost while disconnected. Replay from a cursor on reconnect. |
| Emitting to `io` instead of a room | Every connected client in the workspace receives every message — a data leak across channels. |
| Filtering permissions per request only | With push, filtering must happen per socket audience, or restricted events reach the wrong client. |
| `next()` never called in a middleware | The connection hangs until it times out. |
| Assuming `app.use(helmet())` covers upgrades | The upgrade request bypasses Express middleware unless `io.engine.use()` is used. |
| Adding socket.io to the serverless entry | It cannot work; the connection will fail in production on Vercel. |
