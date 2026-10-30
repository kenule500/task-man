import express, { NextFunction, Request, Response, Router } from 'express';
import Workspace from '../models/workspaceModel.js';
import { protect } from '../middleware/authMiddleware.js';
import workspaceRoutes from './workspaceRoutes.js';

// /api/tasks — the task API of the signed-in user's active workspace.
// Tasks live in workspaces (/api/workspaces/:slug/tasks); this alias resolves the slug and hands the
// request to the same routes, so permissions, validation and responses are identical.
const router: Router = express.Router();

router.use(protect);

router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;
    const active = req.user?.activeWorkspace
      ? await Workspace.findOne({ _id: req.user.activeWorkspace, 'members.user': userId }).select('slug').lean()
      : null;
    const workspace = active
      ?? await Workspace.findOne({ 'members.user': userId }).sort({ createdAt: 1 }).select('slug').lean();

    if (!workspace) {
      res.status(404).json({ message: 'Create or join a workspace first' });
      return;
    }

    // req.url is relative to /api/tasks and keeps the query string
    req.url = `/${encodeURIComponent(workspace.slug)}/tasks${req.url}`;
    workspaceRoutes(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
