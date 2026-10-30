import app, { ensureReady } from './app.js';
import { getConfig } from './config/env.js';
import { createChatServer } from './realtime/socket.js';

// Local / long-running entry point. Serverless platforms import app.ts directly.
const { port, nodeEnv } = getConfig();

ensureReady()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`🚀 Server running on port ${port} (${nodeEnv})`);
    });
    // Team chat (Socket.IO) shares the HTTP server; on Vercel it runs as its own function (api/socket.ts)
    createChatServer(server, { ready: ensureReady });
  })
  .catch(error => {
    console.error('❌ Startup failed:', (error as Error).message);
    process.exit(1);
  });
