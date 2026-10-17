import { createServer } from 'node:http';
import app, { ensureReady } from './app.js';
import { getConfig } from './config/env.js';
import { createSocketServer } from './realtime/socket.js';

// Local / long-running entry point. Serverless platforms import app.ts directly, and cannot host a socket.
const { port, nodeEnv } = getConfig();

ensureReady()
  .then(() => {
    const httpServer = createServer(app);
    createSocketServer(httpServer);

    httpServer.listen(port, () => {
      console.log(`🚀 Server running on port ${port} (${nodeEnv})`);
    });
  })
  .catch(error => {
    console.error('❌ Startup failed:', (error as Error).message);
    process.exit(1);
  });
