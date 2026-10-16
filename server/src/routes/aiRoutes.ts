import express, { Router } from 'express';

// Mounted at /api/workspaces/:slug/ai (AI code review settings and reviews; routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

export default router;
