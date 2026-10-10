import express, { Router } from 'express';

// Mounted at /api/workspaces/:slug/webhooks (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

export default router;
