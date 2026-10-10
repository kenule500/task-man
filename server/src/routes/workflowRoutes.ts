import express, { Router } from 'express';

// Mounted at /api/workspaces/:slug/workflow (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

export default router;
