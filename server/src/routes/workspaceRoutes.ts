import express, { Router } from 'express';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspaceBySlug,
  switchWorkspace,
  joinWorkspace,
} from '../controllers/workspaceController.js';
import { protect } from '../middleware/authMiddleware.js';
import taskRoutes from './taskRoutes.js';

const router: Router = express.Router();

router.post('/', protect, createWorkspace);
router.get('/', protect, getMyWorkspaces);
router.get('/:slug', protect, getWorkspaceBySlug);
router.put('/:slug/activate', protect, switchWorkspace);
router.post('/join', protect, joinWorkspace);

// Workspace-scoped tasks
router.use('/:slug/tasks', taskRoutes);

export default router;