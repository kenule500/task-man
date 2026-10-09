import app, { ensureReady } from './app.js';
import { getConfig } from './config/env.js';

// Local / long-running entry point. Serverless platforms import app.ts directly.
const { port, nodeEnv } = getConfig();

ensureReady()
  .then(() => {
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port} (${nodeEnv})`);
    });
  })
  .catch(error => {
    console.error('❌ Startup failed:', (error as Error).message);
    process.exit(1);
  });
