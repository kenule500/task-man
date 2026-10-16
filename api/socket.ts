// Vercel function for the team chat WebSocket (Socket.IO). It exports an http.Server; the browser
// connects to /api/socket/socket.io with transports: ['websocket'] (long polling needs sticky
// instances, which Vercel does not give). Each connection lives at most the function's maxDuration
// (vercel.json); the client reconnects and meanwhile polls the REST history. Events cross instances
// through MongoDB (@socket.io/mongo-adapter), see server/src/realtime.
import http from 'node:http';
import { ensureReady } from '../server/src/app.js';
import { createChatServer } from '../server/src/realtime/socket.js';

const server = http.createServer((_req, res) => {
  res.statusCode = 426;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ message: 'Use a WebSocket connection' }));
});

createChatServer(server, { ready: ensureReady });

export default server;
