import express, { Router } from 'express';

// Mounted at /api/workspaces/:slug/time (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

export default router;
