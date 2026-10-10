import express, { Router } from 'express';

// Mounted at /api/workspaces/:slug/automations (owned by the automation module)
const router: Router = express.Router({ mergeParams: true });

export default router;
